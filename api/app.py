"""The application: stores, services and every surface the HTTP layer calls.

Keeping this class free of ``http.server`` is deliberate — the server module is
a thin router, and the tests drive this object directly. Nothing here trusts a
browser price, a browser total, or the page that says a payment succeeded.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from foundry.auth import PasswordError, PasswordHasher, PasswordPolicy
from foundry.betterauth import BridgeError, verify_bridge
from foundry.envfile import load_env
from foundry.mail import Message, resolve_mailer, wrap_html
from foundry.turnstile import resolve_verifier

from . import __version__
from .accounts import AccountError, Accounts, generate_password
from .asaas import AsaasError, resolve_payments, resolve_webhook
from .catalog import (ALLOWED_CATEGORIES, Catalog, CatalogError,
                      clean_categories)
from .db import make_store
from .money import MoneyError, brl, brl_with_symbol, to_cents
from .orders import OrderError, Orders, STATUSES, STATUS_LABELS
from .sessions import SessionRegistry, resolve_customer_sessions
from .store import now_iso
from .validation import FieldError, clean_text, validate_email, validate_cep

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_SETTINGS = {
    "store_name": "Mamy Ateliê",
    "tagline": "Feito à mão, feito para durar.",
    "announcement": "Frete grátis acima de R$ 250 · Encomendas com carinho",
    "email": "taynaramelo45@gmail.com",
    "whatsapp": "+55 47 99666-9607",
    "instagram": "@atelieda_mamy",
    "cnpj": "40.239.348/0001-50",
    "city": "São Paulo · SP",
    "shipping_flat_minor": 1800,
    "free_shipping_minor": 25000,
    "pickup_enabled": True,
    "delivery_days": "3 a 7 dias úteis",
    "pickup_address": "Retirada combinada com o ateliê, São Paulo/SP",
    "categories": list(ALLOWED_CATEGORIES),
    "coupons": {
        "BEMVINDA10": {"type": "percent", "value": 10, "active": True,
                       "min_minor": 10000, "label": "Boas-vindas · 10%"},
        "FRETEGRATIS": {"type": "fixed", "value": "18,00", "active": True,
                        "min_minor": 15000, "label": "Frete grátis"},
    },
}

ALLOWED_SETTING_KEYS = frozenset(DEFAULT_SETTINGS)
SOCIAL_ACTIONS = {"signup", "login", "checkout", "contact", "reset"}


def normalise_cnpj(value: object) -> str:
    """Digits only, formatted. Empty stays empty; a short value is refused."""
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        return ""
    if len(digits) != 14:
        raise ValueError("CNPJ deve ter 14 dígitos")
    return (f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/"
            f"{digits[8:12]}-{digits[12:]}")


class ApiError(Exception):
    """An error the HTTP layer can render without leaking internals."""

    def __init__(self, status: int, message: str, code: str = "") -> None:
        super().__init__(message)
        self.status = int(status)
        self.message = message
        self.code = code or "error"


@dataclass
class AppConfig:
    data_dir: str = field(default_factory=lambda: os.path.join(BASE_DIR, "data", "runtime"))
    seed_path: str = field(default_factory=lambda: os.path.join(BASE_DIR, "data", "seed", "products.json"))
    env: dict[str, str] = field(default_factory=dict)
    env_files: tuple[str, ...] = (".env", ".env.local", ".env.resend",
                                  ".env.turnstile", ".env.asaas", ".env.betterauth")
    login_delay: float = 0.12
    gate_signup: bool = True

    @classmethod
    def from_environment(cls, *, base_dir: str = BASE_DIR,
                         env: dict[str, str] | None = None) -> "AppConfig":
        if env is None:
            merged: dict[str, str] = {}
            for name in (".env", ".env.local", ".env.resend", ".env.turnstile",
                         ".env.asaas", ".env.betterauth"):
                merged.update(load_env(os.path.join(base_dir, name)))
            merged.update(os.environ)
            env = merged
        data_dir = env.get("DATA_DIR") or os.path.join(base_dir, "data", "runtime")
        if not os.path.isabs(data_dir):
            data_dir = os.path.join(base_dir, data_dir)
        return cls(data_dir=data_dir,
                   seed_path=os.path.join(base_dir, "data", "seed", "products.json"),
                   env=dict(env),
                   login_delay=float(env.get("LOGIN_DELAY", "0.12") or 0))


class App:
    """One shop: catalog, orders, accounts, payments, mail, captcha."""

    def __init__(self, config: AppConfig | None = None, *,
                 mailer=None, verifier=None, payments=None,
                 clock=None) -> None:
        self.config = config or AppConfig.from_environment()
        self.env = dict(self.config.env)
        self.clock = clock or time.time
        os.makedirs(self.config.data_dir, exist_ok=True)
        database_url = str(self.env.get("DATABASE_URL") or "").strip()
        self.storage = "postgres" if database_url else "json"

        def store(name: str, default):
            return make_store(name, default, data_dir=self.config.data_dir,
                              database_url=database_url)

        self.products_store = store("products", [])
        self.orders_store = store("orders", [])
        self.customers_store = store("customers", [])
        self.admins_store = store("admins", [])
        self.admin_sessions_store = store("admin_sessions", {})
        self.resets_store = store("password_resets", [])
        self.oauth_store = store("oauth_links", {})
        self.settings_store = store("settings", dict(DEFAULT_SETTINGS))
        self.reservations_store = store("reservations", {})
        self.contacts_store = store("contacts", [])
        data = lambda name: os.path.join(self.config.data_dir, name)

        self.hasher = PasswordHasher(policy=PasswordPolicy(
            min_length=8, require_digit=True, require_letter=True,
            max_length=128))
        sessions = resolve_customer_sessions(self.env, self.config.data_dir)
        self.registry = SessionRegistry(data("customer_sessions.json"))
        admin_username = self.env.get("ADMIN_USERNAME") or "admin"
        admin_password = str(self.env.get("ADMIN_PASSWORD") or "")
        generated = not (len(admin_password) >= 8)
        if generated:
            password_file = data("admin_initial_password.txt")
            if os.path.isfile(password_file):
                with open(password_file, "r", encoding="utf-8") as handle:
                    admin_password = handle.read().strip()
            if not self._password_ok(admin_password):
                admin_password = generate_password()
                with open(password_file, "w", encoding="utf-8") as handle:
                    handle.write(admin_password + "\n")
                try:
                    os.chmod(password_file, 0o600)
                except OSError:
                    pass
                print(f"[mamyat] senha inicial do painel ({admin_username}): "
                      f"{admin_password}  — arquivo {password_file}")
        self.accounts = Accounts(
            self.customers_store, self.admins_store, self.admin_sessions_store,
            self.resets_store, self.oauth_store, sessions, self.registry,
            self.hasher, clock=self.clock,
            login_delay=self.config.login_delay,
            seed_admin=(admin_username, admin_password, generated))
        self.catalog = Catalog(self.products_store, self.reservations_store,
                               categories=self.categories, clock=self.clock)
        payments = payments if payments is not None else resolve_payments(self.env)[0]
        self.payments = payments
        self.orders = Orders(self.orders_store, self.catalog, self.settings_store,
                             payments=payments, clock=self.clock)
        self.mailer = mailer if mailer is not None else resolve_mailer(
            env=self.env, env_file=os.path.join(BASE_DIR, ".env.resend"))
        self.verifier = verifier if verifier is not None else resolve_verifier(
            env=self.env, env_file=os.path.join(BASE_DIR, ".env.turnstile"))
        self.bridge_secret = str(self.env.get("BETTER_AUTH_BRIDGE_SECRET") or "")
        self.turnstile_site_key = str(self.env.get("TURNSTILE_SITE_KEY") or "")
        self._cep_cache: dict[str, tuple[float, dict]] = {}
        self._cep_lock = threading.Lock()
        self._seed_settings()
        self._seed_products()

    # -- boot --------------------------------------------------------
    def _password_ok(self, password: str) -> bool:
        try:
            self.hasher.policy.validate(password)
            return True
        except PasswordError:
            return False

    def _seed_settings(self) -> None:
        current = self.settings_store.read()
        changed = False
        for key, value in DEFAULT_SETTINGS.items():
            if key not in current:
                current[key] = value
                changed = True
        if changed:
            self.settings_store.write(current)

    def _seed_products(self) -> None:
        if self.products_store.read():
            return
        path = self.config.seed_path
        if not os.path.isfile(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as handle:
                rows = json.load(handle)
        except (OSError, ValueError):
            return
        if not isinstance(rows, list):
            return
        created = []
        for row in rows:
            try:
                created.append(self.catalog.create(row))
            except (CatalogError, FieldError, ValueError):
                continue
        if created:
            print(f"[mamyat] catálogo inicial: {len(created)} produtos")

    # -- captcha -----------------------------------------------------
    def _gate(self, token: str, action: str, remote_ip: str = "") -> None:
        if not self.verifier.enabled:
            return
        if not str(token or "").strip():
            raise ApiError(400, "confirme o captcha para continuar",
                           "captcha_required")
        try:
            self.verifier.verify(str(token), action=action, remote_ip=remote_ip)
        except Exception as exc:
            raise ApiError(400, "captcha inválido ou expirado; tente de novo",
                           "captcha_failed") from exc

    # -- mail --------------------------------------------------------
    def _send(self, *, to: str, subject: str, html: str, text: str,
              key: str = "") -> bool:
        try:
            result = self.mailer.send(
                Message(to=to, subject=subject, html=html, text=text,
                        from_name=self.settings_store.read().get("store_name",
                                                                "Mamy Ateliê")),
                idempotency_key=key)
            return bool(getattr(result, "ok", True))
        except Exception as exc:
            print(f"[mamyat] email não enviado ({subject}): {exc}")
            return False

    def _brand_html(self, title: str, body: str) -> str:
        return wrap_html(
            title=title,
            body=(f"<div style=\"font-family:Georgia,serif;color:#3d2b24\">"
                  f"<h1 style=\"font-size:22px;margin:0 0 16px\">{title}</h1>"
                  f"{body}</div>"),
            footer="Mamy Ateliê · feito à mão, feito para durar.")

    def send_welcome(self, customer: dict) -> None:
        html = self._brand_html(
            f"Bem-vinda, {customer['name'].split(' ')[0]}",
            "<p>Sua conta no Mamy Ateliê está pronta.</p>"
            "<p>Quando quiser, é só voltar à loja — suas sacolas e encomendas "
            "ficam guardadas no seu nome.</p>"
            f"<p style=\"color:#8a6a5b\">Seu nome de usuário: "
            f"<strong>{customer['username']}</strong></p>")
        self._send(to=customer["email"], subject="Sua conta no Mamy Ateliê",
                   html=html, text=f"Bem-vinda, {customer['name']}!\n"
                   f"Seu usuário: {customer['username']}\n",
                   key=f"welcome:{customer['id']}")

    def send_reset(self, customer: dict, token: str) -> None:
        base = self.env.get("PUBLIC_BASE_URL", "https://mamyatelie.com").rstrip("/")
        link = f"{base}/conta/redefinir?token={urllib.parse.quote(token)}"
        html = self._brand_html(
            "Redefinir sua senha",
            f"<p>Recebemos um pedido para redefinir a senha de "
            f"<strong>{customer['email']}</strong>.</p>"
            f"<p><a href=\"{link}\" style=\"background:#3d2b24;color:#fff;"
            f"padding:12px 20px;border-radius:999px;text-decoration:none\">"
            f"Criar nova senha</a></p>"
            "<p>O link vale por 30 minutos. Se não foi você, ignore este email.</p>")
        self._send(to=customer["email"], subject="Redefinir sua senha · Mamy Ateliê",
                   html=html, text=f"Redefina sua senha: {link}\n",
                   key=f"reset:{customer['id']}:{int(self.clock())}")

    def _order_items_text(self, order: dict) -> str:
        return "\n".join(
            f"{item['qty']}x {item['name']} ({item['variant_name']}) — "
            f"R$ {brl(item['line_total_minor'])}"
            for item in order.get("items", []))

    def _order_items_html(self, order: dict) -> str:
        rows = "".join(
            f"<tr><td style=\"padding:6px 0\">{item['qty']}x {item['name']}"
            f"<br><small style=\"color:#8a6a5b\">{item['variant_name']}</small></td>"
            f"<td align=\"right\">R$ {brl(item['line_total_minor'])}</td></tr>"
            for item in order.get("items", []))
        return (f"<table width=\"100%\" cellspacing=\"0\">{rows}"
                f"<tr><td style=\"padding-top:8px\">Entrega</td>"
                f"<td align=\"right\">R$ {brl(order['shipping_minor'])}</td></tr>"
                f"<tr><td><strong>Total</strong></td>"
                f"<td align=\"right\"><strong>R$ {brl(order['total_minor'])}"
                f"</strong></td></tr></table>")

    def send_order_created(self, order: dict) -> None:
        payment = order.get("payment") or {}
        pix = payment.get("qr_code") or ""
        html = self._brand_html(
            f"Pedido {order['number']} recebido",
            f"<p>Oi, {order['name'].split(' ')[0]}! Seu pedido foi guardado.</p>"
            f"{self._order_items_html(order)}"
            f"<p>Para confirmar, pague o Pix de "
            f"<strong>R$ {brl(order['total_minor'])}</strong>"
            + (f" com o código abaixo:</p><pre style=\"white-space:pre-wrap;"
               f"background:#f6efe9;padding:12px;border-radius:8px\">{pix}</pre>"
               if pix else ". O código Pix está na página do pedido.</p>")
            + f"<p style=\"color:#8a6a5b\">Pedido {order['number']} · "
              f"acompanhe em /pedido/{order['number']}</p>")
        self._send(to=order["email"], subject=f"Pedido {order['number']} · Mamy Ateliê",
                   html=html, text=f"Pedido {order['number']}\n"
                   f"{self._order_items_text(order)}\nTotal: R$ {brl(order['total_minor'])}\n"
                   f"Pix: {pix}\n", key=f"order-created:{order['number']}")

    def send_order_paid(self, order: dict) -> None:
        html = self._brand_html(
            f"Pagamento confirmado · {order['number']}",
            f"<p>Recebemos o Pix do pedido <strong>{order['number']}</strong>. "
            "Já está na fila do ateliê.</p>"
            f"{self._order_items_html(order)}"
            f"<p style=\"color:#8a6a5b\">Prazo: {order.get('delivery_days', '')}</p>")
        self._send(to=order["email"], subject=f"Pagamento confirmado · {order['number']}",
                   html=html, text=f"Recebemos o pagamento do pedido {order['number']}.\n",
                   key=f"order-paid:{order['number']}")

    def send_order_shipped(self, order: dict) -> None:
        tracking = order.get("tracking_code") or ""
        html = self._brand_html(
            f"Seu pedido saiu · {order['number']}",
            "<p>Embalado com carinho e a caminho.</p>"
            + (f"<p>Código de rastreio: <strong>{tracking}</strong></p>"
               if tracking else ""))
        self._send(to=order["email"], subject=f"Pedido enviado · {order['number']}",
                   html=html, text=f"Pedido {order['number']} enviado. {tracking}\n",
                   key=f"order-shipped:{order['number']}")

    # -- public config ----------------------------------------------
    def categories(self) -> list[str]:
        """The live catalog categories, owned by settings."""
        stored = self.settings_store.read().get("categories")
        if isinstance(stored, list):
            names = [str(name).strip() for name in stored if str(name).strip()]
            if names:
                return names
        return list(ALLOWED_CATEGORIES)

    def public_config(self) -> dict:
        stored = self.settings_store.read()
        shipping = self.orders.config()
        return {
            "version": __version__,
            "store": {
                "name": stored.get("store_name", "Mamy Ateliê"),
                "tagline": stored.get("tagline", ""),
                "announcement": stored.get("announcement", ""),
                "email": stored.get("email", ""),
                "whatsapp": stored.get("whatsapp", ""),
                "instagram": stored.get("instagram", ""),
                "cnpj": stored.get("cnpj", ""),
                "city": stored.get("city", ""),
            },
            "shipping": {
                "flat_minor": shipping["shipping_flat_minor"],
                "free_minor": shipping["free_shipping_minor"],
                "pickup_enabled": shipping["pickup_enabled"],
                "delivery_days": shipping["delivery_days"],
                "pickup_address": shipping["pickup_address"],
            },
            "payment": {
                "mode": "demo" if getattr(self.payments, "name", "") == "demo"
                        else "asaas",
                "environment": (
                    getattr(getattr(self.payments, "config", None), "env_name",
                            "produção")
                    if getattr(self.payments, "name", "") == "asaas"
                    else "demonstração"),
            },
            "turnstile": {
                "enabled": bool(self.verifier.enabled and self.turnstile_site_key),
                "site_key": self.turnstile_site_key,
            },
            "categories": self.categories(),
            "features": {
                "pickup": shipping["pickup_enabled"],
                "coupons": bool(shipping["coupons"]),
                "guest_checkout": True,
                "social_login": bool(self.bridge_secret),
            },
        }

    def health(self) -> dict:
        return {
            "ok": True,
            "service": "mamyat",
            "version": __version__,
            "time": now_iso(),
            "storage": self.storage,
            "payment": getattr(self.payments, "name", "none"),
            "mail": getattr(self.mailer, "name", "none"),
            "captcha": getattr(self.verifier, "name", "none"),
        }

    # -- catalog -----------------------------------------------------
    def list_products(self, query: dict | None = None) -> dict:
        query = query or {}
        rows = self.catalog.public_all(
            category=str(query.get("category") or ""),
            query=str(query.get("q") or ""))
        if str(query.get("featured") or "") in ("1", "true"):
            rows = [row for row in rows if row.get("featured")]
        categories = {}
        for name in self.categories():
            categories[name] = 0
        for row in self.catalog.all(active_only=True):
            categories[row["category"]] = categories.get(row["category"], 0) + 1
        return {"products": rows,
                "categories": [{"name": key, "count": value}
                               for key, value in categories.items()]}

    def get_product(self, slug: str) -> dict:
        product = self.catalog.get(str(slug or ""), active_only=True)
        if not product:
            raise ApiError(404, "produto não encontrado", "not_found")
        related = [row for row in self.catalog.public_all()
                   if row["id"] != product["id"] and
                   row.get("category") == product.get("category")][:4]
        return {"product": self.catalog.public_row(product), "related": related}

    # -- cart / orders ----------------------------------------------
    def quote(self, payload: dict) -> dict:
        try:
            return self.orders.quote(payload)
        except (OrderError, MoneyError, FieldError) as exc:
            raise ApiError(400, str(exc), "invalid_cart") from exc

    def create_order(self, payload: dict, *, customer: dict | None = None,
                     remote_ip: str = "") -> dict:
        if not isinstance(payload, dict):
            raise ApiError(400, "pedido inválido", "invalid_order")
        self._gate(payload.get("turnstile_token"), "checkout", remote_ip)
        try:
            order = self.orders.create(payload, customer=customer,
                                       customer_id=(customer or {}).get("id"))
        except (OrderError, MoneyError, FieldError, CatalogError) as exc:
            raise ApiError(400, str(exc), "invalid_order") from exc
        self.send_order_created(order)
        return self.order_public(order)

    def retry_payment(self, number: str, *, customer: dict | None = None,
                      email: str = "") -> dict:
        order = self.orders.get(number)
        if not order:
            raise ApiError(404, "pedido não encontrado", "not_found")
        self._authorize_order(order, customer=customer, email=email)
        try:
            order = self.orders.retry_payment(number)
        except OrderError as exc:
            raise ApiError(400, str(exc), "payment_error") from exc
        return self.order_public(order)

    def get_order(self, number: str, *, customer: dict | None = None,
                  email: str = "") -> dict:
        order = self.orders.get(number)
        if not order:
            raise ApiError(404, "pedido não encontrado", "not_found")
        self._authorize_order(order, customer=customer, email=email)
        return self.order_public(order)

    def _authorize_order(self, order: dict, *, customer: dict | None,
                         email: str = "") -> None:
        if customer and order.get("customer_id") == customer["id"]:
            return
        if email and order.get("email", "").lower() == email.strip().lower():
            return
        raise ApiError(403, "informe o email do pedido para consultar",
                       "order_forbidden")

    def cancel_order(self, number: str, *, customer: dict | None = None,
                     email: str = "") -> dict:
        order = self.orders.get(number)
        if not order:
            raise ApiError(404, "pedido não encontrado", "not_found")
        self._authorize_order(order, customer=customer, email=email)
        try:
            order = self.orders.customer_cancel(number, order["email"])
        except OrderError as exc:
            raise ApiError(400, str(exc), "cannot_cancel") from exc
        return self.order_public(order)

    def my_orders(self, customer: dict) -> dict:
        return {"orders": [self.order_public(row, compact=True)
                           for row in self.orders.for_customer(customer["id"])]}

    def order_public(self, order: dict, *, compact: bool = False) -> dict:
        view = {
            "id": order["id"], "number": order["number"],
            "status": order["status"],
            "status_label": STATUS_LABELS.get(order["status"], order["status"]),
            "created_at": order.get("created_at"),
            "total_minor": order["total_minor"],
            "total": brl_with_symbol(order["total_minor"]),
            "email": order.get("email"),
            "name": order.get("name"),
            "tracking_code": order.get("tracking_code", ""),
            "shipping_method": (order.get("shipping") or {}).get("method"),
            "shipping": order.get("shipping"),
        }
        if compact:
            view["items"] = [{"name": item["name"], "qty": item["qty"],
                              "variant_name": item["variant_name"],
                              "image": item.get("image", "")}
                             for item in order.get("items", [])]
            view["item_count"] = sum(int(item["qty"]) for item in order.get("items", []))
            return view
        view.update({
            "items": order.get("items", []),
            "subtotal_minor": order["subtotal_minor"],
            "shipping_minor": order["shipping_minor"],
            "discount_minor": order.get("discount_minor", 0),
            "coupon": order.get("coupon", ""),
            "payment": order.get("payment", {}),
            "paid_at": order.get("paid_at"),
            "shipped_at": order.get("shipped_at"),
            "history": order.get("history", []),
            "can_cancel": order["status"] == "awaiting_payment",
        })
        return view

    def webhook_asaas(self, headers: dict, payload: object) -> dict:
        if getattr(self.payments, "name", "") != "asaas":
            raise ApiError(503, "pagamento não configurado", "payments_disabled")
        if not self.payments.verify_webhook(headers):
            raise ApiError(401, "assinatura do webhook inválida", "bad_signature")
        event = resolve_webhook(payload)
        if not event["order_number"]:
            return {"ok": True, "ignored": "sem referência de pedido"}
        if not event["paid"]:
            return {"ok": True, "ignored": event["event"] or "não pago"}
        try:
            order, changed = self.orders.mark_paid(
                event["order_number"], provider_ref=event["provider_ref"],
                amount_minor=event["amount_minor"], source="asaas")
        except OrderError as exc:
            raise ApiError(400, str(exc), "payment_mismatch") from exc
        if changed:
            self.send_order_paid(order)
        return {"ok": True, "order": order["number"], "changed": changed}

    # -- accounts ----------------------------------------------------
    def signup(self, payload: dict, *, remote_ip: str = "") -> dict:
        if not isinstance(payload, dict):
            raise ApiError(400, "dados inválidos", "invalid_account")
        if self.config.gate_signup:
            self._gate(payload.get("turnstile_token"), "signup", remote_ip)
        try:
            customer, token = self.accounts.signup(
                payload, remember=bool(payload.get("remember")))
        except (AccountError, FieldError) as exc:
            raise ApiError(400, str(exc), "signup_failed") from exc
        self.send_welcome(customer)
        return {"customer": self.accounts.public(customer), "token": token}

    def login(self, payload: dict, *, remote_ip: str = "") -> dict:
        if not isinstance(payload, dict):
            raise ApiError(400, "dados inválidos", "invalid_account")
        self._gate(payload.get("turnstile_token"), "login", remote_ip)
        try:
            customer, token = self.accounts.login(
                payload.get("identifier") or payload.get("email") or
                payload.get("username"), payload.get("password"),
                remember=bool(payload.get("remember")))
        except AccountError as exc:
            raise ApiError(401, str(exc), "login_failed") from exc
        return {"customer": self.accounts.public(customer), "token": token}

    def me(self, customer: dict) -> dict:
        return {"customer": self.accounts.public(customer),
                "orders": [self.order_public(row, compact=True)
                           for row in self.orders.for_customer(customer["id"])]}

    def logout(self, token: str) -> dict:
        self.accounts.logout(token)
        return {"ok": True}

    def update_profile(self, customer: dict, payload: dict) -> dict:
        try:
            updated = self.accounts.update_profile(customer["id"], payload)
        except (AccountError, FieldError) as exc:
            raise ApiError(400, str(exc), "profile_failed") from exc
        return {"customer": self.accounts.public(updated)}

    def change_password(self, customer: dict, payload: dict) -> dict:
        try:
            token = self.accounts.change_password(
                customer["id"], str(payload.get("current") or ""),
                str(payload.get("password") or ""))
        except (AccountError, FieldError) as exc:
            raise ApiError(400, str(exc), "password_failed") from exc
        return {"ok": True, "token": token}

    def request_password_reset(self, payload: dict, *, remote_ip: str = "") -> dict:
        self._gate(payload.get("turnstile_token"), "reset", remote_ip)
        try:
            email = validate_email(payload.get("email"))
        except FieldError as exc:
            raise ApiError(400, str(exc), "invalid_email") from exc
        try:
            self.accounts.request_password_reset(email, self.send_reset)
        except AccountError as exc:
            raise ApiError(429, str(exc), "rate_limited") from exc
        return {"ok": True,
                "message": "Se esse email estiver cadastrado, o link chega em instantes."}

    def complete_password_reset(self, payload: dict) -> dict:
        try:
            token = self.accounts.complete_password_reset(
                str(payload.get("token") or ""), str(payload.get("password") or ""))
        except (AccountError, FieldError) as exc:
            raise ApiError(400, str(exc), "reset_failed") from exc
        return {"ok": True, "token": token}

    # -- Better Auth bridge -----------------------------------------
    def social_bridge(self, body: bytes, signature: str) -> dict:
        if not self.bridge_secret:
            raise ApiError(503, "login social não configurado", "social_disabled")
        try:
            identity = verify_bridge(body, signature, self.bridge_secret)
        except BridgeError as exc:
            raise ApiError(401, "login social inválido", "social_invalid") from exc
        try:
            customer, created = self.accounts.login_social(identity)
        except AccountError as exc:
            raise ApiError(403, str(exc), "social_blocked") from exc
        if created:
            self.send_welcome(customer)
        handoff = self.accounts.issue_handoff(customer["id"])
        return {"handoff": handoff,
                "redirect": f"/entrar/social?token={urllib.parse.quote(handoff)}",
                "customer": self.accounts.public(customer)}

    def social_exchange(self, payload: dict) -> dict:
        try:
            customer, token = self.accounts.consume_handoff(
                str(payload.get("token") or ""))
        except AccountError as exc:
            raise ApiError(400, str(exc), "handoff_failed") from exc
        return {"customer": self.accounts.public(customer), "token": token}

    # -- CEP ---------------------------------------------------------
    def lookup_cep(self, cep: str) -> dict:
        try:
            digits = validate_cep(cep)
        except FieldError as exc:
            raise ApiError(400, str(exc), "invalid_cep") from exc
        with self._cep_lock:
            cached = self._cep_cache.get(digits)
            if cached and cached[0] > self.clock():
                return cached[1]
        url = f"https://viacep.com.br/ws/{digits}/json/"
        try:
            request = urllib.request.Request(url, headers={
                "Accept": "application/json", "User-Agent": "mamyatelie/0.1"})
            with urllib.request.urlopen(request, timeout=6) as response:
                data = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, ValueError, OSError) as exc:
            raise ApiError(502, "não foi possível consultar o CEP agora",
                           "cep_unavailable") from exc
        if not isinstance(data, dict) or data.get("erro"):
            raise ApiError(404, "CEP não encontrado", "cep_not_found")
        answer = {"cep": data.get("cep", digits), "street": data.get("logradouro", ""),
                  "district": data.get("bairro", ""), "city": data.get("localidade", ""),
                  "state": data.get("uf", "")}
        with self._cep_lock:
            self._cep_cache[digits] = (self.clock() + 86400, answer)
        return answer

    # -- contact -----------------------------------------------------
    def contact(self, payload: dict, *, remote_ip: str = "") -> dict:
        self._gate(payload.get("turnstile_token"), "contact", remote_ip)
        try:
            name = clean_text(payload.get("name"), field="seu nome",
                              min_length=2, max_length=80)
            email = validate_email(payload.get("email"))
            message = clean_text(payload.get("message"), field="a mensagem",
                                 min_length=10, max_length=2000)
        except FieldError as exc:
            raise ApiError(400, str(exc), "invalid_contact") from exc
        row = {"id": secrets.token_urlsafe(8), "name": name, "email": email,
               "message": message, "created_at": now_iso(),
               "answered": False}
        self.contacts_store.append(row)
        self._send(
            to=self.settings_store.read().get("email", ""),
            subject=f"Contato do site · {name}",
            html=self._brand_html("Nova mensagem do site",
                                  f"<p><strong>{name}</strong> &lt;{email}&gt;</p>"
                                  f"<p>{message}</p>"),
            text=f"{name} <{email}>\n\n{message}\n",
            key=f"contact:{row['id']}")
        return {"ok": True, "message": "Recebido! Respondemos em breve."}

    # -- admin -------------------------------------------------------
    def require_admin(self, token: str, *, role: str = "") -> dict:
        admin = self.accounts.admin_for_token(token)
        if not admin:
            raise ApiError(401, "entre novamente no painel", "unauthorized")
        if role and admin.get("role") != role and admin.get("role") != "admin":
            raise ApiError(403, "sem permissão para essa ação", "forbidden")
        return admin

    def admin_login(self, payload: dict) -> dict:
        try:
            admin, token = self.accounts.admin_login(
                payload.get("username"), payload.get("password"))
        except AccountError as exc:
            raise ApiError(401, str(exc), "login_failed") from exc
        return {"admin": {"id": admin["id"], "username": admin["username"],
                          "role": admin.get("role", "viewer")},
                "token": token,
                "must_change_password": bool(admin.get("must_change_password"))}

    def admin_logout(self, token: str) -> dict:
        self.accounts.admin_logout(token)
        return {"ok": True}

    def admin_dashboard(self) -> dict:
        orders = self.orders.all()
        paid_statuses = {"paid", "packing", "shipped", "delivered"}
        paid = [row for row in orders if row.get("status") in paid_statuses]
        revenue = sum(int(row.get("total_minor") or 0) for row in paid)
        by_status = {status: 0 for status in STATUSES}
        for row in orders:
            by_status[row.get("status", "awaiting_payment")] = \
                by_status.get(row.get("status", "awaiting_payment"), 0) + 1
        sold: dict[str, dict] = {}
        for row in paid:
            for item in row.get("items", []):
                key = item["product_id"]
                entry = sold.setdefault(key, {"name": item["name"], "qty": 0,
                                              "revenue_minor": 0})
                entry["qty"] += int(item["qty"])
                entry["revenue_minor"] += int(item["line_total_minor"])
        top = sorted(sold.values(), key=lambda row: row["qty"], reverse=True)[:5]
        return {
            "revenue_minor": revenue,
            "revenue": brl_with_symbol(revenue),
            "orders": len(orders),
            "paid_orders": len(paid),
            "average_ticket_minor": int(revenue / len(paid)) if paid else 0,
            "customers": len(self.customers_store.read()),
            "awaiting": by_status.get("awaiting_payment", 0),
            "by_status": by_status,
            "low_stock": self.catalog.low_stock(),
            "top_products": top,
            "recent_orders": [self.order_public(row, compact=True)
                              for row in orders[:8]],
            "default_admin": self.accounts.default_admin,
            "payment_mode": "demo" if getattr(self.payments, "name", "") == "demo"
                            else "asaas",
        }

    def admin_products(self) -> dict:
        return {"products": self.products_store.read()}

    def admin_create_product(self, payload: dict) -> dict:
        try:
            product = self.catalog.create(payload or {})
        except (CatalogError, FieldError, MoneyError) as exc:
            raise ApiError(400, str(exc), "invalid_product") from exc
        return {"product": product}

    def admin_update_product(self, product_id: str, payload: dict) -> dict:
        try:
            product = self.catalog.update(product_id, payload or {})
        except (CatalogError, FieldError, MoneyError) as exc:
            raise ApiError(400, str(exc), "invalid_product") from exc
        return {"product": product}

    def admin_archive_product(self, product_id: str) -> dict:
        try:
            product = self.catalog.archive(product_id)
        except CatalogError as exc:
            raise ApiError(404, str(exc), "not_found") from exc
        return {"product": product}

    # -- admin: categories ------------------------------------------
    def _category_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for row in self.products_store.read():
            name = str(row.get("category") or "")
            if name:
                counts[name] = counts.get(name, 0) + 1
        return counts

    def _write_categories(self, names: list[str]) -> list[str]:
        clean = clean_categories(names)
        self.settings_store.update(
            lambda stored: stored.__setitem__("categories", clean))
        return clean

    def admin_categories(self) -> dict:
        counts = self._category_counts()
        return {"categories": [{"name": name, "count": counts.get(name, 0)}
                               for name in self.categories()]}

    def admin_create_category(self, payload: dict) -> dict:
        try:
            name = clean_text(payload.get("name"), field="o nome da categoria",
                              min_length=2, max_length=40)
        except FieldError as exc:
            raise ApiError(400, str(exc), "invalid_category") from exc
        current = self.categories()
        if any(row.casefold() == name.casefold() for row in current):
            raise ApiError(400, "essa categoria já existe", "duplicate_category")
        try:
            names = self._write_categories(current + [name])
        except (CatalogError, FieldError) as exc:
            raise ApiError(400, str(exc), "invalid_category") from exc
        return {"categories": self.admin_categories()["categories"],
                "added": name, "names": names}

    def admin_rename_category(self, name: str, payload: dict) -> dict:
        old = str(name or "").strip()
        current = self.categories()
        match = next((row for row in current
                      if row.casefold() == old.casefold()), None)
        if not match:
            raise ApiError(404, "categoria não encontrada", "not_found")
        try:
            new = clean_text(payload.get("name"), field="o nome da categoria",
                             min_length=2, max_length=40)
        except FieldError as exc:
            raise ApiError(400, str(exc), "invalid_category") from exc
        if new.casefold() != match.casefold() and any(
                row.casefold() == new.casefold() for row in current):
            raise ApiError(400, "essa categoria já existe", "duplicate_category")
        moved = 0
        if new != match:
            def rename(rows):
                nonlocal moved
                for row in rows:
                    if row.get("category") == match:
                        row["category"] = new
                        moved += 1
                return rows

            self.products_store.update(rename)
        try:
            self._write_categories([new if row == match else row
                                    for row in current])
        except (CatalogError, FieldError) as exc:
            raise ApiError(400, str(exc), "invalid_category") from exc
        return {"categories": self.admin_categories()["categories"],
                "renamed": moved}

    def admin_delete_category(self, name: str) -> dict:
        old = str(name or "").strip()
        current = self.categories()
        match = next((row for row in current
                      if row.casefold() == old.casefold()), None)
        if not match:
            raise ApiError(404, "categoria não encontrada", "not_found")
        used = sum(1 for row in self.products_store.read()
                   if row.get("category") == match)
        if used:
            raise ApiError(
                400,
                f"{used} produto(s) ainda usam essa categoria; mova-os antes",
                "category_in_use")
        if len(current) <= 1:
            raise ApiError(400, "mantenha pelo menos uma categoria",
                           "last_category")
        try:
            self._write_categories([row for row in current if row != match])
        except (CatalogError, FieldError) as exc:
            raise ApiError(400, str(exc), "invalid_category") from exc
        return {"categories": self.admin_categories()["categories"]}

    def admin_orders(self, query: dict | None = None) -> dict:
        query = query or {}
        rows = self.orders.all()
        status = str(query.get("status") or "")
        if status:
            rows = [row for row in rows if row.get("status") == status]
        needle = str(query.get("q") or "").strip().lower()
        if needle:
            rows = [row for row in rows
                    if needle in f"{row.get('number','')} {row.get('name','')} "
                                 f"{row.get('email','')}".lower()]
        return {"orders": [self.order_public(row, compact=True) for row in rows]}

    def admin_order(self, number: str) -> dict:
        order = self.orders.get(number)
        if not order:
            raise ApiError(404, "pedido não encontrado", "not_found")
        return {"order": self.order_public(order)}

    def admin_set_status(self, number: str, payload: dict) -> dict:
        try:
            if str(payload.get("status")) == "paid" and \
                    getattr(self.payments, "name", "") == "demo":
                order, changed = self.orders.mark_paid(
                    number, source="admin-demo", amount_minor=None)
                if changed:
                    self.send_order_paid(order)
            else:
                order = self.orders.transition(
                    number, str(payload.get("status") or ""),
                    tracking_code=str(payload.get("tracking_code") or ""))
                if order["status"] == "shipped":
                    self.send_order_shipped(order)
        except OrderError as exc:
            raise ApiError(400, str(exc), "invalid_transition") from exc
        return {"order": self.order_public(order)}

    def admin_mark_paid(self, number: str, payload: dict) -> dict:
        try:
            order, changed = self.orders.mark_paid(
                number, provider_ref=str(payload.get("provider_ref") or ""),
                source="admin")
        except OrderError as exc:
            raise ApiError(400, str(exc), "invalid_payment") from exc
        if changed:
            self.send_order_paid(order)
        return {"order": self.order_public(order), "changed": changed}

    def admin_settings(self) -> dict:
        stored = self.settings_store.read()
        return {"settings": stored, "defaults": DEFAULT_SETTINGS,
                "payment_mode": "demo" if getattr(self.payments, "name", "") == "demo"
                                else "asaas"}

    def admin_update_settings(self, payload: dict) -> dict:
        stored = self.settings_store.read()
        for key, value in (payload or {}).items():
            if key not in ALLOWED_SETTING_KEYS:
                continue
            if key in ("shipping_flat_minor", "free_shipping_minor"):
                try:
                    stored[key] = max(0, int(value))
                except (TypeError, ValueError):
                    raise ApiError(400, f"valor inválido para {key}",
                                   "invalid_setting") from None
            elif key in ("pickup_enabled",):
                stored[key] = bool(value)
            elif key == "cnpj":
                try:
                    stored[key] = normalise_cnpj(value)
                except ValueError as exc:
                    raise ApiError(400, str(exc), "invalid_setting") from None
            elif key == "categories":
                try:
                    clean = clean_categories(value)
                except (CatalogError, FieldError) as exc:
                    raise ApiError(400, str(exc), "invalid_setting") from exc
                used = {str(row.get("category"))
                        for row in self.products_store.read()}
                missing = sorted(name for name in used if name not in clean)
                if missing:
                    raise ApiError(
                        400,
                        "há produtos nas categorias: " + ", ".join(missing),
                        "category_in_use")
                stored[key] = clean
            elif key == "coupons":
                if not isinstance(value, dict):
                    raise ApiError(400, "cupons inválidos", "invalid_setting")
                clean = {}
                for code, coupon in value.items():
                    code = str(code).strip().upper()[:24]
                    if not code or not isinstance(coupon, dict):
                        continue
                    clean[code] = {
                        "type": "fixed" if coupon.get("type") == "fixed" else "percent",
                        "value": coupon.get("value", 0),
                        "active": bool(coupon.get("active", True)),
                        "min_minor": int(coupon.get("min_minor") or 0),
                        "label": str(coupon.get("label") or code)[:60],
                    }
                stored[key] = clean
            else:
                stored[key] = str(value)[:300]
        self.settings_store.write(stored)
        return {"settings": stored}

    def admin_customers(self, query: dict | None = None) -> dict:
        query = query or {}
        needle = str(query.get("q") or "").lower().strip()
        status = str(query.get("status") or "")
        rows = self.customers_store.read()
        if needle:
            rows = [row for row in rows
                    if needle in f"{row.get('name','')} {row.get('email','')} "
                                 f"{row.get('username','')} {row.get('phone','')}"
                                 .lower()]
        if status == "active":
            rows = [row for row in rows if row.get("active", True)]
        elif status == "blocked":
            rows = [row for row in rows if not row.get("active", True)]
        rows = sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)
        return {"customers": [self.accounts.public(row) for row in rows]}

    def admin_customer(self, customer_id: str) -> dict:
        customer = self.accounts.by_id(customer_id)
        if not customer:
            raise ApiError(404, "cliente não encontrado", "not_found")
        orders = self.orders.for_customer(customer_id)
        paid = [row for row in orders
                if row.get("status") in {"paid", "packing", "shipped", "delivered"}]
        spent = sum(int(row.get("total_minor") or 0) for row in paid)
        return {"customer": self.accounts.public(customer),
                "orders": [self.order_public(row, compact=True)
                           for row in sorted(orders, key=lambda row: row.get(
                               "created_at", ""), reverse=True)],
                "stats": {"orders": len(orders), "paid": len(paid),
                          "spent_minor": spent, "spent": brl_with_symbol(spent)}}

    def admin_create_customer(self, payload: dict) -> dict:
        try:
            customer, temporary = self.accounts.admin_create_customer(
                payload or {})
        except (AccountError, FieldError) as exc:
            raise ApiError(400, str(exc), "invalid_customer") from exc
        return {"customer": self.accounts.public(customer),
                "temporary_password": temporary}

    def admin_update_customer(self, customer_id: str, payload: dict) -> dict:
        try:
            customer = self.accounts.admin_update_customer(
                customer_id, payload or {})
        except AccountError as exc:
            raise ApiError(400, str(exc), "invalid_customer") from exc
        return {"customer": self.accounts.public(customer)}

    def admin_delete_customer(self, customer_id: str) -> dict:
        try:
            customer = self.accounts.admin_delete_customer(customer_id)
        except AccountError as exc:
            raise ApiError(404, str(exc), "not_found") from exc
        return {"customer": self.accounts.public(customer), "deleted": True}

    def admin_reset_customer_password(self, customer_id: str) -> dict:
        customer = self.accounts.by_id(customer_id)
        if not customer:
            raise ApiError(404, "cliente não encontrado", "not_found")
        try:
            sent = self.accounts.request_password_reset(
                customer.get("email", ""), self.send_reset, force=True)
        except AccountError as exc:
            raise ApiError(429, str(exc), "rate_limited") from exc
        return {"ok": True, "sent": bool(sent),
                "email": customer.get("email", ""),
                "mail": getattr(self.mailer, "name", "none")}


    def admin_contacts(self) -> dict:
        return {"contacts": sorted(self.contacts_store.read(),
                                   key=lambda row: row.get("created_at", ""),
                                   reverse=True)}

    def admin_change_password(self, admin: dict, payload: dict) -> dict:
        try:
            self.accounts.admin_change_password(
                admin["id"], str(payload.get("current") or ""),
                str(payload.get("password") or ""))
        except (AccountError, FieldError) as exc:
            raise ApiError(400, str(exc), "password_failed") from exc
        return {"ok": True}
