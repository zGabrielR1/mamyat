"""HTTP surface: a small stdlib server in front of :class:`api.app.App`.

The frontend usually lives on Vercel and reaches this process through a
rewrite, but the same binary can also serve a built static site from
``web/out`` — useful for a single-container preview or a LAN test.

Every route calls one App method. Validation lives there; this file only
parses, authenticates, rates-limits and serializes.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import threading
import time
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from .app import App, AppConfig, ApiError
from .betterauth_proxy import BetterAuthProxy

MAX_BODY = 1_000_000
CORS_ORIGINS = tuple(origin.strip() for origin in
                     os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip())


class RateLimiter:
    """A per-key sliding window. Good enough for one process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = time.time()
        with self._lock:
            hits = [stamp for stamp in self._hits.get(key, []) if stamp > now - window]
            if len(hits) >= limit:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            if len(self._hits) > 5000:
                self._hits = {k: v for k, v in self._hits.items() if v and v[-1] > now - 3600}
            return True


class Handler(BaseHTTPRequestHandler):
    server_version = "mamyat/0.1"
    protocol_version = "HTTP/1.1"
    app: App
    limiter: RateLimiter
    web_dir: str = ""

    # -- plumbing ----------------------------------------------------
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[mamyat] %s %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes = b"", *,
              content_type: str = "application/json; charset=utf-8",
              extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cache-Control", "no-store" if content_type.startswith("application/json")
                         else "public, max-age=300")
        origin = self.headers.get("Origin", "")
        if origin and (not CORS_ORIGINS or origin in CORS_ORIGINS):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers",
                             "Content-Type, Authorization, X-Customer-Token, "
                             "X-Admin-Token, X-Bridge-Signature")
            self.send_header("Access-Control-Allow-Methods",
                             "GET, POST, PATCH, DELETE, OPTIONS")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD" and body:
            self.wfile.write(body)

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False,
                          default=str).encode("utf-8")
        self._send(status, body)

    def _error(self, exc: ApiError) -> None:
        self._json(exc.status, {"error": exc.message, "code": exc.code})

    def _send_upstream(self, status: int, headers: list[tuple[str, str]],
                       body: bytes) -> None:
        """Render a proxied response, preserving repeated Set-Cookie headers."""
        self.send_response(status)
        for key, value in headers:
            if key.lower() in {"content-length", "connection", "transfer-encoding",
                               "date", "server"}:
                continue
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.end_headers()
        if self.command != "HEAD" and body:
            self.wfile.write(body)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "corpo inválido", "bad_body") from None
        if length > MAX_BODY:
            raise ApiError(413, "corpo grande demais", "too_large")
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise ApiError(400, "JSON inválido", "bad_json") from exc
        if not isinstance(parsed, dict):
            raise ApiError(400, "envie um objeto JSON", "bad_json")
        return parsed

    def _raw_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "corpo inválido", "bad_body") from None
        if length > MAX_BODY:
            raise ApiError(413, "corpo grande demais", "too_large")
        return self.rfile.read(length) if length else b""

    def _customer(self) -> dict | None:
        token = (self.headers.get("X-Customer-Token") or "").strip()
        if not token:
            auth = (self.headers.get("Authorization") or "").strip()
            if auth.lower().startswith("bearer "):
                candidate = auth[7:].strip()
                if candidate.startswith("ms1."):
                    token = candidate
        if not token:
            return None
        return self.app.accounts.authenticate(token)

    def _require_customer(self) -> dict:
        customer = self._customer()
        if not customer:
            raise ApiError(401, "entre na sua conta para continuar", "unauthorized")
        return customer

    def _client_ip(self) -> str:
        forwarded = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        return forwarded or self.client_address[0]

    def _limit(self, bucket: str, limit: int, window: int) -> None:
        if not self.limiter.allow(f"{bucket}:{self._client_ip()}", limit, window):
            raise ApiError(429, "muitas tentativas; espere um pouco", "rate_limited")

    # -- verbs -------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    # -- routing -----------------------------------------------------
    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        try:
            if path.startswith("/api/"):
                self._api(method, path, query)
            elif path == "/api":
                self._json(200, {"service": "mamyat", "docs": "/api/health"})
            else:
                self._static(path)
        except ApiError as exc:
            self._error(exc)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            traceback.print_exc()
            self._json(500, {"error": "algo deu errado; tente de novo",
                             "code": "internal"})

    def _api(self, method: str, path: str, query: dict) -> None:
        app = self.app
        parts = [part for part in path.split("/") if part][1:]  # drop "api"
        head = parts[0] if parts else ""

        # health / config -------------------------------------------------
        if method == "GET" and path == "/api/health":
            return self._json(200, app.health())
        if method == "GET" and path == "/api/config":
            return self._json(200, app.public_config())

        # catalog ---------------------------------------------------------
        if method == "GET" and path == "/api/products":
            return self._json(200, app.list_products(query))
        if method == "GET" and len(parts) == 2 and parts[0] == "products":
            return self._json(200, app.get_product(parts[1]))

        # cart / orders ---------------------------------------------------
        if method == "POST" and path == "/api/cart/quote":
            self._limit("quote", 120, 60)
            return self._json(200, app.quote(self._body()))
        if method == "POST" and path == "/api/orders":
            self._limit("checkout", 30, 3600)
            return self._json(201, app.create_order(
                self._body(), customer=self._customer(), remote_ip=self._client_ip()))
        if method == "GET" and path == "/api/orders":
            customer = self._require_customer()
            return self._json(200, app.my_orders(customer))
        if len(parts) >= 2 and parts[0] == "orders" and parts[1] != "lookup":
            number = parts[1]
            if method == "GET":
                return self._json(200, app.get_order(
                    number, customer=self._customer(),
                    email=str(query.get("email") or "")))
            if method == "POST" and len(parts) == 3 and parts[2] == "cancel":
                body = self._body()
                return self._json(200, app.cancel_order(
                    number, customer=self._customer(),
                    email=str(body.get("email") or query.get("email") or "")))
            if method == "POST" and len(parts) == 3 and parts[2] == "pay":
                body = self._body()
                return self._json(200, app.retry_payment(
                    number, customer=self._customer(),
                    email=str(body.get("email") or "")))

        # Asaas webhook ---------------------------------------------------
        if method == "POST" and path == "/api/webhooks/asaas":
            payload = self._body()
            headers = {key: value for key, value in self.headers.items()}
            return self._json(200, app.webhook_asaas(headers, payload))

        # auth ------------------------------------------------------------
        if method == "POST" and path == "/api/auth/signup":
            self._limit("signup", 10, 3600)
            return self._json(201, app.signup(self._body(), remote_ip=self._client_ip()))
        if method == "POST" and path == "/api/auth/login":
            self._limit("login", 20, 300)
            return self._json(200, app.login(self._body(), remote_ip=self._client_ip()))
        if method == "POST" and path == "/api/auth/logout":
            token = (self.headers.get("X-Customer-Token") or "").strip()
            return self._json(200, app.logout(token))
        if method == "GET" and path == "/api/auth/me":
            return self._json(200, app.me(self._require_customer()))
        if method == "PATCH" and path == "/api/auth/me":
            return self._json(200, app.update_profile(
                self._require_customer(), self._body()))
        if method == "POST" and path == "/api/auth/password":
            return self._json(200, app.change_password(
                self._require_customer(), self._body()))
        if method == "POST" and path == "/api/auth/password/request":
            self._limit("reset", 6, 3600)
            return self._json(200, app.request_password_reset(
                self._body(), remote_ip=self._client_ip()))
        if method == "POST" and path == "/api/auth/password/reset":
            return self._json(200, app.complete_password_reset(self._body()))
        if method == "POST" and path == "/api/auth/social/bridge":
            signature = self.headers.get("X-Bridge-Signature", "")
            return self._json(200, app.social_bridge(self._raw_body(), signature))
        if method == "POST" and path == "/api/auth/social/exchange":
            return self._json(200, app.social_exchange(self._body()))

        # CEP / contact ---------------------------------------------------
        if method == "GET" and len(parts) == 2 and parts[0] == "cep":
            self._limit("cep", 60, 60)
            return self._json(200, app.lookup_cep(parts[1]))
        if method == "POST" and path == "/api/contact":
            self._limit("contact", 5, 3600)
            return self._json(201, app.contact(self._body(),
                                               remote_ip=self._client_ip()))

        # social sign-in sidecar ------------------------------------------
        if path.startswith("/api/betterauth/"):
            self._limit("betterauth", 120, 60)
            return self._betterauth(method)

        # admin -----------------------------------------------------------
        if head == "admin":
            return self._admin(method, parts[1:], query)

        raise ApiError(404, "rota não encontrada", "not_found")

    def _betterauth(self, method: str) -> None:
        if method not in {"GET", "POST", "PATCH", "DELETE"}:
            raise ApiError(405, "método não permitido", "method_not_allowed")
        base = str(self.app.env.get("BETTER_AUTH_INTERNAL_URL") or
                   "http://127.0.0.1:3100")
        proxy = BetterAuthProxy(base)
        body = b"" if method in {"GET", "DELETE"} and not self.headers.get("Content-Length") else self._raw_body()
        headers = {key: value for key, value in self.headers.items()}
        try:
            status, answer_headers, payload = proxy.forward(
                method, self.path, headers, body, client_ip=self._client_ip())
        except ApiError:
            if self.path.startswith("/api/betterauth/providers") or \
                    self.path.startswith("/api/betterauth/health"):
                return self._json(200, {"enabled": False, "providers": [],
                                        "providers_configured": []})
            raise
        return self._send_upstream(status, answer_headers, payload)

    def _admin(self, method: str, parts: list[str], query: dict) -> None:
        app = self.app
        if method == "POST" and parts == ["login"]:
            self._limit("admin-login", 10, 300)
            return self._json(200, app.admin_login(self._body()))
        admin, token = self._admin_auth()
        if method == "POST" and parts == ["logout"]:
            return self._json(200, app.admin_logout(token))
        if method == "GET" and parts == ["me"]:
            return self._json(200, {"admin": {
                "id": admin["id"], "username": admin["username"],
                "role": admin.get("role", "viewer")}})
        if method == "POST" and parts == ["password"]:
            return self._json(200, app.admin_change_password(admin, self._body()))
        if method == "GET" and parts == ["dashboard"]:
            return self._json(200, app.admin_dashboard())
        if parts == ["products"]:
            if method == "GET":
                return self._json(200, app.admin_products())
            if method == "POST":
                return self._json(201, app.admin_create_product(self._body()))
        if len(parts) == 2 and parts[0] == "products":
            if method == "PATCH":
                return self._json(200, app.admin_update_product(parts[1], self._body()))
            if method == "DELETE":
                return self._json(200, app.admin_archive_product(parts[1]))
        if parts == ["orders"] and method == "GET":
            return self._json(200, app.admin_orders(query))
        if len(parts) >= 2 and parts[0] == "orders":
            number = parts[1]
            if method == "GET" and len(parts) == 2:
                return self._json(200, app.admin_order(number))
            if method == "POST" and len(parts) == 3 and parts[2] == "status":
                return self._json(200, app.admin_set_status(number, self._body()))
            if method == "POST" and len(parts) == 3 and parts[2] == "paid":
                return self._json(200, app.admin_mark_paid(number, self._body()))
        if parts == ["settings"]:
            if method == "GET":
                return self._json(200, app.admin_settings())
            if method == "PATCH":
                return self._json(200, app.admin_update_settings(self._body()))
        if parts == ["categories"]:
            if method == "GET":
                return self._json(200, app.admin_categories())
            if method == "POST":
                return self._json(201, app.admin_create_category(self._body()))
        if len(parts) == 2 and parts[0] == "categories":
            if method == "PATCH":
                return self._json(200, app.admin_rename_category(
                    parts[1], self._body()))
            if method == "DELETE":
                return self._json(200, app.admin_delete_category(parts[1]))
        if parts == ["customers"]:
            if method == "GET":
                return self._json(200, app.admin_customers(query))
            if method == "POST":
                return self._json(201, app.admin_create_customer(self._body()))
        if len(parts) >= 2 and parts[0] == "customers":
            customer_id = parts[1]
            if method == "GET" and len(parts) == 2:
                return self._json(200, app.admin_customer(customer_id))
            if method == "PATCH" and len(parts) == 2:
                return self._json(200, app.admin_update_customer(
                    customer_id, self._body()))
            if method == "DELETE" and len(parts) == 2:
                return self._json(200, app.admin_delete_customer(customer_id))
            if method == "POST" and len(parts) == 3 and parts[2] == "reset":
                return self._json(200, app.admin_reset_customer_password(
                    customer_id))
        if parts == ["contacts"] and method == "GET":
            return self._json(200, app.admin_contacts())
        raise ApiError(404, "rota do painel não encontrada", "not_found")

    def _admin_auth(self) -> tuple[dict, str]:
        token = (self.headers.get("X-Admin-Token") or "").strip()
        if not token:
            auth = (self.headers.get("Authorization") or "").strip()
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
        if not token:
            raise ApiError(401, "entre novamente no painel", "unauthorized")
        return self.app.require_admin(token), token

    # -- static ------------------------------------------------------
    def _static(self, path: str) -> None:
        if not self.web_dir:
            return self._json(200, {
                "service": "mamyat",
                "message": "API no ar. O site é servido pelo Vercel; "
                           "use /api/health para monitorar.",
            })
        if path in ("/", ""):
            path = "/index.html"
        root = os.path.realpath(self.web_dir)
        candidate = os.path.realpath(os.path.join(root, path.lstrip("/")))
        if not candidate.startswith(root + os.sep) and candidate != root:
            raise ApiError(403, "caminho inválido", "forbidden")
        if not os.path.isfile(candidate):
            if "." in os.path.basename(candidate):
                raise ApiError(404, "arquivo não encontrado", "not_found")
            candidate = os.path.join(root, "index.html")
            if not os.path.isfile(candidate):
                raise ApiError(404, "site não encontrado", "not_found")
        extension = os.path.splitext(candidate)[1].lower()
        content_type = {
            ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
            ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
            ".csv": "text/csv; charset=utf-8",
        }.get(extension, "application/octet-stream")
        try:
            with open(candidate, "rb") as handle:
                body = handle.read()
        except OSError as exc:
            raise ApiError(404, "arquivo não encontrado", "not_found") from exc
        self._send(200, body, content_type=content_type)


def build_server(app: App, host: str = "0.0.0.0", port: int = 8080,
                 web_dir: str = "") -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {
        "app": app, "limiter": RateLimiter(), "web_dir": web_dir,
    })
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mamy Ateliê backend")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int,
                        default=int(os.environ.get("PORT", "8080")))
    parser.add_argument("--web-dir", default=os.environ.get("WEB_DIR", ""))
    parser.add_argument("--data-dir", default=os.environ.get("DATA_DIR", ""))
    args = parser.parse_args(argv)
    config = AppConfig.from_environment()
    if args.data_dir:
        config.data_dir = args.data_dir
    app = App(config)
    if app.accounts.default_admin:
        print("[mamyat] ATENÇÃO: senha inicial do painel ainda não foi trocada.")
    if getattr(app.payments, "name", "") == "demo":
        print("[mamyat] pagamentos em MODO DEMONSTRAÇÃO (sem ASAAS_API_KEY).")
    server = build_server(app, args.host, args.port, args.web_dir)
    print(f"[mamyat] ouvindo em http://{args.host}:{args.port} "
          f"(dados em {config.data_dir})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[mamyat] encerrando")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
