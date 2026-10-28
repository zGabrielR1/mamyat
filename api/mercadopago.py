"""Mercado Pago hosted Checkout Pro; credentials never reach the browser."""
import hashlib
import hmac
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from urllib.parse import urlencode, urlparse


class PaymentMismatch(ValueError):
    """Provider data does not belong to this order or its exact total."""


class MercadoPagoPayments:
    name = "mercadopago"

    def __init__(self, env, transport=None):
        self.env = env
        self.token = env.get("MERCADOPAGO_ACCESS_TOKEN") or env.get("ACESS_TOKEN", "")
        self.secret = env.get("MERCADOPAGO_NOTIFICATION_SECRET", "")
        self.base = env.get("PUBLIC_BASE_URL", "").rstrip("/")
        if not self.token or len(self.secret) < 32 or urlparse(self.base).scheme != "https":
            raise ValueError("Mercado Pago requires access token, notification secret and HTTPS PUBLIC_BASE_URL")
        self.config = SimpleNamespace(env_name="produção")
        self.transport = transport or self._request

    def _request(self, path, body=None):
        request = urllib.request.Request(
            "https://api.mercadopago.com" + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                raise ValueError("Mercado Pago redirect refused")
        try:
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=12) as response:
                return json.load(response)
        except Exception as exc:
            raise ValueError("Mercado Pago indisponível. Tente novamente.") from exc

    def notification_token(self, order):
        return hmac.new(self.secret.encode(), order["id"].encode(), hashlib.sha256).hexdigest()

    def create_pix(self, order):
        # Existing Orders rail name; this creates a hosted multi-method checkout.
        if order.get("payment", {}).get("review_required"):
            raise ValueError("Pagamento em conferência. Não pague novamente.")
        created = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
        expires = created + timedelta(minutes=30)
        if expires <= datetime.now(timezone.utc):
            raise ValueError("Reserva expirada. Faça um novo pedido.")
        if order.get("payment", {}).get("checkout_url"):
            return order["payment"]
        back = self.base + "/pedido/" + order["number"]
        raw = self.transport("/checkout/preferences", {
            "items": [{"id": order["id"], "title": "Pedido " + order["number"] + " - Mamy Ateliê",
                       "quantity": 1, "currency_id": "BRL", "unit_price": order["total_minor"] / 100}],
            "payer": {"name": order["name"], "email": order["email"]},
            "external_reference": order["id"], "metadata": {"order_id": order["id"]},
            "notification_url": self.base + "/api/webhooks/mercadopago?" + urlencode({
                "order": order["number"], "token": self.notification_token(order)}),
            "back_urls": {key: back for key in ("success", "pending", "failure")},
            "auto_return": "approved", "expires": True, "expiration_date_to": expires.isoformat(),
            "payment_methods": {"excluded_payment_types": [{"id": "ticket"}, {"id": "atm"}]},
            "statement_descriptor": "MAMY ATELIE",
        })
        url = urlparse(raw.get("init_point", ""))
        if not raw.get("id") or url.scheme != "https" or url.hostname not in ("www.mercadopago.com.br", "www.mercadopago.com"):
            raise ValueError("Mercado Pago devolveu um checkout inválido")
        return {"provider": self.name, "provider_ref": str(raw["id"]), "status": "pending",
                "amount_minor": order["total_minor"], "invoice_url": raw["init_point"],
                "checkout_url": raw["init_point"], "expires_at": expires.isoformat(), "environment": "produção"}

    def verified_payment(self, order, query, payload):
        if not hmac.compare_digest(str(query.get("token", "")), self.notification_token(order)):
            raise PermissionError("Notificação inválida")
        payment_id = str(query.get("data.id") or (payload.get("data") or {}).get("id") or "")
        if not payment_id.isascii() or not payment_id.isdigit() or (payload.get("type") or query.get("type")) != "payment":
            return None
        return self.fetch_payment(order, payment_id)

    def fetch_payment(self, order, payment_id):
        payment_id = str(payment_id)
        if not payment_id.isascii() or not payment_id.isdigit() or not 1 <= len(payment_id) <= 30:
            raise ValueError("Identificador de pagamento inválido")
        raw = self.transport("/v1/payments/" + payment_id)
        try:
            amount_matches = Decimal(str(raw.get("transaction_amount"))) * 100 == order["total_minor"]
        except (InvalidOperation, TypeError, ValueError):
            amount_matches = False
        if (str(raw.get("id")) != payment_id or raw.get("external_reference") != order["id"]
                or raw.get("currency_id") != "BRL" or raw.get("live_mode") is not True
                or (raw.get("metadata") or {}).get("order_id") != order["id"]
                or not amount_matches):
            raise PaymentMismatch("Pagamento divergente")
        return raw
