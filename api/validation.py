"""Field validation for Mamy Ateliê accounts and checkout.

The username rules intentionally match the operator's model: lowercase,
3–20 characters, starts with a letter or digit, then letters/digits/._-
The email shape is intentionally simple; the mail provider is the authority
on deliverability, and foundry refuses reserved domains before sending.
"""
from __future__ import annotations

import re
import unicodedata

from foundry.auth import DocumentError, digits_only, validate_cnpj, validate_cpf

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,19}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PHONE_RE = re.compile(r"^[0-9()+\-\s]{10,20}$")
CEP_RE = re.compile(r"^[0-9]{8}$")
NAME_RE = re.compile(r"^[^\d<>]{2,80}$")

USERNAME_MIN = 3
USERNAME_MAX = 20
PASSWORD_MIN = 8
PASSWORD_MAX = 128

# Handles that must not become a customer account (routes, staff, support).
RESERVED_USERNAMES = frozenset({
    "admin", "administrador", "api", "atendimento", "conta", "checkout",
    "contato", "carrinho", "conta", "design", "equipe", "mamy", "mamyatelie",
    "moderador", "pedido", "pedidos", "produtos", "root", "sac", "shop",
    "suporte", "sistema", "staff", "store", "teste", "vendas",
})


class FieldError(ValueError):
    """A field is invalid. The message is customer-safe Portuguese."""


def strip_accents(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value)
                   if unicodedata.category(c) != "Mn")


def slugify(value: object, *, max_length: int = 80) -> str:
    text = strip_accents(str(value or "").strip().lower())
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:max_length].rstrip("-")


def validate_username(value: object) -> str:
    username = str(value or "").strip().lower()
    if not USERNAME_RE.match(username):
        raise FieldError(
            "nome de usuário: 3 a 20 caracteres (letras, números, . _ -), "
            "começando por letra ou número")
    if username in RESERVED_USERNAMES:
        raise FieldError("esse nome de usuário é reservado")
    return username


def suggest_username(seed: object) -> str:
    """Build a valid, readable handle from an email/name seed."""
    base = slugify(seed).replace("-", "").replace(".", "")[:16] or "cliente"
    if not base[0].isalnum():
        base = "cliente" + base
    return validate_username(base)


def validate_email(value: object) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise FieldError("informe um email válido")
    return email


def validate_name(value: object) -> str:
    name = re.sub(r"\s+", " ", str(value or "").strip())
    if not NAME_RE.match(name):
        raise FieldError("informe seu nome completo")
    return name


def validate_phone(value: object, *, required: bool = False) -> str:
    phone = str(value or "").strip()
    if not phone:
        if required:
            raise FieldError("informe um telefone para contato")
        return ""
    digits = digits_only(phone)
    if not PHONE_RE.match(phone) or len(digits) < 10 or len(digits) > 13:
        raise FieldError("informe um telefone válido com DDD")
    return phone


def validate_cpf_field(value: object, *, required: bool = True) -> str:
    digits = digits_only(str(value or ""))
    if not digits:
        if required:
            raise FieldError("informe o CPF do titular")
        return ""
    try:
        return validate_cpf(digits)
    except DocumentError as exc:
        raise FieldError("CPF inválido — confira os dígitos") from exc


def validate_cnpj_field(value: object) -> str:
    digits = digits_only(str(value or ""))
    try:
        return validate_cnpj(digits)
    except DocumentError as exc:
        raise FieldError("CNPJ inválido — confira os dígitos") from exc


def validate_password(value: object) -> str:
    password = str(value or "")
    if len(password) < PASSWORD_MIN or len(password) > PASSWORD_MAX:
        raise FieldError(f"a senha precisa de ao menos {PASSWORD_MIN} caracteres")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        raise FieldError("a senha precisa de letras e números")
    return password


def validate_cep(value: object, *, required: bool = True) -> str:
    digits = digits_only(str(value or ""))
    if not digits:
        if required:
            raise FieldError("informe o CEP")
        return ""
    if not CEP_RE.match(digits):
        raise FieldError("CEP inválido — use 8 dígitos")
    return digits


def validate_state(value: object) -> str:
    state = str(value or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", state):
        raise FieldError("informe o estado (UF)")
    return state


def clean_text(value: object, *, field: str, min_length: int = 1,
               max_length: int = 200, required: bool = True) -> str:
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(value or "")).strip()
    if not text:
        if required:
            raise FieldError(f"informe {field}")
        return ""
    if len(text) < min_length:
        raise FieldError(f"{field} é curto demais")
    if len(text) > max_length:
        raise FieldError(f"{field} é longo demais")
    return text
