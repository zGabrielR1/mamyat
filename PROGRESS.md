# Progress

## Backend

- [x] Money in integer centavos, locale-aware formatting (`api/money.py`)
- [x] Validation: username, email, CPF, CEP, phone, password policy
- [x] Pluggable stores: JSON files or Postgres JSONB (`api/db.py`)
- [x] Catalog with variants, stock, made-to-order entries, 12 seed products
- [x] Cart quote recomputed server-side; coupons and shipping rules
- [x] Orders: 30-minute reservations, idempotency, status machine, cancel
- [x] Guest lookup by order number + email
- [x] Customer accounts: signup, login, profile, password change
- [x] Password reset by email with one-time tokens and session epoch bump
- [x] Signed `ms1` sessions with revocation registry
- [x] Admin auth (roles, fingerprints), dashboard, products, orders, settings,
      customers, contacts
- [x] Admin catalog: create/edit/archive products, variants, stock, images
- [x] Dynamic categories: create, rename (moves products), delete when unused
- [x] Admin customers: detail with order history, edit, block/unblock, send
      reset, anonymize, create account with generated password
- [x] Asaas Pix client + webhook, demo rail fallback
- [x] Resend mail with console fallback and branded templates
- [x] Turnstile gate on signup, login, reset, contact, checkout
- [x] ViaCEP lookup with a one-day in-process cache
- [x] Better Auth sidecar + signed social bridge + handoff exchange
- [x] 25-test suite, no network, ~13 s (PBKDF2)

## Frontend

- [x] Next.js 16, React 19, Tailwind 4, shadcn/ui (radix-nova)
- [x] Home, catalog, product, cart, checkout, order status/lookup
- [x] Login, signup, social handoff, forgot/reset password
- [x] Account page with profile, password and order history
- [x] About, made-to-order, contact, policies, 404
- [x] Admin: dashboard, orders, products, settings, customers, contacts
- [x] Admin: category manager, product create/edit, customer management dialogs
- [x] Warm palette, responsive shell, cart sheet, Turnstile widget
- [x] Light/dark theme toggle, remembered per visitor (light is the default)
- [x] WhatsApp shortcuts: floating button, footer number, contact cards and
      product questions, all linked to `wa.me` with a prefilled message
- [x] Atelier location set to Concórdia · SC (store config, footer, pickup text)
- [x] 12 SVG product illustrations matching the seed paths
- [x] `npm run typecheck` and `npm run build` green (24 routes)

## Deploy and operations

- [x] `Dockerfile` (Python + Node sidecar), `render.yaml`, `.dockerignore`
- [x] `.env.example` covering every rail
- [x] Supabase migration with RLS (service role only)
- [x] `scripts/verify.py`, `scripts/smoke.py`, `scripts/render_deploy.py`
- [x] One-command local stack: `python scripts/dev.py` (API + auth + web)
- [x] Makefile targets for dev/test/build/run/smoke/check
- [x] Docs: admin, deploy, oauth, mail, turnstile, asaas, supabase, owner checklist
- [ ] Live Cloudflare + Supabase deployment (needs access and Docker)
- [ ] Real Asaas production keys and webhook registration

## Cloudflare migration (2026-10-21)

- [x] Worker routing, apex/www custom domains, full-stack container config
- [x] Next standalone and three-process supervisor
- [x] Resend domain provisioned from .env.local key; sending DNS pending
- [x] Repeatable DNS/Turnstile setup and deployment prerequisite check
- [x] Production guard, database-aware health and persistent session registry
- [x] Turnstile lifecycle/theme and refresh after submission
- [x] Six network-free production tests (31 backend tests total)
- [x] Official Cloudflare skills installed locally; project MCP config added
- [ ] MCP OAuth (CLI/browser unavailable)
- [ ] Domain ownership/registration, DNS delegation and Resend verification
- [ ] Supabase connection/migration and deployed container validation

Validation: python scripts/verify.py passed (31 backend tests + frontend types);
production Next build passed; 29 HTTP smoke checks passed on a temporary store;
Cloudflare Worker dry run passed with container build skipped (Docker absent).
No live deployment, real email delivery, or production captcha was verified.

## Live provisioning

- [x] Browser authenticated to Cloudflare and Supabase
- [x] Dedicated S?o Paulo Supabase project created; TLS connection verified
- [x] Security migration applied; RLS enabled; 12 products initialized
- [x] Production App health using Postgres/Resend/Turnstile configuration verified
- [x] Managed Turnstile widget created; keys saved privately
- [ ] Cloudflare paid plan and domain cost approval
- [ ] GitLab repository authorization and remote container build
- [ ] Production deployment and public HTTPS smoke verification
