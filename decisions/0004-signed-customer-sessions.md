# 0004 — Signed customer sessions

Date: 2026-10-20
Status: accepted

## Context

Customers must stay signed in across the Vercel frontend and the Render API
without a shared cookie domain being available at first, and without a session
table lookup on every request. The operator's `demo/player_session.py` already
proved the shape: a signed token carrying the subject and an epoch.

## Decision

Issue `ms1.<payload>.<signature>` tokens: base64url JSON plus an HMAC-SHA256
over it (`api/sessions.py`). The payload carries the customer id, an epoch and
an expiry. The browser sends it as `X-Customer-Token` (the frontend stores it
in `localStorage`); the server never reads a cookie for identity.

A `SessionRegistry` beside the stores records issued tokens so a logout can
revoke one. Password change and password reset bump `session_epoch`, which
invalidates every older token at once.

Signing-key resolution order: `CUSTOMER_SESSION_SECRET`, then a key derived
from `BETTER_AUTH_SECRET`, then a generated file in `DATA_DIR`
(`customer_session.key`, mode 0600). That keeps local runs stable without
requiring a secret, while a hosted deploy can rotate deliberately.

Admins are a separate mechanism: opaque random bearer tokens whose SHA-256
fingerprints are stored, roles `admin`/`viewer`.

## Consequences

- No database round-trip to verify a session; revocation is explicit.
- A stolen token is valid until expiry or a password change — the expiry is
  short and the frontend refreshes by re-login.
- Rotating the signing key logs every customer out. That is the intended
  emergency lever.
- Because identity is header-based, CORS matters: `CORS_ORIGINS` names the
  storefront origin in production.
