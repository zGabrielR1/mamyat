"""Product reviews and ratings.

Reviews are customer-submitted feedback on products. They include:
- A rating (1-5 stars)
- Optional text comment
- Customer name (optional, anonymized if not provided)
- Product reference
- Order reference (to verify purchase)
- Moderation status (pending/approved/rejected)

Only customers who have purchased a product can review it.
Reviews require admin approval before being published.
"""
from __future__ import annotations

from .store import JsonStore, atomic_id, now_iso
from .validation import clean_text


class ReviewError(ValueError):
    """The review system refused a value. Customer-safe."""


def validate_review(payload: dict, *, existing: dict | None = None) -> dict:
    """Validate a review submission."""
    if not isinstance(payload, dict):
        raise ReviewError("avaliação inválida")
    base = dict(existing or {})

    # Rating: 1-5 stars
    rating = payload.get("rating", base.get("rating", 0))
    if type(rating) is not int or not 1 <= rating <= 5:
        raise ReviewError("avaliação deve ser de 1 a 5 estrelas")

    # Comment: optional, max 1000 chars
    comment = clean_text(
        payload.get("comment", base.get("comment", "")),
        field="o comentário",
        min_length=0,
        max_length=1000,
        required=False,
    )

    # Name: optional, defaults to "Cliente anônimo"
    name = clean_text(
        payload.get("name", base.get("name", "")),
        field="o nome",
        min_length=0,
        max_length=60,
        required=False,
    ) or "Cliente anônimo"

    # Product and order references
    product_id = str(payload.get("product_id", base.get("product_id", "")))
    if not product_id:
        raise ReviewError("produto é obrigatório")

    order_id = str(payload.get("order_id", base.get("order_id", "")))
    if not order_id:
        raise ReviewError("pedido é obrigatório")

    # Moderation status
    status = str(payload.get("status", base.get("status", "pending")))
    if status not in ("pending", "approved", "rejected"):
        status = "pending"

    return {
        "id": base.get("id") or atomic_id("rev"),
        "product_id": product_id,
        "order_id": order_id,
        "rating": rating,
        "comment": comment,
        "name": name,
        "status": status,
        "created_at": base.get("created_at") or now_iso(),
        "updated_at": now_iso(),
    }


class Reviews:
    """Manage product reviews."""

    def __init__(self, reviews: JsonStore) -> None:
        self.reviews = reviews

    def all(self, *, product_id: str = "", status: str = "approved") -> list[dict]:
        """Get reviews, optionally filtered by product and status."""
        rows = self.reviews.read()
        if product_id:
            rows = [row for row in rows if row.get("product_id") == product_id]
        if status:
            rows = [row for row in rows if row.get("status") == status]
        # Sort by created_at descending (newest first)
        return sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)

    def get(self, review_id: str) -> dict | None:
        """Get a single review by ID."""
        review_id = str(review_id or "")
        for row in self.reviews.read():
            if row.get("id") == review_id:
                return row
        return None

    def create(self, payload: dict) -> dict:
        """Create a new review (starts as pending)."""
        review = validate_review(payload)
        # Ensure status is pending for new reviews
        review["status"] = "pending"
        def add(rows):
            if any(row.get("order_id") == review["order_id"] and
                   row.get("product_id") == review["product_id"] for row in rows):
                raise ReviewError("este produto já foi avaliado neste pedido")
            rows.append(review)
            return review
        return self.reviews.update(add)

    def update(self, review_id: str, payload: dict) -> dict:
        """Update a review (admin only - used for moderation)."""
        existing = self.get(review_id)
        if not existing:
            raise ReviewError("avaliação não encontrada")
        review = validate_review(payload, existing=existing)
        self.reviews.replace(lambda row: row.get("id") == existing["id"], review)
        return review

    def approve(self, review_id: str) -> dict:
        """Approve a review (admin only)."""
        existing = self.get(review_id)
        if not existing:
            raise ReviewError("avaliação não encontrada")
        updated = {**existing, "status": "approved", "updated_at": now_iso()}
        self.reviews.replace(lambda row: row.get("id") == existing["id"], updated)
        return updated

    def reject(self, review_id: str) -> dict:
        """Reject a review (admin only)."""
        existing = self.get(review_id)
        if not existing:
            raise ReviewError("avaliação não encontrada")
        updated = {**existing, "status": "rejected", "updated_at": now_iso()}
        self.reviews.replace(lambda row: row.get("id") == existing["id"], updated)
        return updated

    def delete(self, review_id: str) -> bool:
        """Delete a review (admin only)."""
        existing = self.get(review_id)
        if not existing:
            return False
        def remove(rows):
            for index, row in enumerate(rows):
                if row.get("id") == review_id:
                    rows.pop(index)
                    return True
            return False
        return self.reviews.update(remove)

    def product_stats(self, product_id: str) -> dict:
        """Get rating statistics for a product (approved reviews only)."""
        rows = self.all(product_id=product_id, status="approved")
        if not rows:
            return {"count": 0, "average": 0, "distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}}

        total = len(rows)
        sum_rating = sum(row.get("rating", 0) for row in rows)
        average = round(sum_rating / total, 1)

        distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for row in rows:
            rating = row.get("rating", 0)
            if rating in distribution:
                distribution[rating] += 1

        return {
            "count": total,
            "average": average,
            "distribution": distribution,
        }

    def pending_count(self) -> int:
        """Count reviews pending moderation (admin)."""
        return len([row for row in self.reviews.read() if row.get("status") == "pending"])
