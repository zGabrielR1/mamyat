"""Orders: quote, reserve, pay, pack, ship.

The browser sends product ids and quantities; this module prices every line
from the catalog, holds stock for 30 minutes, and only then asks the payment
provider for a Pix charge. A payment is confirmed by the provider webhook (or
by an admin in demo mode), never by the page that opened the checkout.
"""
from __future__ import annotations

import time
from typing import Any, Callable

from .catalog import Catalog, CatalogError
from .money import MoneyError, to_cents
from .store import JsonStore, now_iso
from .validation import (FieldError, clean_text, validate_cep, validate_cpf_field,
                         validate_email, validate_name, validate_phone,
                         validate_state)

MAX_LINES = 30
MAX_QTY = 20

STATUSES = ("awaiting_payment", "paid", "packing", "shipped", "delivered",
            "cancelled", "refunded")
TRANSITIONS = {
    "awaiting_payment": {"paid", "cancelled"},
    "paid": {"packing", "refunded", "cancelled"},
    "packing": {"shipped", "refunded"},
    "shipped": {"delivered", "refunded"},
    "delivered": set(),
    "cancelled": set(),
    "refunded": set(),
}
STATUS_LABELS = {
    "awaiting_payment": "Aguardando pagamento",
    "paid": "Pago",
    "packing": "Em produção",
    "shipped": "Enviado",
    "delivered": "Entregue",
    "cancelled": "Cancelado",
    "refunded": "Reembolsado",
}


class OrderError(ValueError):
    """The order cannot be created or changed. Customer-safe."""


class Orders:
    def __init__(self, orders: JsonStore, catalog: Catalog,
                 settings: JsonStore, payments=None, *, clock=None) -> None:
        self.orders = orders
        self.catalog = catalog
        self.settings = settings
        self.payments = payments
        self.clock = clock or time.time

    # -- configuration ----------------------------------------------
    def config(self) -> dict:
        stored = self.settings.read()
        try:
            flat = int(stored.get("shipping_flat_minor", 1800))
        except (TypeError, ValueError):
            flat = 1800
        try:
            free = int(stored.get("free_shipping_minor", 25000))
        except (TypeError, ValueError):
            free = 25000
        return {
            "shipping_flat_minor": max(0, flat),
            "free_shipping_minor": max(0, free),
            "pickup_enabled": bool(stored.get("pickup_enabled", True)),
            "delivery_days": str(stored.get("delivery_days", "3 a 7")),
            "pickup_address": str(stored.get("pickup_address",
                                            "Retirada combinada em Concórdia/SC")),
            "coupons": stored.get("coupons", {}),
        }

    def _shipping_for(self, subtotal: int, method: str) -> int:
        cfg = self.config()
        if method == "pickup":
            if not cfg["pickup_enabled"]:
                raise OrderError("retirada não está disponível")
            return 0
        if cfg["free_shipping_minor"] and subtotal >= cfg["free_shipping_minor"]:
            return 0
        return cfg["shipping_flat_minor"]

    def _coupon(self, code: object, subtotal: int) -> tuple[int, str]:
        code = str(code or "").strip().upper()
        if not code:
            return 0, ""
        coupons = self.config()["coupons"]
        coupon = coupons.get(code) if isinstance(coupons, dict) else None
        if not isinstance(coupon, dict) or not coupon.get("active", True):
            raise OrderError("cupom inválido ou expirado")
        try:
            minimum = int(coupon.get("min_minor") or 0)
        except (TypeError, ValueError):
            minimum = 0
        if subtotal < minimum:
            raise OrderError("o cupom não vale para este valor")
        kind = str(coupon.get("type") or "percent")
        try:
            value = float(coupon.get("value") or 0)
        except (TypeError, ValueError):
            raise OrderError("cupom inválido") from None
        if kind == "percent":
            discount = int(round(subtotal * value / 100.0))
        elif kind == "fixed":
            discount = to_cents(coupon.get("value"))
        else:
            raise OrderError("cupom inválido")
        return max(0, min(subtotal, discount)), str(coupon.get("label") or code)

    # -- quote -------------------------------------------------------
    def quote(self, payload: object) -> dict:
        if not isinstance(payload, dict):
            raise OrderError("carrinho inválido")
        requested = payload.get("items")
        if not isinstance(requested, list) or not requested:
            raise OrderError("seu carrinho está vazio")
        if len(requested) > MAX_LINES:
            raise OrderError("carrinho grande demais")
        lines, problems = [], []
        subtotal = 0
        for raw in requested:
            if not isinstance(raw, dict):
                continue
            product = self.catalog.get(str(raw.get("product_id") or ""),
                                        active_only=True)
            if not product:
                problems.append("um produto do carrinho não está mais disponível")
                continue
            variant = self.catalog.variant(product, str(raw.get("variant_id") or ""))
            if not variant:
                problems.append(f"variação indisponível: {product['name']}")
                continue
            try:
                qty = int(raw.get("qty") or 0)
            except (TypeError, ValueError):
                qty = 0
            if not 1 <= qty <= MAX_QTY:
                problems.append(f"quantidade inválida: {product['name']}")
                continue
            available = self.catalog.available(product, variant)
            if qty > available:
                problems.append(
                    f"{product['name']} ({variant['name']}): "
                    f"restam {available}" if available else
                    f"{product['name']} ({variant['name']}): esgotado")
                continue
            line_total = int(product["price_minor"]) * qty
            subtotal += line_total
            lines.append({
                "product_id": product["id"],
                "variant_id": variant["id"],
                "slug": product["slug"],
                "name": product["name"],
                "variant_name": variant["name"],
                "sku": variant.get("sku", ""),
                "image": (product.get("images") or [""])[0],
                "unit_price_minor": int(product["price_minor"]),
                "qty": qty,
                "line_total_minor": line_total,
                "made_to_order": bool(product.get("made_to_order")),
                "production_days": int(product.get("production_days") or 0),
            })
        method = str(payload.get("shipping_method") or "delivery")
        if method not in ("delivery", "pickup"):
            raise OrderError("forma de entrega inválida")
        if problems:
            return {"ok": False, "problems": problems, "items": lines,
                    "subtotal_minor": subtotal, "shipping_minor": 0,
                    "discount_minor": 0, "total_minor": subtotal}
        shipping = self._shipping_for(subtotal, method)
        discount, coupon_label = self._coupon(payload.get("coupon"), subtotal)
        total = max(0, subtotal + shipping - discount)
        return {
            "ok": True,
            "problems": [],
            "items": lines,
            "shipping_method": method,
            "shipping_minor": shipping,
            "discount_minor": discount,
            "coupon": coupon_label,
            "subtotal_minor": subtotal,
            "total_minor": total,
            "free_shipping": shipping == 0 and method == "delivery",
        }

    # -- create ------------------------------------------------------
    def _next_number(self) -> str:
        rows = self.orders.read()
        used = {row.get("number") for row in rows}
        number = 1000 + len(rows) + 1
        while f"MA-{number}" in used:
            number += 1
        return f"MA-{number}"

    def _clean_shipping(self, payload: dict, method: str) -> dict:
        if method == "pickup":
            return {"method": "pickup", "pickup_address": self.config()["pickup_address"]}
        address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
        return {
            "method": "delivery",
            "cep": validate_cep(address.get("cep")),
            "street": clean_text(address.get("street"), field="o endereço",
                                 min_length=3, max_length=120),
            "number": clean_text(address.get("number"), field="o número",
                                 min_length=1, max_length=20),
            "complement": clean_text(address.get("complement"),
                                     field="complemento", required=False,
                                     max_length=80),
            "district": clean_text(address.get("district"), field="o bairro",
                                   min_length=2, max_length=80),
            "city": clean_text(address.get("city"), field="a cidade",
                               min_length=2, max_length=80),
            "state": validate_state(address.get("state")),
            "notes": clean_text(address.get("notes"), field="observações",
                                required=False, max_length=300),
        }

    def create(self, payload: object, *, customer: dict | None = None,
               customer_id: str | None = None) -> dict:
        if not isinstance(payload, dict):
            raise OrderError("pedido inválido")
        idempotency = str(payload.get("idempotency_key") or "").strip()[:80]
        if idempotency:
            wanted_email = str(payload.get("email") or "").strip().lower()
            for row in self.orders.read():
                if row.get("idempotency_key") == idempotency:
                    if wanted_email and \
                            str(row.get("email") or "").lower() != wanted_email:
                        raise OrderError("pedido não encontrado")
                    return row
        quote = self.quote(payload)
        if not quote["ok"]:
            raise OrderError(quote["problems"][0] if quote["problems"]
                             else "não foi possível fechar o pedido")
        method = quote["shipping_method"]
        shipping = self._clean_shipping(payload, method)
        name = validate_name(payload.get("name") or (customer or {}).get("name"))
        email = validate_email(payload.get("email") or (customer or {}).get("email"))
        phone = validate_phone(payload.get("phone") or (customer or {}).get("phone"),
                               required=True)
        cpf = validate_cpf_field(payload.get("cpf") or (customer or {}).get("cpf"))
        order = {
            "id": f"ord_{int(time.time())}_{len(self.orders.read()) + 1}",
            "number": self._next_number(),
            "customer_id": customer_id or (customer or {}).get("id"),
            "name": name,
            "email": email,
            "phone": phone,
            "cpf": cpf,
            "shipping": shipping,
            "items": quote["items"],
            "subtotal_minor": quote["subtotal_minor"],
            "shipping_minor": quote["shipping_minor"],
            "discount_minor": quote["discount_minor"],
            "coupon": quote["coupon"],
            "total_minor": quote["total_minor"],
            "status": "awaiting_payment",
            "status_label": STATUS_LABELS["awaiting_payment"],
            "payment": {"provider": "none", "status": "pending"},
            "idempotency_key": idempotency,
            "created_at": now_iso(),
            "paid_at": None,
            "shipped_at": None,
            "tracking_code": "",
            "history": [{"status": "awaiting_payment", "at": now_iso()}],
        }
        # Reserve only after every field is valid, so a bad form never holds stock.
        self.catalog.reserve(order["number"], [
            {"product_id": item["product_id"], "variant_id": item["variant_id"],
             "qty": item["qty"]} for item in quote["items"]])
        self.orders.append(order)
        if self.payments is not None:
            try:
                charge = self.payments.create_pix(order)
                order["payment"] = charge
            except Exception as exc:  # provider outage is a state, not a 500
                order["payment"] = {
                    "provider": getattr(self.payments, "name", "none"),
                    "status": "error",
                    "error": str(exc)[:200],
                    "retryable": True,
                }
            self._save(order)
        return order

    def retry_payment(self, number: str) -> dict:
        order = self.get(number)
        if not order:
            raise OrderError("pedido não encontrado")
        if order["status"] != "awaiting_payment":
            raise OrderError("este pedido não está aguardando pagamento")
        if self.payments is None:
            raise OrderError("pagamento indisponível")
        try:
            order["payment"] = self.payments.create_pix(order)
        except Exception as exc:
            order["payment"] = {**order.get("payment", {}), "status": "error",
                                "error": str(exc)[:200], "retryable": True}
            self._save(order)
            raise OrderError("não foi possível gerar o Pix agora; tente de novo")
        self._save(order)
        return order

    # -- reads -------------------------------------------------------
    def all(self) -> list[dict]:
        return sorted(self.orders.read(),
                      key=lambda row: row.get("created_at", ""), reverse=True)

    def get(self, key: str) -> dict | None:
        key = str(key or "")
        for row in self.orders.read():
            if row.get("number") == key or row.get("id") == key:
                return row
        return None

    def lookup(self, number: str, email: str = "") -> dict | None:
        order = self.get(number)
        if not order:
            return None
        if email and order.get("email", "").lower() != email.strip().lower():
            return None
        return order

    def for_customer(self, customer_id: str) -> list[dict]:
        return [row for row in self.all() if row.get("customer_id") == customer_id]

    # -- state machine ----------------------------------------------
    def _save(self, order: dict) -> dict:
        order["status_label"] = STATUS_LABELS.get(order["status"], order["status"])
        self.orders.replace(
            lambda row: row.get("number") == order.get("number"), order)
        return order

    def mark_paid(self, number: str, *, provider_ref: str = "",
                  amount_minor: int | None = None,
                  source: str = "webhook") -> tuple[dict, bool]:
        """Confirm a payment once. Returns (order, changed)."""
        order = self.get(number)
        if not order:
            raise OrderError("pedido não encontrado")
        if order["status"] != "awaiting_payment":
            return order, False
        if amount_minor is not None and amount_minor < int(order["total_minor"]):
            raise OrderError("o valor pago é menor que o total do pedido")
        self.catalog.commit(order["number"])
        order["status"] = "paid"
        order["paid_at"] = now_iso()
        order["payment"] = {**order.get("payment", {}), "status": "confirmed",
                            "provider_ref": provider_ref or
                            order.get("payment", {}).get("provider_ref", ""),
                            "confirmed_by": source}
        order["history"].append({"status": "paid", "at": order["paid_at"],
                                 "source": source})
        self._save(order)
        return order, True

    def transition(self, number: str, status: str, *,
                   tracking_code: str = "") -> dict:
        order = self.get(number)
        if not order:
            raise OrderError("pedido não encontrado")
        status = str(status or "").strip()
        if status not in STATUSES:
            raise OrderError("status desconhecido")
        if status not in TRANSITIONS.get(order["status"], set()):
            raise OrderError(
                f"não é possível passar de {STATUS_LABELS.get(order['status'])} "
                f"para {STATUS_LABELS.get(status)}")
        if status == "cancelled":
            self.catalog.release(order["number"])
        if status == "shipped":
            tracking_code = clean_text(tracking_code, field="o código de rastreio",
                                       required=False, max_length=80)
            order["tracking_code"] = tracking_code
            order["shipped_at"] = now_iso()
        order["status"] = status
        order["history"].append({"status": status, "at": now_iso()})
        self._save(order)
        return order

    def customer_cancel(self, number: str, email: str) -> dict:
        order = self.lookup(number, email)
        if not order:
            raise OrderError("pedido não encontrado")
        if order["status"] != "awaiting_payment":
            raise OrderError("fale com o ateliê para cancelar um pedido pago")
        return self.transition(number, "cancelled")
