import unittest
from datetime import datetime, timedelta, timezone
from api.mercadopago import MercadoPagoPayments


class MercadoPagoTests(unittest.TestCase):
    def setUp(self):
        self.env = {"MERCADOPAGO_ACCESS_TOKEN": "private", "MERCADOPAGO_NOTIFICATION_SECRET": "s" * 64,
                    "PUBLIC_BASE_URL": "https://shop.invalid"}
        self.order = {"id": "ord_unique", "number": "MA-1001", "name": "Test Buyer", "email": "buyer@example.invalid",
                      "total_minor": 12345, "created_at": datetime.now(timezone.utc).isoformat()}

    def test_preference_uses_server_total_and_reuses_checkout(self):
        sent = []
        def transport(path, body):
            sent.append(body)
            return {"id": "pref", "init_point": "https://www.mercadopago.com.br/checkout/test"}
        rail = MercadoPagoPayments(self.env, transport)
        payment = rail.create_pix(self.order)
        self.assertEqual(sent[0]["items"][0]["unit_price"], 123.45)
        self.assertEqual(sent[0]["external_reference"], self.order["id"])
        self.assertNotIn("token=", payment["checkout_url"])
        self.order["payment"] = payment
        self.assertEqual(rail.create_pix(self.order), payment)
        self.assertEqual(len(sent), 1)

    def test_verification_uses_provider_and_rejects_mismatches(self):
        raw = {"id": 123, "external_reference": self.order["id"], "metadata": {"order_id": self.order["id"]},
               "currency_id": "BRL", "live_mode": True, "transaction_amount": 123.45, "status": "approved"}
        rail = MercadoPagoPayments(self.env, lambda path: raw)
        query = {"token": rail.notification_token(self.order)}
        payload = {"type": "payment", "data": {"id": 123}}
        self.assertEqual(rail.verified_payment(self.order, query, payload)["status"], "approved")
        with self.assertRaises(PermissionError):
            rail.verified_payment(self.order, {"token": "forged"}, payload)
        for key, value in (("transaction_amount", 1), ("transaction_amount", 123.454), ("currency_id", "USD"), ("external_reference", "other"), ("live_mode", False)):
            with self.subTest(key=key):
                changed = {**raw, key: value}
                rail.transport = lambda path: changed
                with self.assertRaises(ValueError):
                    rail.verified_payment(self.order, query, payload)

    def test_bad_configuration_fails_closed(self):
        for patch in ({"MERCADOPAGO_NOTIFICATION_SECRET": ""}, {"PUBLIC_BASE_URL": "http://shop.invalid"}):
            with self.assertRaises(ValueError):
                MercadoPagoPayments({**self.env, **patch})

    def test_expired_preference_cannot_be_reused(self):
        rail = MercadoPagoPayments(self.env, lambda path, body: self.fail("Expired checkout contacted provider"))
        self.order["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
        self.order["payment"] = {"provider": "mercadopago", "checkout_url": "https://www.mercadopago.com.br/expired"}
        with self.assertRaisesRegex(ValueError, "Reserva expirada"):
            rail.create_pix(self.order)
