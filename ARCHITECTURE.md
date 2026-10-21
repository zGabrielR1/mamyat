# Architecture

Cloudflare is the production host (decision 0009). One Worker routes `/api/*`
to port 8080 and other requests to Next standalone on port 3000 in a single
Cloudflare Container. Better Auth listens internally on port 3100. Both the
apex and `www` are Worker custom domains; `www` redirects to the canonical apex.

```
browser -> Cloudflare Worker -> Cloudflare Container
                                | Next standalone :3000
                                | Python API :8080 -> Supabase Postgres
                                | Better Auth :3100 (internal)
```

The container disk is disposable. Collections and customer session registrations
live in Supabase. Session signing comes from a stable Worker secret, and
production startup refuses incomplete service configuration. The supervisor
terminates the other children if any process exits, so the container restarts
as one unit. Local development keeps the existing three-process runner.

## Backend layout

| Module | Responsibility |
|---|---|
| `api/server.py` | stdlib HTTP router, auth extraction, rate limits, static serving, proxy, entry point |
| `api/app.py` | `App`: wires stores and services, owns every public method the router calls |
| `api/orders.py` | quote, reservations, order lifecycle, status machine, idempotency |
| `api/catalog.py` | products, variants, validation, stock |
| `api/accounts.py` | customers, admins, password policy, sessions, social links, resets |
| `api/sessions.py` | `ms1.<payload>.<sig>` tokens + revocation registry |
| `api/asaas.py` | Asaas Pix client, webhook parsing, `DemoPayments` fallback |
| `api/db.py` | `SqlStore` / `JsonStore` factory — the storage seam |
| `api/models.py` | SQLAlchemy table for the JSONB collective |
| `api/betterauth_proxy.py` | fixed-target forwarder to the loopback sidecar |
| `foundry/` | vendored stdlib modules (mail, Turnstile, password/session, bridge) |

## Request lifecycle

1. The Cloudflare Worker routes `/api/*` directly to Python. Next rewrites
   those paths to `BACKEND_URL` only when accessed directly or locally. Browser
   calls remain same-origin. The Worker replaces forwarded client IP headers.
2. `Handler._dispatch` parses the path, routes `/api/*` to `_api`, everything
   else to static files (empty `WEB_DIR` on Render).
3. Auth is header-based: `X-Customer-Token` (or `Bearer ms1.…`) and
   `X-Admin-Token`. The server never reads a cookie for identity.
4. `_api` applies a per-IP rate limit to the expensive doors (signup, login,
   reset, contact, quote, checkout, CEP, Better Auth) and calls one `App`
   method.
5. `App` validates, touches stores, sends mail, and returns a plain dict.
   Domain errors are `ApiError(status, message, code)`.

## Money and stock

Prices are integer centavos end to end (`api/money.py`). A quote is always
recomputed from the catalog: a browser-supplied price or total is ignored.
Creating an order reserves stock for 30 minutes; payment confirmation commits
it, cancellation releases it, and expired reservations are pruned on read.

Order statuses: `awaiting_payment → paid → packing → shipped → delivered`,
plus `cancelled` and `refunded`. The admin panel and the Asaas webhook are the
only writers.

## Identity

- **Customers** sign up with username + email + password (+ optional CPF and
  phone). Usernames are lowercase, 3–20 chars, start letter/digit; passwords
  need 8+ chars with a letter and a digit, hashed with PBKDF2-HMAC-SHA256.
- **Sessions** are signed tokens carrying the customer id and a session epoch;
  a revocation registry lives beside the stores. A password reset or change
  bumps the epoch, invalidating every older token.
- **Admins** are a separate store; opaque bearer tokens are stored only as
  SHA-256 fingerprints. Roles are `admin` and `viewer`. The first boot seeds
  `admin` with a generated password unless `ADMIN_PASSWORD` is set, and the
  dashboard warns until it changes (`must_change_password`).
- **Social login** never authenticates the shop directly: the sidecar proves
  the provider identity and signs a canonical-JSON claim; `App.social_bridge`
  verifies it with `BETTER_AUTH_BRIDGE_SECRET`, then links or creates a
  customer and issues a one-time handoff token that the storefront exchanges
  for a normal `ms1` session.

## Admin surface

`/admin` is a client-rendered section of the same Next app. Every action goes
through `api/server.py` → `App.admin_*` with `X-Admin-Token`; the pages never
decide a rule.

- **Catalog** — create/edit/archive products, variants and stock; the category
  list lives in `settings["categories"]` and is edited through
  `api/app.py` (`admin_categories`, `admin_create_category`,
  `admin_rename_category`, `admin_delete_category`). Renaming moves the
  products; deleting is refused while any product uses the name.
- **Customers** — search/filter, edit identity fields, block (sets
  `active=false`, bumps the session epoch and revokes tokens), send a reset
  link, anonymize (keeps orders, clears personal data), or create an account
  with a generated password.
- **Orders** — the existing status machine, plus manual payment confirmation in
  demo mode.
- **Monitor** — dashboard aggregates revenue, ticket, low stock and best
  sellers from the same stores the storefront reads.

See [docs/admin.md](docs/admin.md) for the field rules and endpoint map.

## Storage

`make_store(collection, default, data_dir, database_url)` returns a
`JsonStore` when `DATABASE_URL` is empty and a `SqlStore` otherwise. Both
implement `read`, `write`, `update`, `append`, `replace`, `ping`. Postgres
keeps one JSONB document per collection in `mamyat_documents`; `update` takes
a row lock, so a read-modify-write is atomic across instances. See
[decisions/0007-jsonb-collections.md](decisions/0007-jsonb-collections.md).

Collections: `products`, `orders`, `customers`, `admins`, `admin_sessions`,
`password_resets`, `oauth_links`, `settings`, `reservations`, `contacts`,
`customer_sessions`.

## Optional rails (all fail safe)

| Rail | Configured by | Unconfigured behaviour |
|---|---|---|
| Pix | `ASAAS_API_KEY` | `DemoPayments`, labelled "demonstração" |
| Email | `RESEND_API_KEY` + `MAIL_FROM` | console mailer |
| Captcha | `TURNSTILE_SECRET_KEY` + site key | verifier disabled, gate is a no-op |
| Social | provider credentials + `BETTER_AUTH_SECRET` | buttons hidden, endpoints report disabled |
| Postgres | `DATABASE_URL` | JSON files under `DATA_DIR` |

## Frontend

`web/` is a client-rendered Next.js App Router site. `lib/api.ts` is the only
fetch wrapper; it stores the customer/admin token and raises `ApiFailure` with
the server's error code. `components/providers.tsx` holds the config, auth and
cart contexts. Admin pages share `components/admin/admin-shell.tsx`.
`next.config.ts` rewrites `/api/*` to `BACKEND_URL` and sets security headers.
