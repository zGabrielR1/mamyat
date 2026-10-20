"""Customer and admin accounts.

Customer model, deliberately the same shape as the operator's:

* a **username** — lowercase, 3–20 chars, letters/digits/._-, unique;
* an **email** — lowercased, unique, also a login identifier;
* a **password** — PBKDF2-HMAC-SHA256 (foundry.auth), 8+ chars with letters
  and numbers, hashed with a fresh salt;
* an optional **CPF**, unique when present and validated by check digits;
* a **session epoch** — bumped on password change/reset, which invalidates
  every signed token minted before it;
* social accounts have no password until the owner sets one via "esqueci a
  senha"; a provider link is keyed on ``provider:subject``, not on email.

Admins are a separate store with two roles (admin/viewer) and opaque bearer
sessions stored as SHA-256 fingerprints.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from typing import Any

from foundry.auth import PasswordError, PasswordHasher, issue_session, \
    token_fingerprint
from foundry.betterauth import SocialIdentity

from .sessions import CustomerSessions, SessionError, SessionRegistry
from .store import JsonStore, atomic_id, now_iso
from .validation import (FieldError, suggest_username, validate_cpf_field,
                         validate_email, validate_name, validate_password,
                         validate_phone, validate_username)


class AccountError(ValueError):
    """An account action was refused. Message is customer-safe."""


RESET_TTL_SECONDS = 30 * 60
RESET_MAX_PER_HOUR = 3
HANDOFF_TTL_SECONDS = 5 * 60


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_password() -> str:
    """A generated password that satisfies the policy (letter + digit).

    ``secrets.token_urlsafe`` can come back without a digit, and the policy
    rejects that — retrying is cheaper than a boot that dies in seeding.
    """
    for _ in range(20):
        candidate = "mamy-" + secrets.token_urlsafe(9)
        try:
            validate_password(candidate)
            return candidate
        except FieldError:
            continue
    return "mamy-" + str(secrets.randbelow(10 ** 9)).zfill(9)


class Accounts:
    def __init__(self, customers: JsonStore, admins: JsonStore,
                 admin_sessions: JsonStore, resets: JsonStore,
                 oauth_links: JsonStore, sessions: CustomerSessions,
                 registry: SessionRegistry, hasher: PasswordHasher, *,
                 clock=None, login_delay: float = 0.12,
                 seed_admin: tuple[str, str, bool] = ("admin", "admin", True)) -> None:
        self.customers = customers
        self.admins = admins
        self.admin_sessions = admin_sessions
        self.resets = resets
        self.oauth_links = oauth_links
        self.sessions = sessions
        self.registry = registry
        self.hasher = hasher
        self.clock = clock or time.time
        self.login_delay = max(0.0, float(login_delay))
        self._handoffs: dict[str, dict] = {}
        self._lock = threading.RLock()
        self._seed_admin(*seed_admin)

    # -- seed --------------------------------------------------------
    def _seed_admin(self, username: str, password: str,
                    must_change: bool = True) -> None:
        if self.admins.read():
            return
        username = str(username or "admin").strip().lower()[:32] or "admin"
        password = str(password or "admin")
        self.admins.append({
            "id": atomic_id("adm"), "username": username,
            "password_hash": self.hasher.hash(password),
            "role": "admin", "must_change_password": bool(must_change),
            "created_at": now_iso(),
        })

    @property
    def default_admin(self) -> bool:
        """True while the seeded password has not been changed."""
        return any(row.get("must_change_password") for row in self.admins.read())

    # -- customer reads ---------------------------------------------
    def by_id(self, customer_id: str) -> dict | None:
        for row in self.customers.read():
            if row.get("id") == customer_id:
                return row
        return None

    def by_username(self, username: str) -> dict | None:
        username = str(username or "").strip().lower()
        for row in self.customers.read():
            if row.get("username") == username:
                return row
        return None

    def by_email(self, email: str) -> dict | None:
        email = str(email or "").strip().lower()
        for row in self.customers.read():
            if row.get("email") == email:
                return row
        return None

    def public(self, customer: dict) -> dict:
        return {
            "id": customer["id"], "username": customer["username"],
            "email": customer["email"], "name": customer["name"],
            "phone": customer.get("phone", ""), "cpf": customer.get("cpf", ""),
            "created_at": customer.get("created_at"),
            "updated_at": customer.get("updated_at"),
            "active": bool(customer.get("active", True)),
            "marketing": bool(customer.get("marketing", False)),
            "deleted_at": customer.get("deleted_at"),
            "has_password": bool(customer.get("password_hash")),
            "provider": customer.get("provider", ""),
        }

    # -- signup / login ---------------------------------------------
    def signup(self, payload: object, *, remember: bool = False) -> tuple[dict, str]:
        if not isinstance(payload, dict):
            raise AccountError("dados inválidos")
        try:
            username = validate_username(payload.get("username"))
            email = validate_email(payload.get("email"))
            name = validate_name(payload.get("name"))
            password = validate_password(payload.get("password"))
            phone = validate_phone(payload.get("phone"), required=False)
            cpf = validate_cpf_field(payload.get("cpf"), required=False)
        except FieldError as exc:
            raise AccountError(str(exc)) from exc
        with self._lock:
            rows = self.customers.read()
            if any(row.get("username") == username for row in rows):
                raise AccountError("esse nome de usuário já está em uso")
            if any(row.get("email") == email for row in rows):
                raise AccountError("já existe uma conta com esse email")
            if cpf and any(row.get("cpf") == cpf for row in rows):
                raise AccountError("já existe uma conta com esse CPF")
            customer = {
                "id": atomic_id("cus"), "username": username, "email": email,
                "name": name, "phone": phone, "cpf": cpf,
                "password_hash": self.hasher.hash(password),
                "session_epoch": 0, "provider": "",
                "marketing": bool(payload.get("marketing", False)),
                "created_at": now_iso(),
            }
            rows.append(customer)
            self.customers.write(rows)
        token = self._mint(customer, remember=remember)
        return customer, token

    def login(self, identifier: object, password: object,
              *, remember: bool = False) -> tuple[dict, str]:
        value = str(identifier or "").strip().lower()
        customer = self.by_email(value) if "@" in value else self.by_username(value)
        stored = customer.get("password_hash") if customer else ""
        ok = bool(stored) and self.hasher.verify(str(password or ""), stored)
        if not ok:
            if self.login_delay:
                time.sleep(self.login_delay)
            raise AccountError("email/usuário ou senha incorretos")
        if not customer.get("active", True):
            raise AccountError("esta conta está bloqueada; fale com o ateliê")
        if self.hasher.needs_rehash(stored):
            customer = {**customer, "password_hash": self.hasher.hash(str(password))}
            self.customers.replace(
                lambda row: row.get("id") == customer["id"], customer)
        token = self._mint(customer, remember=remember)
        return customer, token

    def _mint(self, customer: dict, *, remember: bool) -> str:
        token = self.sessions.issue(customer["id"],
                                    epoch=int(customer.get("session_epoch") or 0),
                                    remember=remember)
        verified = self.sessions.verify(token)
        self.registry.record(verified)
        return token

    def authenticate(self, token: str) -> dict | None:
        try:
            session = self.sessions.verify(token)
        except SessionError:
            return None
        customer = self.by_id(session.customer_id)
        if not customer:
            return None
        if not customer.get("active", True):
            return None
        if int(customer.get("session_epoch") or 0) != session.epoch:
            return None
        if not self.registry.alive(session):
            return None
        return customer

    def logout(self, token: str) -> bool:
        try:
            session = self.sessions.verify(token)
        except SessionError:
            return False
        return self.registry.revoke(session.session_id)

    def change_password(self, customer_id: str, current: str,
                        new_password: str) -> str:
        customer = self.by_id(customer_id)
        if not customer:
            raise AccountError("conta não encontrada")
        if customer.get("password_hash") and not self.hasher.verify(
                current, customer["password_hash"]):
            raise AccountError("a senha atual está incorreta")
        try:
            password = validate_password(new_password)
        except FieldError as exc:
            raise AccountError(str(exc)) from exc
        updated = {
            **customer,
            "password_hash": self.hasher.hash(password),
            "session_epoch": int(customer.get("session_epoch") or 0) + 1,
            "updated_at": now_iso(),
        }
        self.customers.replace(lambda row: row.get("id") == customer_id, updated)
        self.registry.revoke_customer(customer_id)
        return self._mint(updated, remember=False)

    def update_profile(self, customer_id: str, payload: dict) -> dict:
        customer = self.by_id(customer_id)
        if not customer:
            raise AccountError("conta não encontrada")
        name = validate_name(payload.get("name", customer.get("name")))
        phone = validate_phone(payload.get("phone", customer.get("phone")),
                               required=False)
        cpf = validate_cpf_field(payload.get("cpf", customer.get("cpf")),
                                 required=False)
        if cpf:
            for row in self.customers.read():
                if row.get("cpf") == cpf and row.get("id") != customer_id:
                    raise AccountError("já existe uma conta com esse CPF")
        updated = {**customer, "name": name, "phone": phone, "cpf": cpf,
                   "marketing": bool(payload.get("marketing",
                                                  customer.get("marketing", False))),
                   "updated_at": now_iso()}
        self.customers.replace(lambda row: row.get("id") == customer_id, updated)
        return updated

    # -- admin: customer management ---------------------------------
    def _temporary_password(self) -> str:
        """A generated password that satisfies the policy."""
        return generate_password()

    def admin_create_customer(self, payload: object) -> tuple[dict, str]:
        """Create an account from the panel. Returns (customer, temp password)."""
        if not isinstance(payload, dict):
            raise AccountError("dados inválidos")
        try:
            username = validate_username(payload.get("username"))
            email = validate_email(payload.get("email"))
            name = validate_name(payload.get("name"))
            phone = validate_phone(payload.get("phone"), required=False)
            cpf = validate_cpf_field(payload.get("cpf"), required=False)
        except FieldError as exc:
            raise AccountError(str(exc)) from exc
        supplied = str(payload.get("password") or "").strip()
        temporary = not supplied
        try:
            password = validate_password(supplied) if supplied \
                else self._temporary_password()
        except FieldError as exc:
            raise AccountError(str(exc)) from exc
        with self._lock:
            rows = self.customers.read()
            if any(row.get("username") == username for row in rows):
                raise AccountError("esse nome de usuário já está em uso")
            if any(row.get("email") == email for row in rows):
                raise AccountError("já existe uma conta com esse email")
            if cpf and any(row.get("cpf") == cpf for row in rows):
                raise AccountError("já existe uma conta com esse CPF")
            customer = {
                "id": atomic_id("cus"), "username": username, "email": email,
                "name": name, "phone": phone, "cpf": cpf,
                "password_hash": self.hasher.hash(password),
                "session_epoch": 0, "provider": "", "active": True,
                "marketing": bool(payload.get("marketing", False)),
                "created_at": now_iso(),
            }
            rows.append(customer)
            self.customers.write(rows)
        return customer, password if temporary else ""

    def admin_update_customer(self, customer_id: str, payload: object) -> dict:
        customer = self.by_id(customer_id)
        if not customer:
            raise AccountError("conta não encontrada")
        if not isinstance(payload, dict):
            raise AccountError("dados inválidos")
        try:
            username = validate_username(payload.get(
                "username", customer.get("username")))
            email = validate_email(payload.get("email", customer.get("email")))
            name = validate_name(payload.get("name", customer.get("name")))
            phone = validate_phone(payload.get("phone", customer.get("phone")),
                                   required=False)
            cpf = validate_cpf_field(payload.get("cpf", customer.get("cpf")),
                                     required=False)
        except FieldError as exc:
            raise AccountError(str(exc)) from exc
        active = bool(payload.get("active", customer.get("active", True)))
        with self._lock:
            rows = self.customers.read()
            for row in rows:
                if row.get("id") == customer_id:
                    continue
                if row.get("username") == username:
                    raise AccountError("esse nome de usuário já está em uso")
                if row.get("email") == email:
                    raise AccountError("já existe uma conta com esse email")
                if cpf and row.get("cpf") == cpf:
                    raise AccountError("já existe uma conta com esse CPF")
            updated = {
                **customer, "username": username, "email": email, "name": name,
                "phone": phone, "cpf": cpf, "active": active,
                "marketing": bool(payload.get("marketing",
                                              customer.get("marketing", False))),
                "updated_at": now_iso(),
            }
            if not active and customer.get("active", True):
                # blocking must end the sessions it just invalidated
                updated["session_epoch"] = int(
                    customer.get("session_epoch") or 0) + 1
            self.customers.write([
                updated if row.get("id") == customer_id else row
                for row in rows])
        if not active:
            self.registry.revoke_customer(customer_id)
        return updated

    def admin_delete_customer(self, customer_id: str) -> dict:
        """Anonymize an account, keeping its orders for the books."""
        customer = self.by_id(customer_id)
        if not customer:
            raise AccountError("conta não encontrada")
        suffix = str(customer["id"]).split("_")[-1][:10] or secrets.token_hex(5)
        anonymized = {
            **customer,
            "username": f"removido{suffix}"[:32],
            "email": f"removido+{suffix}@mamyatelie.invalid",
            "name": "Conta removida", "phone": "", "cpf": "",
            "password_hash": "", "provider": "", "marketing": False,
            "active": False, "deleted_at": now_iso(),
            "session_epoch": int(customer.get("session_epoch") or 0) + 1,
            "updated_at": now_iso(),
        }
        self.customers.replace(lambda row: row.get("id") == customer_id,
                               anonymized)
        self.registry.revoke_customer(customer_id)

        def drop_links(links):
            for key, value in list(links.items()):
                if value == customer_id:
                    links.pop(key, None)

        self.oauth_links.update(drop_links)
        return anonymized

    # -- password reset ---------------------------------------------
    def request_password_reset(self, email: object, send: callable,
                               *, force: bool = False) -> bool:
        """Mint a reset link and call ``send(customer, token)``.

        Returns True when a customer existed (the caller answers neutrally
        either way). A second request invalidates the first. ``force`` skips
        the per-customer hourly cap, which an admin acting on a ticket may.
        """
        customer = self.by_email(str(email or ""))
        if not customer:
            if self.login_delay:
                time.sleep(self.login_delay)
            return False
        now = self.clock()
        token = secrets.token_urlsafe(32)
        with self._lock:
            rows = self.resets.read()
            recent = [row for row in rows
                      if row.get("customer_id") == customer["id"] and
                      float(row.get("requested_at") or 0) > now - 3600]
            if len(recent) >= RESET_MAX_PER_HOUR and not force:
                raise AccountError("muitos pedidos de recuperação; tente mais tarde")
            rows = [row for row in rows if row.get("customer_id") != customer["id"]]
            rows.append({
                "token_sha256": _sha256(token), "customer_id": customer["id"],
                "requested_at": now, "expires_at": now + RESET_TTL_SECONDS,
                "used": False,
            })
            self.resets.write(rows)
        try:
            send(customer, token)
        except Exception:
            pass  # the neutral answer stands; a mail retry is a provider concern
        return True

    def complete_password_reset(self, token: str, new_password: str) -> str:
        token = str(token or "").strip()
        if not token:
            raise AccountError("link inválido")
        digest = _sha256(token)
        now = self.clock()
        with self._lock:
            rows = self.resets.read()
            match = None
            for row in rows:
                if hmac.compare_digest(str(row.get("token_sha256", "")), digest):
                    match = row
                    break
            if not match or match.get("used") or \
                    float(match.get("expires_at") or 0) <= now:
                raise AccountError("link expirado ou já utilizado")
            customer = self.by_id(match["customer_id"])
            if not customer:
                raise AccountError("link inválido")
            try:
                password = validate_password(new_password)
            except FieldError as exc:
                raise AccountError(str(exc)) from exc
            match["used"] = True
            self.resets.write(rows)
        updated = {
            **customer,
            "password_hash": self.hasher.hash(password),
            "session_epoch": int(customer.get("session_epoch") or 0) + 1,
            "updated_at": now_iso(),
        }
        self.customers.replace(lambda row: row.get("id") == customer["id"], updated)
        self.registry.revoke_customer(customer["id"])
        return self._mint(updated, remember=False)

    # -- social login ------------------------------------------------
    def login_social(self, identity: SocialIdentity) -> tuple[dict, bool]:
        """Find or create the customer for a verified provider identity."""
        key = identity.key
        links = self.oauth_links.read()
        linked_id = links.get(key)
        if linked_id:
            customer = self.by_id(str(linked_id))
            if customer:
                if not customer.get("active", True):
                    raise AccountError(
                        "esta conta está bloqueada; fale com o ateliê")
                return customer, False
        customer = self.by_email(identity.email) if identity.email else None
        if customer and not customer.get("active", True):
            raise AccountError("esta conta está bloqueada; fale com o ateliê")
        created = False
        if not customer:
            email = identity.email
            if not email:
                # Apple/Facebook may omit it; a local placeholder keeps the
                # row valid without inventing a deliverable address.
                email = f"{identity.provider}-{identity.subject[:24]}@social.mamyatelie.invalid"
            username = self._unique_username(
                suggest_username(identity.email.split("@")[0]
                                 if identity.email else identity.name or "cliente"))
            customer = {
                "id": atomic_id("cus"), "username": username,
                "email": email, "name": identity.name or username,
                "phone": "", "cpf": "", "password_hash": "",
                "session_epoch": 0, "provider": identity.provider,
                "marketing": False, "created_at": now_iso(),
            }
            with self._lock:
                rows = self.customers.read()
                if any(row.get("email") == email for row in rows):
                    customer = next(row for row in rows if row.get("email") == email)
                else:
                    rows.append(customer)
                    self.customers.write(rows)
                    created = True
        with self._lock:
            links = self.oauth_links.read()
            links[key] = customer["id"]
            self.oauth_links.write(links)
        return customer, created

    def _unique_username(self, seed: str) -> str:
        try:
            base = validate_username(seed)
        except FieldError:
            base = "cliente"
        rows = self.customers.read()
        taken = {row.get("username") for row in rows}
        if base not in taken:
            return base
        for suffix in range(2, 1000):
            candidate = f"{base[:max(3, 20 - len(str(suffix)))]}{suffix}"
            if candidate not in taken:
                return candidate
        return f"cliente{secrets.randbelow(99999):05d}"

    # -- social handoff ---------------------------------------------
    def issue_handoff(self, customer_id: str) -> str:
        token = secrets.token_urlsafe(24)
        with self._lock:
            self._handoffs[token] = {
                "customer_id": customer_id,
                "expires_at": self.clock() + HANDOFF_TTL_SECONDS,
            }
            # keep the map small even if nobody exchanges the tokens
            dead = [key for key, row in self._handoffs.items()
                    if float(row.get("expires_at") or 0) <= self.clock()]
            for key in dead:
                self._handoffs.pop(key, None)
        return token

    def consume_handoff(self, token: str) -> tuple[dict, str]:
        token = str(token or "").strip()
        with self._lock:
            row = self._handoffs.pop(token, None)
        if not row or float(row.get("expires_at") or 0) <= self.clock():
            raise AccountError("sessão social expirada; entre novamente")
        customer = self.by_id(row["customer_id"])
        if not customer:
            raise AccountError("conta não encontrada")
        return customer, self._mint(customer, remember=False)

    # -- admin -------------------------------------------------------
    def admin_login(self, username: object, password: object) -> tuple[dict, str]:
        username = str(username or "").strip().lower()
        admin = None
        for row in self.admins.read():
            if row.get("username") == username:
                admin = row
                break
        ok = bool(admin) and self.hasher.verify(
            str(password or ""), admin.get("password_hash", ""))
        if not ok:
            if self.login_delay:
                time.sleep(self.login_delay)
            raise AccountError("usuário ou senha incorretos")
        session = issue_session(remember=False)
        expires_at = session.expires_at
        self.admin_sessions.update(lambda rows: rows.__setitem__(
            token_fingerprint(session.token),
            {"admin_id": admin["id"], "username": admin["username"],
             "role": admin.get("role", "viewer"), "expires_at": expires_at}))
        return admin, session.token

    def admin_for_token(self, token: str) -> dict | None:
        token = str(token or "").strip()
        if not token:
            return None
        fingerprint = token_fingerprint(token)
        rows = self.admin_sessions.read()
        row = rows.get(fingerprint)
        if not isinstance(row, dict):
            return None
        if float(row.get("expires_at") or 0) <= self.clock():
            self.admin_sessions.update(lambda data: data.pop(fingerprint, None))
            return None
        for admin in self.admins.read():
            if admin.get("id") == row.get("admin_id"):
                return admin
        return None

    def admin_logout(self, token: str) -> bool:
        fingerprint = token_fingerprint(str(token or ""))
        return bool(self.admin_sessions.update(
            lambda rows: rows.pop(fingerprint, None) is not None))

    def admin_change_password(self, admin_id: str, current: str,
                              new_password: str) -> None:
        admin = next((row for row in self.admins.read()
                      if row.get("id") == admin_id), None)
        if not admin:
            raise AccountError("usuário não encontrado")
        if not self.hasher.verify(str(current or ""),
                                  admin.get("password_hash", "")):
            raise AccountError("a senha atual está incorreta")
        try:
            password = validate_password(new_password)
        except FieldError as exc:
            raise AccountError(str(exc)) from exc
        updated = {**admin, "password_hash": self.hasher.hash(password),
                   "must_change_password": False}
        self.admins.replace(lambda row: row.get("id") == admin_id, updated)
