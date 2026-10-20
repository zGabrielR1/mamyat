# 0008 — Better Auth as a loopback sidecar

Date: 2026-10-20
Status: accepted

## Context

Social sign-in (Google, Facebook, Apple) with Better Auth requires a
JavaScript runtime. Putting it in the browser would expose provider secrets;
putting it on a second public host would add a second origin, CORS, and a
second TLS terminator. The shop already has exactly one container and one
public port.

## Decision

Run the Better Auth process inside the same container, bound to
`127.0.0.1:3100`, and proxy it through the Python API at `/api/betterauth/*`
(`api/betterauth_proxy.py`). The proxy rebuilds hop-by-hop headers, preserves
every `Set-Cookie`, and passes the original public host in
`X-Forwarded-Host`.

The sidecar is **stateless**: it keeps no user database. It proves the provider
identity, then POSTs a canonical-JSON claim plus `X-Bridge-Signature`
(HMAC-SHA256 with `BETTER_AUTH_BRIDGE_SECRET`) to
`/api/auth/social/bridge`. Python verifies the signature, links or creates the
customer, and returns a short-lived one-time handoff. The storefront exchanges
it at `/api/auth/social/exchange` for a normal `ms1` session.

If the sidecar fails to start, the container stays up: `/api/betterauth/health`
reports `enabled: false`, the buttons disappear, and email/password login still
works.

## Consequences

- One public origin, no CORS, no second certificate.
- An ephemeral Render instance is enough; there is no auth database to persist.
- The bridge secret is the trust boundary: it must be identical in both
  processes, and rotating it invalidates in-flight logins only.
- Canonical JSON must match Python's `json.dumps(sort_keys=True,
  separators=(",", ":"))`, including ASCII escapes — hence the explicit
  implementation in `auth-server/server.mjs`.
- Apple needs a generated client secret; the sidecar mints it from the `.p8`
  key so no short-lived secret is stored anywhere.
