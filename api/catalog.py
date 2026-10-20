"""Catalog: products, variants, stock and short-lived reservations.

Money is integer centavos everywhere. A reservation is created when an order
is opened and holds stock for 30 minutes; it is committed when Asaas confirms
the payment and released when the order is cancelled or expires. Without that
step two customers can pay for the last bag and one of them has to be refunded.

The store never trusts a price, name or image sent by a browser: every order
line is rebuilt from the product row here.
"""
from __future__ import annotations

import time
from typing import Any

from .money import MoneyError, to_cents
from .store import JsonStore, atomic_id, now_iso
from .validation import (FieldError, clean_text, slugify, validate_username)

DEFAULT_RESERVATION_TTL = 30 * 60
MAX_VARIANTS = 20
MAX_IMAGES = 6
MAX_CATEGORIES = 24
# Seeded on first boot; the admin panel owns the live list from then on.
ALLOWED_CATEGORIES = (
    "Bolsas", "Amigurumis", "Bordados", "Casa", "Acessórios", "Kits",
    "Encomendas",
)


class CatalogError(ValueError):
    """The catalog refused a value. Customer-safe."""


def clean_categories(value: object) -> list[str]:
    """Validate the category list kept in settings. Order is preserved."""
    if not isinstance(value, list):
        raise CatalogError("categorias devem ser uma lista")
    names, seen = [], set()
    for raw in value:
        name = clean_text(raw, field="o nome da categoria",
                          min_length=2, max_length=40)
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(name)
    if not names:
        raise CatalogError("mantenha pelo menos uma categoria")
    if len(names) > MAX_CATEGORIES:
        raise CatalogError(f"no máximo {MAX_CATEGORIES} categorias")
    return names


def _clean_images(value: object) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise CatalogError("imagens devem ser uma lista")
    images = []
    for raw in value[:MAX_IMAGES]:
        url = str(raw or "").strip()
        if not url:
            continue
        if url.startswith("/") and ".." not in url:
            images.append(url[:300])
        elif url.startswith("https://") and len(url) <= 500:
            images.append(url)
        else:
            raise CatalogError("cada imagem deve ser um caminho local ou https")
    return images


def _clean_variants(value: object) -> list[dict]:
    if not isinstance(value, list) or not value:
        value = [{"name": "Único", "stock": 0, "sku": ""}]
    if len(value) > MAX_VARIANTS:
        raise CatalogError(f"no máximo {MAX_VARIANTS} variações por produto")
    variants, seen_skus = [], set()
    for index, raw in enumerate(value):
        if not isinstance(raw, dict):
            raise CatalogError("variação inválida")
        name = clean_text(raw.get("name"), field="o nome da variação",
                          min_length=1, max_length=40)
        try:
            stock = int(raw.get("stock", 0))
        except (TypeError, ValueError):
            raise CatalogError("estoque inválido") from None
        if stock < 0 or stock > 100_000:
            raise CatalogError("estoque inválido")
        sku = str(raw.get("sku") or "").strip().upper()[:40]
        if sku and sku in seen_skus:
            raise CatalogError("SKU repetido no produto")
        if sku:
            seen_skus.add(sku)
        variants.append({
            "id": str(raw.get("id") or f"var_{index + 1}")[:40],
            "name": name,
            "sku": sku,
            "stock": stock,
        })
    return variants


def validate_product(payload: object, *, existing: dict | None = None,
                     categories: list[str] | None = None) -> dict:
    if not isinstance(payload, dict):
        raise CatalogError("produto inválido")
    base = dict(existing or {})
    name = clean_text(payload.get("name", base.get("name")),
                      field="o nome do produto", min_length=2, max_length=80)
    description = clean_text(payload.get("description", base.get("description")),
                             field="a descrição", min_length=20,
                             max_length=4000)
    try:
        price = to_cents(payload.get("price", base.get("price_minor")))
    except MoneyError as exc:
        raise CatalogError(str(exc)) from exc
    if price <= 0:
        raise CatalogError("o preço precisa ser maior que zero")
    compare_raw = payload.get("compare_at", base.get("compare_at_minor"))
    compare = None
    if compare_raw not in (None, "", 0):
        try:
            compare = to_cents(compare_raw)
        except MoneyError as exc:
            raise CatalogError(str(exc)) from exc
        if compare <= price:
            compare = None
    category = clean_text(payload.get("category", base.get("category")),
                          field="a categoria", min_length=2, max_length=40)
    allowed = {name.casefold(): name
               for name in (categories or ALLOWED_CATEGORIES)}
    if category.casefold() not in allowed:
        raise CatalogError("categoria desconhecida")
    category = allowed[category.casefold()]
    slug = slugify(payload.get("slug") or name)
    if not slug:
        raise CatalogError("o nome precisa gerar um endereço válido")
    variants = _clean_variants(payload.get("variants", base.get("variants")))
    images = _clean_images(payload.get("images", base.get("images")))
    try:
        production_days = int(payload.get("production_days",
                                          base.get("production_days", 0)))
    except (TypeError, ValueError):
        raise CatalogError("prazo de produção inválido") from None
    if not 0 <= production_days <= 90:
        raise CatalogError("prazo de produção inválido")
    details_raw = payload.get("details", base.get("details") or [])
    details = []
    if isinstance(details_raw, list):
        for item in details_raw[:12]:
            text = str(item or "").strip()
            if text:
                details.append(text[:200])
    return {
        "id": base.get("id") or atomic_id("prd"),
        "slug": slug,
        "name": name,
        "description": description,
        "details": details,
        "category": category,
        "price_minor": price,
        "compare_at_minor": compare,
        "images": images,
        "variants": variants,
        "featured": bool(payload.get("featured", base.get("featured", False))),
        "active": bool(payload.get("active", base.get("active", True))),
        "made_to_order": bool(payload.get("made_to_order",
                                           base.get("made_to_order", False))),
        "production_days": production_days,
        "created_at": base.get("created_at") or now_iso(),
        "updated_at": now_iso(),
    }


class Catalog:
    def __init__(self, products: JsonStore, reservations: JsonStore,
                 *, reservation_ttl: int = DEFAULT_RESERVATION_TTL,
                 categories=None, clock=None) -> None:
        self.products = products
        self.reservations = reservations
        self.reservation_ttl = int(reservation_ttl)
        self._categories = categories
        self.clock = clock or time.time

    def categories(self) -> list[str]:
        """The live list: a callable (settings) or a fixed list."""
        value = self._categories() if callable(self._categories) \
            else self._categories
        names = [str(name) for name in (value or []) if str(name).strip()]
        return names or list(ALLOWED_CATEGORIES)

    # -- reads -------------------------------------------------------
    def all(self, *, active_only: bool = True,
            category: str = "", query: str = "") -> list[dict]:
        rows = self.products.read()
        if active_only:
            rows = [row for row in rows if row.get("active", True)]
        if category:
            rows = [row for row in rows if row.get("category") == category]
        if query:
            needle = query.strip().lower()
            rows = [row for row in rows
                    if needle in f"{row.get('name','')} {row.get('description','')} "
                                 f"{row.get('category','')}".lower()]
        return sorted(rows, key=lambda row: (not row.get("featured", False),
                                             row.get("name", "").lower()))

    def get(self, key: str, *, active_only: bool = False) -> dict | None:
        key = str(key or "")
        rows = self.products.read()
        for row in rows:
            if row.get("id") == key or row.get("slug") == key:
                if active_only and not row.get("active", True):
                    return None
                return row
        return None

    def public_row(self, product: dict) -> dict:
        reserved = self.reserved_map()
        variants = []
        for variant in product.get("variants", []):
            available = 9999 if product.get("made_to_order") else max(
                0, int(variant.get("stock", 0)) -
                reserved.get((product["id"], variant["id"]), 0))
            variants.append({**variant, "available": available})
        return {
            **product,
            "price": product["price_minor"],
            "compare_at": product.get("compare_at_minor"),
            "variants": variants,
            "available": max((v["available"] for v in variants), default=0),
            "url": f"/produto/{product['slug']}",
        }

    def public_all(self, **kwargs) -> list[dict]:
        return [self.public_row(row) for row in self.all(**kwargs)]

    def variant(self, product: dict, variant_id: str = "") -> dict | None:
        variants = product.get("variants") or []
        if not variants:
            return None
        if not variant_id:
            return variants[0]
        for variant in variants:
            if variant.get("id") == variant_id or variant.get("sku") == variant_id:
                return variant
        return None

    # -- admin writes ------------------------------------------------
    def create(self, payload: dict) -> dict:
        product = validate_product(payload, categories=self.categories())
        self._check_slug(product["slug"], product["id"])
        self.products.append(product)
        return product

    def update(self, product_id: str, payload: dict) -> dict:
        existing = self.get(product_id)
        if not existing:
            raise CatalogError("produto não encontrado")
        product = validate_product(payload, existing=existing,
                                   categories=self.categories())
        self._check_slug(product["slug"], existing["id"])
        self.products.replace(lambda row: row.get("id") == existing["id"], product)
        return product

    def archive(self, product_id: str) -> dict:
        existing = self.get(product_id)
        if not existing:
            raise CatalogError("produto não encontrado")
        updated = {**existing, "active": False, "updated_at": now_iso()}
        self.products.replace(lambda row: row.get("id") == existing["id"], updated)
        return updated

    def _check_slug(self, slug: str, product_id: str) -> None:
        for row in self.products.read():
            if row.get("slug") == slug and row.get("id") != product_id:
                raise CatalogError("já existe um produto com esse endereço")

    # -- reservations ------------------------------------------------
    def _reservation_rows(self) -> dict:
        now = self.clock()
        rows = self.reservations.read()

        def prune(data):
            dead = [key for key, row in data.items()
                    if not isinstance(row, dict) or
                    float(row.get("expires_at") or 0) <= now]
            for key in dead:
                data.pop(key, None)
            return dead

        dead = self.reservations.update(prune)
        if dead:
            rows = self.reservations.read()
        return rows

    def reserved_map(self) -> dict[tuple[str, str], int]:
        counts: dict[tuple[str, str], int] = {}
        for row in self._reservation_rows().values():
            for item in row.get("items", []):
                key = (str(item.get("product_id")), str(item.get("variant_id")))
                counts[key] = counts.get(key, 0) + int(item.get("qty", 0))
        return counts

    def available(self, product: dict, variant: dict, *,
                  ignore_order: str = "") -> int:
        if product.get("made_to_order"):
            return 9999
        reserved = 0
        for order_id, row in self._reservation_rows().items():
            if order_id == ignore_order:
                continue
            for item in row.get("items", []):
                if item.get("product_id") == product["id"] and \
                        item.get("variant_id") == variant["id"]:
                    reserved += int(item.get("qty", 0))
        return max(0, int(variant.get("stock", 0)) - reserved)

    def reserve(self, order_id: str, items: list[dict]) -> None:
        self._reservation_rows()
        now = self.clock()
        row = {"order_id": order_id, "created_at": now_iso(),
               "expires_at": now + self.reservation_ttl, "items": items}
        self.reservations.update(lambda data: data.__setitem__(order_id, row))
        self._reservation_rows()

    def release(self, order_id: str) -> bool:
        return bool(self.reservations.update(
            lambda data: data.pop(order_id, None) is not None))

    def commit(self, order_id: str) -> bool:
        """Turn a reservation into a stock decrement, exactly once."""
        row = self._reservation_rows().get(order_id)
        if not row:
            return False

        def decrement(products):
            by_id = {p["id"]: p for p in products}
            for item in row.get("items", []):
                product = by_id.get(item.get("product_id"))
                if not product:
                    continue
                for variant in product.get("variants", []):
                    if variant.get("id") == item.get("variant_id"):
                        if not product.get("made_to_order"):
                            variant["stock"] = max(
                                0, int(variant.get("stock", 0)) -
                                int(item.get("qty", 0)))
                        break
                product["updated_at"] = now_iso()

        self.products.update(decrement)
        self.release(order_id)
        return True

    def low_stock(self, threshold: int = 3) -> list[dict]:
        items = []
        for product in self.all(active_only=True):
            if product.get("made_to_order"):
                continue
            for variant in product.get("variants", []):
                stock = int(variant.get("stock", 0))
                if stock <= threshold:
                    items.append({
                        "product_id": product["id"], "product": product["name"],
                        "slug": product["slug"], "variant": variant["name"],
                        "sku": variant.get("sku", ""), "stock": stock,
                    })
        return sorted(items, key=lambda row: row["stock"])
