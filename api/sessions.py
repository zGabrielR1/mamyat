"""Signed customer sessions — stateless tokens plus a small revocation registry.

A token is ``ms1.<base64url(payload)>.<base64url(hmac-sha256)>``. The payload
names the customer, their session epoch, the session id, issue/expiry instants
and whether "continuar conectado" was asked for. The signature covers the exact
``ms1.<payload>`` text with a fixed context prefix, so a token minted for
another purpose cannot be replayed here.

Revocation happens two ways: bumping ``session_epoch`` on the customer row
(password change, admin reset) invalidates every token at once, and deleting a
row from the registry logs one device out.

Adapted from the operator's ``demo/player_session.py`` (decision 0004 here).
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass

VERSION = "ms1"
CONTEXT = b"mamyat.customer-session.v1\n"

TTL_SECONDS = 12 * 60 * 60
REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_TTL_SECONDS = 365 * 24 * 60 * 60
MAX_SESSION_ID = 64
KEY_FILE = "customer_session.key"


class SessionError(ValueError):
    """A token is missing, malformed, forged, expired or revoked."""


@dataclass(frozen=True)
class CustomerSession:
    customer_id: str
    epoch: int
    issued_at: int
    expires_at: int
    remember: bool = False
    session_id: str = ""

    def remaining(self, now: float | None = None) -> float:
        instant = time.time() if now is None else float(now)
        return max(0.0, self.expires_at - instant)


def new_session_id() -> str:
    return secrets.token_urlsafe(16)


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    padded = text + "=" * (-len(text) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except (binascii.Error, ValueError, UnicodeEncodeError) as exc:
        raise SessionError("sessão inválida") from exc


class CustomerSessions:
    """Mint and verify tokens. The host owns the policy around them."""

    def __init__(self, secret: str, *, ttl_seconds: int = TTL_SECONDS,
                 remember_ttl_seconds: int = REMEMBER_TTL_SECONDS) -> None:
        if not isinstance(secret, str) or not secret:
            raise SessionError("o segredo de sessão não está configurado")
        for name, value in (("ttl_seconds", ttl_seconds),
                            ("remember_ttl_seconds", remember_ttl_seconds)):
            if isinstance(value, bool) or not isinstance(value, int) or \
                    not 1 <= value <= MAX_TTL_SECONDS:
                raise SessionError(f"{name} fora do intervalo suportado")
        self._secret = secret.encode("utf-8")
        self.ttl_seconds = ttl_seconds
        self.remember_ttl_seconds = remember_ttl_seconds

    def issue(self, customer_id: str, *, epoch: int = 0,
              remember: bool = False, now: float | None = None,
              session_id: str | None = None) -> str:
        customer_id = str(customer_id or "")
        if not customer_id or len(customer_id) > 128:
            raise SessionError("a sessão precisa de um cliente")
        try:
            epoch = int(epoch)
        except (TypeError, ValueError):
            raise SessionError("epoch inválido") from None
        if epoch < 0:
            raise SessionError("epoch inválido")
        sid = str(session_id or new_session_id()).strip()
        if not sid or len(sid) > MAX_SESSION_ID:
            raise SessionError("id de sessão inválido")
        issued = int(time.time() if now is None else now)
        ttl = self.remember_ttl_seconds if remember else self.ttl_seconds
        payload = {
            "c": customer_id,
            "e": epoch,
            "s": sid,
            "iat": issued,
            "exp": issued + ttl,
            "r": bool(remember),
        }
        body = (f"{VERSION}." + _b64e(json.dumps(
            payload, sort_keys=True, separators=(",", ":")).encode("utf-8")))
        return f"{body}.{self._sign(body)}"

    def _sign(self, body: str) -> str:
        digest = hmac.new(self._secret, CONTEXT + body.encode("ascii"),
                          hashlib.sha256).digest()
        return _b64e(digest)

    def verify(self, token: str, *, now: float | None = None) -> CustomerSession:
        token = str(token or "").strip()
        if not token or len(token) > 2048:
            raise SessionError("sessão ausente")
        parts = token.split(".")
        if len(parts) != 3 or parts[0] != VERSION:
            raise SessionError("sessão inválida")
        body = f"{parts[0]}.{parts[1]}"
        expected = self._sign(body)
        if not hmac.compare_digest(expected, parts[2]):
            raise SessionError("assinatura inválida")
        try:
            payload = json.loads(_b64d(parts[1]).decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise SessionError("sessão inválida") from exc
        if not isinstance(payload, dict):
            raise SessionError("sessão inválida")
        customer_id = payload.get("c")
        session_id = payload.get("s")
        if not isinstance(customer_id, str) or not customer_id or \
                len(customer_id) > 128:
            raise SessionError("sessão inválida")
        if not isinstance(session_id, str) or not session_id or \
                len(session_id) > MAX_SESSION_ID:
            raise SessionError("sessão sem identificador")
        try:
            epoch = int(payload.get("e"))
            issued = int(payload.get("iat"))
            expires = int(payload.get("exp"))
        except (TypeError, ValueError):
            raise SessionError("sessão inválida") from None
        if epoch < 0 or issued <= 0 or expires <= issued:
            raise SessionError("sessão inválida")
        if expires - issued > MAX_TTL_SECONDS:
            raise SessionError("sessão inválida")
        instant = time.time() if now is None else float(now)
        if issued > instant + 300:
            raise SessionError("sessão emitida no futuro")
        if instant >= expires:
            raise SessionError("sessão expirada")
        return CustomerSession(customer_id=customer_id, epoch=epoch,
                               issued_at=issued, expires_at=expires,
                               remember=bool(payload.get("r")),
                               session_id=session_id)


class SessionRegistry:
    """Live rows, so a logout actually logs one device out."""

    def __init__(self, path: str, *, max_per_customer: int = 20, store=None) -> None:
        self.path = path
        self.store = store
        self.lock = threading.RLock()
        self.max_per_customer = max(1, int(max_per_customer))
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        if store is None and not os.path.exists(path):
            self._write({})

    def _read(self) -> dict:
        if self.store is not None:
            return self.store.read()
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            return {}
        rows = data.get("sessions") if isinstance(data, dict) else None
        return rows if isinstance(rows, dict) else {}

    def _write(self, rows: dict) -> None:
        if self.store is not None:
            self.store.write(rows)
            return
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump({"sessions": rows}, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)

    def _update(self, mutate):
        if self.store is not None:
            return self.store.update(mutate)
        with self.lock:
            rows = self._read()
            result = mutate(rows)
            self._write(rows)
            return result

    @staticmethod
    def _exp(row: dict) -> int:
        try:
            return int(row.get("expires") or 0)
        except (TypeError, ValueError):
            return 0

    def _prune(self, rows: dict, instant: int) -> None:
        dead = [sid for sid, row in rows.items()
                if not isinstance(row, dict) or self._exp(row) <= instant]
        for sid in dead:
            rows.pop(sid, None)

    def record(self, session: CustomerSession, *, user_agent: str = "",
               ip: str = "", now: float | None = None) -> None:
        instant = int(time.time() if now is None else now)
        def record(rows):
            self._prune(rows, instant)
            mine = sorted(((sid, row) for sid, row in rows.items()
                           if isinstance(row, dict) and
                           row.get("customer") == session.customer_id),
                          key=lambda item: int(item[1].get("created") or 0))
            while len(mine) >= self.max_per_customer:
                rows.pop(mine.pop(0)[0], None)
            rows[session.session_id] = {
                "customer": session.customer_id,
                "epoch": int(session.epoch),
                "created": int(session.issued_at),
                "seen": instant,
                "expires": int(session.expires_at),
                "remember": bool(session.remember),
                "user_agent": str(user_agent or "")[:200],
                "ip": str(ip or "")[:64],
            }
        self._update(record)

    def alive(self, session: CustomerSession) -> bool:
        instant = int(time.time())
        with self.lock:
            row = self._read().get(session.session_id)
            if not isinstance(row, dict) or self._exp(row) <= instant:
                return False
            return row.get("customer") == session.customer_id

    def revoke(self, session_id: str) -> bool:
        return self._update(lambda rows: rows.pop(str(session_id or ""), None) is not None)

    def revoke_customer(self, customer_id: str) -> int:
        def revoke(rows):
            dead = [sid for sid, row in rows.items()
                    if isinstance(row, dict) and
                    row.get("customer") == customer_id]
            for sid in dead:
                rows.pop(sid, None)
            return len(dead)
        return self._update(revoke)


def derive_secret(source: str) -> str:
    """A sub-key for customer sessions from an existing high-entropy secret."""
    if not source:
        raise SessionError("cannot derive from an empty secret")
    return hmac.new(source.encode("utf-8"),
                    b"mamyat.customer-session.derive.v1",
                    hashlib.sha256).hexdigest()


def _read_key_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def _write_key_file(path: str, key: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(key)
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, path)


def resolve_secret(env: dict[str, str] | None = None,
                   data_dir: str | None = None,
                   secret: str | None = None) -> str:
    """Signing key order: explicit, CUSTOMER_SESSION_SECRET, derived, file."""
    if secret:
        return str(secret)
    source = dict(env or {})
    explicit = (source.get("CUSTOMER_SESSION_SECRET") or "").strip()
    if explicit:
        return explicit
    betterauth = (source.get("BETTER_AUTH_SECRET") or "").strip()
    if betterauth:
        return derive_secret(betterauth)
    if not data_dir:
        raise SessionError("no session secret and no data directory")
    path = os.path.join(data_dir, KEY_FILE)
    key = _read_key_file(path)
    if not key:
        key = secrets.token_urlsafe(48)
        _write_key_file(path, key)
    return key


def resolve_customer_sessions(env: dict[str, str] | None = None,
                              data_dir: str | None = None,
                              secret: str | None = None,
                              **policy) -> CustomerSessions:
    return CustomerSessions(resolve_secret(env, data_dir, secret), **policy)
