"""End-to-end HTTP smoke test against a running mamyat server.

Drives the real routes a browser would: catalog, quote, checkout, guest
lookup, admin login/dashboard/mark-paid, signup/me, and the rejection paths.
Exits non-zero on the first wrong answer, so it can gate a deploy.

    python -m api.server --port 8099
    python scripts/smoke.py --base http://127.0.0.1:8099 --admin-password ...

The admin password must be the one the server booted with: pass
``--admin-password`` or set ADMIN_PASSWORD. The signup uses a random suffix so
running it twice does not collide on the username.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

FAILED: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  ok   {label}")
        return
    FAILED.append(label)
    print(f"  FAIL {label}{(' — ' + detail) if detail else ''}")


class Client:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")

    def call(self, path: str, payload=None, *, method: str = "",
             headers: dict | None = None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            self.base + path, data=data,
            method=method or ("POST" if data is not None else "GET"),
            headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            try:
                return exc.code, json.loads(raw) if raw else {}
            except ValueError:
                return exc.code, {"raw": raw[:200]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=os.environ.get("BASE", "http://127.0.0.1:8099"))
    parser.add_argument("--admin-password",
                        default=os.environ.get("ADMIN_PASSWORD", ""))
    parser.add_argument("--admin-user", default=os.environ.get("ADMIN_USERNAME", "admin"))
    args = parser.parse_args(argv)
    client = Client(args.base)
    suffix = secrets.token_hex(3)

    print(f"smoke: {args.base}")

    status, health = client.call("/api/health")
    check("health", status == 200 and health.get("ok") is True, str(status))

    status, config = client.call("/api/config")
    check("config", status == 200 and bool(config.get("store", {}).get("name")),
          str(status))

    status, catalog = client.call("/api/products")
    products = catalog.get("products") or []
    check("catalog", status == 200 and len(products) > 0, str(status))
    if not products:
        return report()
    product = products[0]
    variant = product["variants"][0]
    item = {"product_id": product["id"], "variant_id": variant["id"], "qty": 1}

    status, quote = client.call("/api/cart/quote",
                                {"items": [item], "shipping_method": "delivery"})
    check("quote", status == 200 and quote.get("total_minor", 0) > 0, str(status))

    order_payload = {
        "items": [item], "shipping_method": "delivery",
        "name": "Ana Souza", "email": f"ana+{suffix}@example.com",
        "phone": "11987654321", "cpf": "52998224725",
        "address": {"cep": "01001000", "street": "Praça da Sé", "number": "10",
                    "district": "Sé", "city": "São Paulo", "state": "SP"},
        "idempotency_key": f"smoke-{suffix}",
    }
    status, order = client.call("/api/orders", order_payload)
    check("create order", status == 201 and bool(order.get("number")), str(status))
    if status != 201:
        return report()
    number = order["number"]

    status, found = client.call(
        f"/api/orders/{number}?email={urllib.parse.quote(order_payload['email'])}")
    check("guest lookup", status == 200 and found.get("number") == number, str(status))

    status, forbidden = client.call(f"/api/orders/{number}")
    check("lookup without email is refused", status in {400, 403, 404}, str(status))

    status, again = client.call("/api/orders", order_payload)
    check("idempotent checkout", status == 201 and again.get("number") == number,
          str(status))

    password = args.admin_password
    if not password:
        print("  skip admin flow (no --admin-password / ADMIN_PASSWORD)")
    else:
        status, admin = client.call("/api/admin/login", {
            "username": args.admin_user, "password": password})
        check("admin login", status == 200 and bool(admin.get("token")), str(status))
        token = admin.get("token") or ""
        headers = {"X-Admin-Token": token}

        status, dashboard = client.call("/api/admin/dashboard", headers=headers)
        check("admin dashboard", status == 200 and "orders" in dashboard, str(status))

        status, paid = client.call(f"/api/admin/orders/{number}/paid", {},
                                   headers=headers)
        check("mark paid", status == 200 and
              paid.get("order", {}).get("status") in {"paid", "packing"}, str(status))

        status, customers = client.call("/api/admin/customers", headers=headers)
        check("admin customers", status == 200, str(status))

        status, contacts = client.call("/api/admin/contacts", headers=headers)
        check("admin contacts", status == 200, str(status))

        # -- categories and product creation ----------------------------
        status, listed = client.call("/api/admin/categories", headers=headers)
        check("admin categories", status == 200 and "categories" in listed,
              str(status))

        category = f"Teste {suffix}"
        status, _ = client.call("/api/admin/categories", {"name": category},
                                headers=headers)
        check("create category", status == 201, str(status))

        renamed_to = f"{category} renomeada"
        status, _ = client.call(
            f"/api/admin/categories/{urllib.parse.quote(category)}",
            {"name": renamed_to}, method="PATCH", headers=headers)
        check("rename category", status == 200, str(status))

        status, made = client.call("/api/admin/products", {
            "name": f"Bolsa Smoke {suffix}",
            "description": "Peça criada pelo smoke test para validar o painel.",
            "category": "Bolsas", "price": "129,00",
            "variants": [{"name": "Única", "sku": f"SMK{suffix}".upper(),
                          "stock": 2}],
            "images": ["/produtos/bolsa-aurora.svg"],
        }, headers=headers)
        check("admin create product", status == 201 and
              made.get("product", {}).get("category") == "Bolsas", str(status))
        product_id = made.get("product", {}).get("id")
        if product_id:
            status, _ = client.call(f"/api/admin/products/{product_id}",
                                    {"active": False}, method="PATCH",
                                    headers=headers)
            check("archive product", status == 200, str(status))

        status, _ = client.call(
            f"/api/admin/categories/{urllib.parse.quote(renamed_to)}",
            method="DELETE", headers=headers)
        check("delete unused category", status == 200, str(status))

        # -- customer management ----------------------------------------
        username = f"smoke{suffix}"
        status, fresh = client.call("/api/admin/customers", {
            "username": username, "email": f"{username}@example.com",
            "name": "Cliente Smoke"}, headers=headers)
        check("admin create customer", status == 201 and
              bool(fresh.get("temporary_password")), str(status))
        customer_id = fresh.get("customer", {}).get("id")

        if customer_id:
            status, detail = client.call(f"/api/admin/customers/{customer_id}",
                                         headers=headers)
            check("customer detail", status == 200 and
                  detail.get("stats", {}).get("orders") == 0, str(status))

            status, blocked = client.call(f"/api/admin/customers/{customer_id}",
                                          {"active": False}, method="PATCH",
                                          headers=headers)
            check("block customer", status == 200 and
                  blocked.get("customer", {}).get("active") is False, str(status))

            status, _ = client.call(f"/api/admin/customers/{customer_id}/reset",
                                    {}, headers=headers)
            check("customer reset link", status == 200, str(status))

            status, gone = client.call(f"/api/admin/customers/{customer_id}",
                                       method="DELETE", headers=headers)
            check("anonymize customer", status == 200 and
                  gone.get("deleted") is True, str(status))

    username = f"ana{suffix}"
    status, signup = client.call("/api/auth/signup", {
        "username": username, "email": f"ana+{suffix}@example.com",
        "name": "Ana Souza", "password": "segredo123", "cpf": "52998224725"})
    check("signup", status == 201 and
          signup.get("customer", {}).get("username") == username, str(status))
    customer_token = signup.get("token", "")
    customer_headers = {"X-Customer-Token": customer_token}

    status, me = client.call("/api/auth/me", headers=customer_headers)
    check("customer me", status == 200 and
          me.get("customer", {}).get("username") == username, str(status))

    status, mine = client.call("/api/orders", headers=customer_headers)
    check("customer orders", status == 200 and "orders" in mine, str(status))

    status, bad = client.call("/api/auth/signup", {
        "username": "ab", "email": "x@example.com", "name": "X Y",
        "password": "segredo123"})
    check("invalid signup refused", status == 400, str(status))

    status, providers = client.call("/api/betterauth/providers")
    check("social providers endpoint", status == 200 and "providers" in providers,
          str(status))

    return report()


def report() -> int:
    if FAILED:
        print(f"smoke: {len(FAILED)} failure(s): {', '.join(FAILED)}")
        return 1
    print("smoke: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
