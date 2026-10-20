"""The backend suite. Run: python -m unittest discover -s api/tests -v"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from foundry.betterauth import SocialIdentity, payload_for, signature_for

from api.app import App, AppConfig, ApiError
from api.accounts import AccountError
from api.asaas import DemoPayments


class FakeMailer:
    name = "fake"

    def __init__(self) -> None:
        self.sent: list[dict] = []

    @property
    def enabled(self) -> bool:
        return True

    def send(self, message, *, idempotency_key: str = ""):
        self.sent.append({"to": message.to, "subject": message.subject,
                          "html": message.html, "text": message.text,
                          "key": idempotency_key})
        return SimpleNamespace(ok=True)


class FakeVerifier:
    name = "fake"
    enabled = True

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def verify(self, token, *, action="", hostnames=(), remote_ip=""):
        self.calls.append((token, action))
        if token != "ok":
            raise ValueError("captcha refused")
        return SimpleNamespace(success=True)


class FakeAsaas:
    name = "asaas"
    config = SimpleNamespace(env_name="sandbox")

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.created = 0

    def create_pix(self, order):
        if self.fail:
            raise ValueError("provider offline")
        self.created += 1
        return {"provider": "asaas", "provider_ref": f"pay_{order['number']}",
                "status": "pending", "amount_minor": order["total_minor"],
                "qr_code": "00020126PIXDEMO", "qr_base64": "",
                "invoice_url": "https://sandbox.asaas.com/i/demo",
                "environment": "sandbox"}

    def verify_webhook(self, headers):
        return headers.get("asaas-access-token") == "segredo"


ADDRESS = {"cep": "01001000", "street": "Praça da Sé", "number": "10",
           "district": "Sé", "city": "São Paulo", "state": "SP",
           "complement": "", "notes": ""}


class AppTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="mamyat-test-")
        seed = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), "data", "seed", "products.json")
        self.mailer = FakeMailer()
        self.verifier = FakeVerifier()
        config = AppConfig(data_dir=self.tmp, seed_path=seed,
                           env={"BETTER_AUTH_BRIDGE_SECRET": "bridge-secret",
                                "TURNSTILE_SITE_KEY": "site-key",
                                "ADMIN_PASSWORD": "mamytest123"},
                           login_delay=0.0)
        self.app = App(config, mailer=self.mailer, verifier=self.verifier,
                       payments=DemoPayments())

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- helpers -----------------------------------------------------
    def order_payload(self, **overrides) -> dict:
        payload = {
            "items": [{"product_id": "prd_x", "variant_id": "areia", "qty": 1}],
            "shipping_method": "delivery",
            "name": "Ana Souza", "email": "ana@example.com",
            "phone": "11987654321", "cpf": "52998224725",
            "address": dict(ADDRESS),
            "turnstile_token": "ok",
            "idempotency_key": "test-key-1",
        }
        payload.update(overrides)
        return payload

    def product(self, slug: str = "bolsa-aurora") -> dict:
        return self.app.catalog.get(slug)

    def create_order(self, **overrides) -> dict:
        product = self.product()
        payload = self.order_payload(**overrides)
        payload["items"] = [{"product_id": product["id"],
                             "variant_id": "areia", "qty": 2}]
        payload["cpf"] = "52998224725"
        order = self.app.create_order(payload)
        return order

    def product_payload(self, **overrides) -> dict:
        payload = {
            "name": "Bolsa Teste",
            "description": "Uma descrição suficientemente longa para passar.",
            "category": "Bolsas", "price": "199,00",
            "variants": [{"name": "Única", "sku": "T1", "stock": 3}],
            "images": ["/produtos/bolsa-aurora.svg"],
        }
        payload.update(overrides)
        return payload

    # -- basics ------------------------------------------------------
    def test_health_and_config(self) -> None:
        health = self.app.health()
        self.assertTrue(health["ok"])
        self.assertEqual(health["service"], "mamyat")
        config = self.app.public_config()
        self.assertEqual(config["store"]["name"], "Mamy Ateliê")
        self.assertIn("flat_minor", config["shipping"])
        self.assertEqual(config["payment"]["mode"], "demo")
        self.assertTrue(config["turnstile"]["enabled"])

    def test_catalog_is_seeded_and_has_availability(self) -> None:
        products = self.app.list_products()
        self.assertGreaterEqual(len(products["products"]), 10)
        first = self.app.get_product("bolsa-aurora")
        self.assertEqual(first["product"]["name"], "Bolsa Aurora")
        self.assertTrue(first["product"]["variants"][0]["available"] > 0)

    def test_quote_prices_from_catalog_not_browser(self) -> None:
        product = self.product()
        quote = self.app.quote({
            "items": [{"product_id": product["id"], "variant_id": "areia",
                       "qty": 2, "unit_price_minor": 1, "name": "hack"}],
            "shipping_method": "delivery", "coupon": "BEMVINDA10"})
        self.assertTrue(quote["ok"])
        self.assertEqual(quote["subtotal_minor"], 37800)
        self.assertEqual(quote["shipping_minor"], 0)  # above free threshold
        self.assertEqual(quote["discount_minor"], 3780)
        self.assertEqual(quote["total_minor"], 34020)
        self.assertEqual(quote["items"][0]["unit_price_minor"], 18900)

    def test_quote_reports_stock(self) -> None:
        product = self.product()
        quote = self.app.quote({
            "items": [{"product_id": product["id"], "variant_id": "areia",
                       "qty": 99}], "shipping_method": "pickup"})
        self.assertFalse(quote["ok"])
        self.assertTrue(quote["problems"])

    # -- orders ------------------------------------------------------
    def test_order_flow_reserves_and_commits_stock(self) -> None:
        order = self.create_order()
        self.assertEqual(order["status"], "awaiting_payment")
        self.assertEqual(order["total_minor"], 37800)
        self.assertEqual(order["payment"]["provider"], "demo")
        self.assertIn("MA-", order["number"])

        product = self.product()
        available = self.app.catalog.public_row(product)["variants"][0]["available"]
        self.assertEqual(available, 2)  # 4 stock, 2 reserved

        # guest lookup needs the email
        with self.assertRaises(ApiError) as ctx:
            self.app.get_order(order["number"])
        self.assertEqual(ctx.exception.status, 403)
        found = self.app.get_order(order["number"], email="ana@example.com")
        self.assertEqual(found["number"], order["number"])

        paid, changed = self.app.orders.mark_paid(order["number"])
        self.assertTrue(changed)
        self.assertEqual(paid["status"], "paid")
        # idempotent
        paid_again, changed_again = self.app.orders.mark_paid(order["number"])
        self.assertFalse(changed_again)
        self.assertEqual(paid_again["status"], "paid")
        product = self.product()
        self.assertEqual(
            self.app.catalog.public_row(product)["variants"][0]["available"], 2)

    def test_idempotent_checkout_returns_same_order(self) -> None:
        first = self.create_order()
        second = self.create_order()
        self.assertEqual(first["number"], second["number"])
        self.assertEqual(len(self.app.orders.all()), 1)

    def test_cancel_releases_reservation(self) -> None:
        order = self.create_order()
        cancelled = self.app.cancel_order(order["number"], email="ana@example.com")
        self.assertEqual(cancelled["status"], "cancelled")
        product = self.product()
        self.assertEqual(
            self.app.catalog.public_row(product)["variants"][0]["available"], 4)

    def test_quote_refuses_after_reservation(self) -> None:
        self.create_order()
        product = self.product()
        quote = self.app.quote({"items": [
            {"product_id": product["id"], "variant_id": "areia", "qty": 3}],
            "shipping_method": "pickup"})
        self.assertFalse(quote["ok"])

    def test_shipping_and_pickup(self) -> None:
        product = self.product()
        small = self.app.quote({"items": [
            {"product_id": product["id"], "variant_id": "areia", "qty": 1}],
            "shipping_method": "delivery"})
        self.assertEqual(small["shipping_minor"], 1800)
        pickup = self.app.quote({"items": [
            {"product_id": product["id"], "variant_id": "areia", "qty": 1}],
            "shipping_method": "pickup"})
        self.assertEqual(pickup["shipping_minor"], 0)

    def test_payment_failure_keeps_order_awaiting(self) -> None:
        product = self.product()
        config = AppConfig(data_dir=self.tmp, seed_path=self.app.config.seed_path,
                           env={}, login_delay=0)
        app = App(config, mailer=self.mailer, verifier=self.verifier,
                  payments=FakeAsaas(fail=True))
        payload = self.order_payload()
        payload["items"] = [{"product_id": product["id"],
                             "variant_id": "areia", "qty": 1}]
        order = app.create_order(payload)
        self.assertEqual(order["status"], "awaiting_payment")
        self.assertEqual(order["payment"]["status"], "error")

    def test_webhook_confirms_payment(self) -> None:
        product = self.product()
        config = AppConfig(data_dir=self.tmp, seed_path=self.app.config.seed_path,
                           env={}, login_delay=0)
        app = App(config, mailer=self.mailer, verifier=self.verifier,
                  payments=FakeAsaas())
        payload = self.order_payload()
        payload["items"] = [{"product_id": product["id"],
                             "variant_id": "areia", "qty": 1}]
        order = app.create_order(payload)
        with self.assertRaises(ApiError):
            app.webhook_asaas({"asaas-access-token": "errado"},
                              {"event": "PAYMENT_RECEIVED"})
        answer = app.webhook_asaas({"asaas-access-token": "segredo"}, {
            "event": "PAYMENT_RECEIVED",
            "payment": {"id": "pay_1", "status": "RECEIVED",
                        "value": float(order["total_minor"]) / 100,
                        "externalReference": order["number"]}})
        self.assertTrue(answer["changed"])
        self.assertEqual(app.orders.get(order["number"])["status"], "paid")

    # -- accounts ----------------------------------------------------
    def signup(self, **overrides) -> dict:
        payload = {"username": "anasouza", "email": "ana@example.com",
                   "name": "Ana Souza", "password": "segredo123",
                   "cpf": "52998224725", "turnstile_token": "ok"}
        payload.update(overrides)
        return self.app.signup(payload)

    def test_signup_login_and_session(self) -> None:
        result = self.signup()
        self.assertEqual(result["customer"]["username"], "anasouza")
        self.assertNotIn("password_hash", result["customer"])
        token = result["token"]
        me = self.app.me(self.app.accounts.authenticate(token))
        self.assertEqual(me["customer"]["email"], "ana@example.com")

        with self.assertRaises(ApiError):
            self.app.signup({"username": "anasouza", "email": "outra@example.com",
                             "name": "Outra", "password": "segredo123",
                             "turnstile_token": "ok"})
        login = self.app.login({"identifier": "anasouza", "password": "segredo123",
                                "turnstile_token": "ok"})
        self.assertIn("token", login)
        with self.assertRaises(ApiError):
            self.app.login({"identifier": "anasouza", "password": "errada",
                            "turnstile_token": "ok"})

    def test_username_and_password_rules(self) -> None:
        with self.assertRaises(ApiError):
            self.signup(username="ab")
        with self.assertRaises(ApiError):
            self.signup(username="admin")
        with self.assertRaises(ApiError):
            self.signup(username="Ana Silva")
        with self.assertRaises(ApiError):
            self.signup(password="semnumeros")
        with self.assertRaises(ApiError):
            self.signup(password="12345678")
        with self.assertRaises(ApiError):
            self.signup(cpf="11111111111")

    def test_customer_orders_are_scoped(self) -> None:
        account = self.signup()
        customer = self.app.accounts.authenticate(account["token"])
        product = self.product()
        payload = self.order_payload(email="ana@example.com")
        payload["items"] = [{"product_id": product["id"],
                             "variant_id": "areia", "qty": 1}]
        order = self.app.create_order(payload, customer=customer)
        mine = self.app.my_orders(customer)
        self.assertEqual(len(mine["orders"]), 1)
        self.assertEqual(mine["orders"][0]["number"], order["number"])

    def test_password_reset_rotates_sessions(self) -> None:
        account = self.signup()
        tokens: list[str] = []
        self.assertTrue(self.app.accounts.request_password_reset(
            "ana@example.com", lambda customer, token: tokens.append(token)))
        self.assertEqual(len(tokens), 1)
        result = self.app.complete_password_reset(
            {"token": tokens[0], "password": "novasenha9"})
        self.assertIn("token", result)
        # the old session no longer authenticates
        self.assertIsNone(self.app.accounts.authenticate(account["token"]))
        self.app.login({"identifier": "ana@example.com",
                        "password": "novasenha9", "turnstile_token": "ok"})

    def test_social_bridge_creates_and_links(self) -> None:
        identity = SocialIdentity(provider="google", subject="123",
                                  email="social@example.com",
                                  email_verified=True, name="Social")
        body = json.dumps(payload_for(identity), sort_keys=True,
                          separators=(",", ":")).encode("utf-8")
        signature = signature_for(body, "bridge-secret")
        answer = self.app.social_bridge(body, signature)
        self.assertIn("handoff", answer)
        exchanged = self.app.social_exchange({"token": answer["handoff"]})
        self.assertEqual(exchanged["customer"]["email"], "social@example.com")
        # second login reuses the customer instead of creating a duplicate
        again = self.app.social_bridge(body, signature)
        self.assertEqual(again["customer"]["id"], answer["customer"]["id"])
        with self.assertRaises(ApiError):
            self.app.social_bridge(body, "sha256=deadbeef")

    def test_captcha_gate(self) -> None:
        with self.assertRaises(ApiError) as ctx:
            self.app.signup({"username": "teste123", "email": "t@example.com",
                             "name": "Teste Um", "password": "segredo123",
                             "turnstile_token": ""})
        self.assertEqual(ctx.exception.code, "captcha_required")
        with self.assertRaises(ApiError):
            self.app.signup({"username": "teste123", "email": "t@example.com",
                             "name": "Teste Um", "password": "segredo123",
                             "turnstile_token": "nope"})

    # -- admin -------------------------------------------------------
    def admin_token(self) -> str:
        return self.app.admin_login({"username": "admin",
                                     "password": "mamytest123"})["token"]

    def test_admin_dashboard_and_default_warning(self) -> None:
        token = self.admin_token()
        self.app.require_admin(token)
        dashboard = self.app.admin_dashboard()
        self.assertFalse(dashboard["default_admin"])
        self.assertEqual(dashboard["payment_mode"], "demo")
        self.assertIn("BEMVINDA10", self.app.admin_settings()["settings"]["coupons"])
        with self.assertRaises(ApiError):
            self.app.require_admin("not-a-token")

    def test_admin_manages_catalog_and_orders(self) -> None:
        token = self.admin_token()
        created = self.app.admin_create_product({
            "name": "Teste de Produto", "description": "Descrição longa o bastante.",
            "category": "Casa", "price": "50,00",
            "variants": [{"name": "Único", "stock": 3}], "images": []})
        product = created["product"]
        updated = self.app.admin_update_product(product["id"], {"price": "60,00"})
        self.assertEqual(updated["product"]["price_minor"], 6000)
        archived = self.app.admin_archive_product(product["id"])
        self.assertFalse(archived["product"]["active"])

        order = self.create_order()
        self.app.admin_mark_paid(order["number"], {})
        status = self.app.admin_set_status(order["number"],
                                           {"status": "packing"})
        self.assertEqual(status["order"]["status"], "packing")
        shipped = self.app.admin_set_status(order["number"],
                                            {"status": "shipped",
                                             "tracking_code": "BR123"})
        self.assertEqual(shipped["order"]["tracking_code"], "BR123")
        delivered = self.app.admin_set_status(order["number"],
                                              {"status": "delivered"})
        self.assertEqual(delivered["order"]["status"], "delivered")
        with self.assertRaises(ApiError):
            self.app.admin_set_status(order["number"], {"status": "shipped"})

    def test_admin_settings_validation(self) -> None:
        token = self.admin_token()
        self.app.require_admin(token)
        result = self.app.admin_update_settings({"shipping_flat_minor": "2500",
                                                 "pickup_enabled": False})
        self.assertEqual(result["settings"]["shipping_flat_minor"], 2500)
        self.assertFalse(result["settings"]["pickup_enabled"])
        with self.assertRaises(ApiError):
            self.app.admin_update_settings({"shipping_flat_minor": "x"})

    def test_contact_is_stored_and_mailed(self) -> None:
        answer = self.app.contact({"name": "Cliente", "email": "c@example.com",
                                   "message": "Queria encomendar uma bolsa.",
                                   "turnstile_token": "ok"})
        self.assertTrue(answer["ok"])
        self.assertEqual(len(self.app.contacts_store.read()), 1)
        self.assertTrue(any("Contato" in item["subject"]
                            for item in self.mailer.sent))

    def test_invalid_cep(self) -> None:
        with self.assertRaises(ApiError):
            self.app.lookup_cep("123")

    # -- admin: categories ------------------------------------------
    def test_admin_categories_drive_the_catalog(self) -> None:
        created = self.app.admin_create_category({"name": "Crochê"})
        self.assertIn("Crochê", [row["name"] for row in created["categories"]])

        with self.assertRaises(ApiError) as ctx:
            self.app.admin_create_category({"name": "crochê"})
        self.assertEqual(ctx.exception.code, "duplicate_category")

        product = self.app.admin_create_product(
            self.product_payload(category="Crochê", name="Cesto de fio"))
        self.assertEqual(product["product"]["category"], "Crochê")

        with self.assertRaises(ApiError):
            self.app.admin_create_product(
                self.product_payload(category="Inexistente", name="Outro"))

        renamed = self.app.admin_rename_category("Crochê", {"name": "Crochê fino"})
        self.assertEqual(renamed["renamed"], 1)
        moved = self.app.catalog.get(product["product"]["id"])
        self.assertEqual(moved["category"], "Crochê fino")

        with self.assertRaises(ApiError) as ctx:
            self.app.admin_delete_category("Crochê fino")
        self.assertEqual(ctx.exception.code, "category_in_use")

        self.app.admin_create_category({"name": "Temporária"})
        answer = self.app.admin_delete_category("Temporária")
        self.assertNotIn("Temporária", [row["name"] for row in answer["categories"]])

        listed = self.app.list_products()
        names = [row["name"] for row in listed["categories"]]
        self.assertIn("Crochê fino", names)
        self.assertEqual(self.app.public_config()["categories"],
                         [row["name"] for row in self.app.admin_categories()["categories"]])

    # -- admin: customers -------------------------------------------
    def test_admin_manages_customers(self) -> None:
        answer = self.app.admin_create_customer({
            "username": "maria", "email": "maria@example.com",
            "name": "Maria Silva", "phone": "11999998888"})
        customer = answer["customer"]
        temporary = answer["temporary_password"]
        self.assertTrue(temporary)
        self.assertTrue(customer["active"])
        self.assertTrue(customer["has_password"])

        logged, token = self.app.accounts.login("maria", temporary)
        self.assertEqual(logged["id"], customer["id"])
        detail = self.app.admin_customer(customer["id"])
        self.assertEqual(detail["stats"]["orders"], 0)
        self.assertEqual(detail["stats"]["spent_minor"], 0)

        updated = self.app.admin_update_customer(
            customer["id"], {"name": "Maria Souza", "active": False})
        self.assertEqual(updated["customer"]["name"], "Maria Souza")
        self.assertFalse(updated["customer"]["active"])
        self.assertIsNone(self.app.accounts.authenticate(token))
        with self.assertRaises(AccountError):
            self.app.accounts.login("maria", temporary)

        blocked = self.app.admin_customers({"status": "blocked"})["customers"]
        self.assertEqual([row["id"] for row in blocked], [customer["id"]])

        self.app.admin_update_customer(customer["id"], {"active": True})
        reopened, _ = self.app.accounts.login("maria", temporary)
        self.assertTrue(reopened["active"])

        reset = self.app.admin_reset_customer_password(customer["id"])
        self.assertTrue(reset["sent"])
        self.assertTrue(any("Redefinir" in item["subject"]
                            for item in self.mailer.sent))

        deleted = self.app.admin_delete_customer(customer["id"])
        self.assertTrue(deleted["deleted"])
        self.assertIn("removido", deleted["customer"]["email"])
        self.assertFalse(deleted["customer"]["has_password"])
        self.assertFalse(deleted["customer"]["active"])
        with self.assertRaises(AccountError):
            self.app.accounts.login("maria", temporary)


if __name__ == "__main__":
    unittest.main()
