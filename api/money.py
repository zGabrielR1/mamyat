"""Money as integer minor units (centavos). Floats never touch a total."""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

MAX_AMOUNT_MINOR = 100_000_000  # R$ 1.000.000,00 — a sane ceiling for this shop

_BRL = re.compile(r"^\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)\s*$")


class MoneyError(ValueError):
    """An amount cannot be used. Safe to show to a customer."""


def to_cents(value: object) -> int:
    """Parse a BRL amount ("189,90", "R$ 1.234,50", 189.9) into centavos.

    A number is read as reais (189.9 -> 18990). A string may use the Brazilian
    comma decimal separator, thousands dots, or a plain "189.90".
    """
    if isinstance(value, bool):
        raise MoneyError("valor inválido")
    if isinstance(value, int):
        cents = value * 100
    elif isinstance(value, float):
        cents = int(Decimal(str(value)).quantize(Decimal("0.01"),
                                                  rounding=ROUND_HALF_UP) * 100)
    elif isinstance(value, str):
        text = value.strip()
        match = _BRL.match(text)
        if not match:
            raise MoneyError("valor inválido")
        raw = match.group(1)
        if "," in raw:
            raw = raw.replace(".", "").replace(",", ".")
        elif raw.count(".") > 1:
            raw = raw.replace(".", "")
        elif "." in raw and len(raw.rsplit(".", 1)[1]) == 3:
            raw = raw.replace(".", "")
        try:
            amount = Decimal(raw)
        except InvalidOperation as exc:
            raise MoneyError("valor inválido") from exc
        cents = int((amount * 100).quantize(Decimal("1"),
                                            rounding=ROUND_HALF_UP))
    else:
        raise MoneyError("valor inválido")
    if cents < 0 or cents > MAX_AMOUNT_MINOR:
        raise MoneyError("valor fora do limite")
    return cents


def brl(cents: int) -> str:
    """18990 -> "189,90" (no currency symbol; the UI adds R$)."""
    if isinstance(cents, bool) or not isinstance(cents, int):
        raise MoneyError("valor inválido")
    sign = "-" if cents < 0 else ""
    value = abs(cents)
    return f"{sign}{value // 100:,}".replace(",", ".") + f",{value % 100:02d}"


def brl_with_symbol(cents: int) -> str:
    return f"R$ {brl(cents)}"


def to_provider_decimal(cents: int) -> str:
    """18990 -> "189.90" — the shape Asaas expects."""
    if isinstance(cents, bool) or not isinstance(cents, int) or cents < 0:
        raise MoneyError("valor inválido")
    return f"{cents // 100}.{cents % 100:02d}"
