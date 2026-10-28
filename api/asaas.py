"""Asaas Pix — one charge per order, confirmed by the provider.

The store is not allowed to credit an order because a browser said so. A
charge is created here, the QR comes back for the customer, and the order only
moves to ``paid`` when Asaas sends a webhook (or an admin confirms in demo
mode). The webhook token is compared in constant time and the payment amount
must cover the order total.

Configuration is read once, in ``AsaasConfig.from_env``. Environment values
win over ``.env.asaas``; with no key the shop uses ``DemoPayments`` instead and
the UI says "modo demonstração".
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Callable

from foundry.envfile import load_env

from .money import MoneyError, to_provider_decimal

DEFAULT_BASE_URL = "https://sandbox.asaas.com/api/v3"
DEFAULT_ENV_FILE = ".env.asaas"

STATUS_MAP = {
    "PENDING": "pending", "AWAITING_RISK_ANALYSIS": "pending",
    "RECEIVED": "paid", "CONFIRMED": "paid", "RECEIVED_IN_CASH": "paid",
    "OVERDUE": "expired", "REFUNDED": "refunded", "REFUND_REQUESTED": "refunded",
    "CHARGEBACK_REQUESTED": "refunded", "CHARGEBACK_DISPUTE": "refunded",
    "AWAITING_CHARGEBACK_REVERSAL": "refunded", "DUNNING_REQUESTED": "pending",
    "DUNNING_RECEIVED": "paid", "CANCELLED": "cancelled", "DELETED": "cancelled",
}
PAID_EVENTS = {"PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"}


class AsaasError(ValueError):
    """A refusal or an unreachable provider, phrased for the storefront."""


@dataclass(frozen=True)
class AsaasConfig:
    api_key: str = ""
    base_url: str = DEFAULT_BASE_URL
    customer_id: str = ""
    webhook_secret: str = ""
    env_file: str = DEFAULT_ENV_FILE

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None,
                 env_file: str = DEFAULT_ENV_FILE) -> "AsaasConfig":
        if env is not None:
            source = dict(env)
        else:
            source = load_env(env_file)
            source.update(os.environ)
        return cls(
            api_key=(source.get("ASAAS_API_KEY") or "").strip(),
            base_url=(source.get("ASAAS_BASE_URL") or DEFAULT_BASE_URL)
                     .strip().rstrip("/"),
            customer_id=(source.get("ASAAS_CUSTOMER_ID") or "").strip(),
            webhook_secret=(source.get("ASAAS_WEBHOOK_SECRET") or "").strip(),
            env_file=env_file,
        )

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.base_url.startswith("https://"))

    @property
    def env_name(self) -> str:
        return "sandbox" if "sandbox" in self.base_url else "produção"


class _NoCrossOriginRedirect(urllib.request.HTTPRedirectHandler):
    """Never replay the account key to another host on a redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).netloc != req.host:
            raise AsaasError("redirect para outro host recusado")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_NoCrossOriginRedirect())


def _transport(method: str, url: str, api_key: str,
               payload: dict | None = None, idempotency_key: str = "",
               timeout: int = 15) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"access_token": api_key, "Accept": "application/json",
               "User-Agent": "mamyatelie/0.1"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = urllib.request.Request(url, data=body, method=method,
                                     headers=headers)
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise AsaasError(f"Asaas recusou ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise AsaasError(f"Asaas indisponível: {exc.reason}") from exc
    except ValueError as exc:
        raise AsaasError("Asaas devolveu uma resposta ilegível") from exc


def _cents(raw: dict) -> int:
    try:
        return int(round(float(raw.get("value") or 0) * 100))
    except (TypeError, ValueError):
        return 0


def resolve_webhook(payload: object) -> dict:
    """Reduce a webhook body to {event, order_number, provider_ref, paid, amount_minor}."""
    payload = payload if isinstance(payload, dict) else {}
    payment = payload.get("payment") if isinstance(payload.get("payment"), dict) else {}
    event = str(payload.get("event") or "")
    status = STATUS_MAP.get(str(payment.get("status") or ""), "")
    return {
        "event": event,
        "order_number": str(payment.get("externalReference") or ""),
        "provider_ref": str(payment.get("id") or ""),
        "amount_minor": _cents(payment),
        "paid": event in PAID_EVENTS or status == "paid",
    }


class AsaasPayments:
    """The Pix surface Orders calls. Transport is injectable for tests."""

    name = "asaas"

    def __init__(self, config: AsaasConfig,
                 transport: Callable = _transport) -> None:
        if not config.api_key:
            raise AsaasError("ASAAS_API_KEY é obrigatória")
        if not config.base_url.startswith("https://"):
            raise AsaasError("ASAAS_BASE_URL precisa ser https://")
        self.config = config
        self.transport = transport
        self._customer_id = config.customer_id

    def _call(self, method: str, path: str, payload: dict | None = None,
              idem: str = "", timeout: int = 15) -> dict:
        answer = self.transport(method, self.config.base_url + path,
                                self.config.api_key, payload, idem, timeout)
        if not isinstance(answer, dict):
            raise AsaasError("Asaas devolveu uma resposta inesperada")
        return answer

    def _ensure_customer(self, order: dict) -> str:
        if self._customer_id:
            return self._customer_id
        created = self._call("POST", "/customers", {
            "name": order["name"],
            "email": order["email"],
            "phone": "".join(ch for ch in order.get("phone", "") if ch.isdigit()),
            "cpfCnpj": "".join(ch for ch in order.get("cpf", "") if ch.isdigit()),
            "externalReference": order["number"],
            "notificationDisabled": True,
        }, idem=f"cus:{order['number']}")
        customer_id = str(created.get("id") or "")
        if not customer_id:
            raise AsaasError("Asaas não devolveu o cliente criado")
        self._customer_id = customer_id
        return customer_id

    def create_pix(self, order: dict) -> dict:
        customer_id = self._ensure_customer(order)
        due = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            amount = to_provider_decimal(int(order["total_minor"]))
        except MoneyError as exc:
            raise AsaasError(str(exc)) from exc
        raw = self._call("POST", "/payments", {
            "customer": customer_id,
            "billingType": "PIX",
            "value": float(amount),
            "dueDate": due,
            "description": f"Pedido {order['number']} — Mamy Ateliê",
            "externalReference": order["number"],
        }, idem=f"ord:{order['number']}")
        provider_ref = str(raw.get("id") or "")
        if not provider_ref:
            raise AsaasError("Asaas não devolveu a cobrança")
        payment = {
            "provider": "asaas",
            "provider_ref": provider_ref,
            "status": STATUS_MAP.get(str(raw.get("status") or ""), "pending"),
            "amount_minor": int(order["total_minor"]),
            "invoice_url": str(raw.get("invoiceUrl") or ""),
            "qr_code": "", "qr_base64": "",
            "expires_at": str(raw.get("dueDate") or ""),
            "environment": self.config.env_name,
        }
        try:
            qr = self._call("GET", f"/payments/{provider_ref}/pixQrCode")
            payment["qr_code"] = str(qr.get("payload") or "")
            payment["qr_base64"] = str(qr.get("encodedImage") or "")
        except AsaasError:
            pass  # an invoice link is still payable; a QR failure is not fatal
        return payment

    def fetch(self, provider_ref: str) -> dict:
        raw = self._call("GET", f"/payments/{urllib.parse.quote(provider_ref)}")
        return {
            "provider_ref": str(raw.get("id") or provider_ref),
            "status": STATUS_MAP.get(str(raw.get("status") or ""), "pending"),
            "amount_minor": _cents(raw),
            "paid": STATUS_MAP.get(str(raw.get("status") or "")) == "paid",
        }

    def verify_webhook(self, headers: dict) -> bool:
        if not self.config.webhook_secret:
            return False
        token = ""
        for key, value in headers.items():
            if key.lower() == "asaas-access-token":
                token = str(value or "")
                break
        import hmac
        return bool(token) and hmac.compare_digest(token,
                                                    self.config.webhook_secret)


class DemoPayments:
    """No Asaas key: a clearly-labelled demo charge, never a real one."""

    name = "demo"

    def create_pix(self, order: dict) -> dict:
        return {
            "provider": "demo",
            "provider_ref": f"demo-{order['number']}",
            "status": "pending",
            "amount_minor": int(order["total_minor"]),
            "qr_code": f"MAMYAT-DEMO-{order['number']}",
            "qr_base64": "",
            "invoice_url": "",
            "environment": "demonstração",
            "notice": "Pagamento simulado: use o painel para confirmar.",
        }

    def verify_webhook(self, headers: dict) -> bool:
        return False


def resolve_payments(env: dict[str, str] | None = None,
                     env_file: str = DEFAULT_ENV_FILE):
    """Prefer configured Mercado Pago; otherwise Asaas or clearly labelled demo.

    Invalid Mercado Pago settings raise rather than silently enabling demo.
    """
    source = env if env is not None else dict(os.environ)
    if source.get("MERCADOPAGO_ACCESS_TOKEN") or source.get("ACESS_TOKEN"):
        from .mercadopago import MercadoPagoPayments
        payments = MercadoPagoPayments(source)
        return payments, payments.config
    config = AsaasConfig.from_env(env, env_file)
    if not config.configured:
        return DemoPayments(), config
    try:
        return AsaasPayments(config), config
    except AsaasError:
        return DemoPayments(), config
