# Review API parity ? 2026-10-28

- Edge product detail now includes approved-only rating statistics, matching
  the Python product response: count, rounded average and star distribution.
- Regression coverage includes product isolation, empty results and moderation
  transitions. Edge review/payment checks, 47 backend tests and 29 local HTTP
  smoke checks passed. Published by the owner on 2026-10-28; live statistics
  and privacy checks passed for all 12 products.

# Previous design with retained functionality (2026-10-23)

- Owner rejected the visual redesign and clarified that functional improvements
  must stay. Original homepage, header/footer, fonts, colors, card geometry and
  existing admin appearance restored in source.
- Saved pieces, filters, gallery, featured selection, checkout sizing and all new
  admin operations/stock/sales/printing/CSV capabilities retained using the old
  design components and brand tokens. New styles are scoped to their features.
- 148 comparisons against the previous live build confirmed the original fonts,
  colors, radii and headline/header/hero geometry across four widths. A narrow
  original-header overflow at 320px was corrected with a sizing-only media rule.
- 43 backend tests and 29 HTTP checks on a fresh isolated store passed. Production
  export and Worker dry runs passed; 100 browser checks passed with zero page
  errors. Published both Workers; 47 live checks passed with zero page errors.

# Checkout/payment experience polish (2026-10-22)

- Published storefront 0d7af566-c8d7-44e4-9c3e-3dad4d678b9f and admin export.
- Clear Pix/card methods, inline errors, quote loading/retry and coupon removal.
- Line prices now come from the server quote; failed or stale quote responses
  cannot leave an old payable total in the checkout.
- Payment panel distinguishes processing, declined, expired and review states,
  shows the reservation deadline and provides contact/recheck actions.
- Hosted returns trigger authenticated provider verification; browser payment
  status is ignored and duplicate webhook delivery cannot recommit stock.
- Expired checkout links are hidden and the Python rail refuses expired reuse.
- 43 Python tests, payment tests, isolated API smoke/concurrency checks,
  production build and both Worker dry runs passed.
- Browser checks: seven synthetic payment states; quote recovery, server prices,
  invalid coupon blocking/removal and a delayed-quote race. Mobile and desktop
  layouts verified with no overflow. Live checkout/API verified; no purchase.

# Mercado Pago implementation (2026-10-22)

- Added hosted Checkout Pro to Edge and local Python APIs, using server totals.
- Storefront redirects to Mercado Pago and keeps a retry/payment link on orders.
- Authenticated per-order notifications are checked against the payment API.
- Edge handles duplicate delivery, late approvals, stock shortages and refunds.
- Production credentials verified; real preference created and browser opened
  successfully with Pix and credit/prepaid card options. No purchase made.
- Validation: payment tests, 29 isolated HTTP contracts, stock concurrency,
  frontend typecheck/build and both Worker dry runs passed.
- Published: Supabase shop-api with private payment secrets, storefront Worker
  `da0f087e-d19e-4ce9-a19b-3a6c03f81cb5`, admin Worker
  `7eace1c0-5a39-44c7-b5bd-e63121485f5c`.
- Live API reports Mercado Pago / production; checkout and admin return 200.
- 41 Python tests passed, including provider verification and App-level
  confirmation idempotency/refunds. No real payment was submitted.
- See docs/mercadopago.md for configuration and publish instructions.

# Free launch status (2026-10-21)

This section supersedes the historical Container/cost approval notes below.
The owner deferred the domain and selected free plans only.

- Free Supabase project created in Sao Paulo, RLS enabled, Data API disabled.
- Seeded 12 products and initial admin; private credentials stay ignored.
- Supabase shop-api Edge Function deployed, version 2, origin authenticated.
- Free Cloudflare Worker mamyat allocated with workers.dev subdomain.
- Static storefront export, free Worker API proxy and repeatable deploy script.
- Turnstile Fetch verification, hostname/action checks and token refresh.
- Resend Fetch recovery implementation; disabled live until sender verification.
- Atomic SQL reservations/idempotency and persistent rate limits.
- 31 Python tests, frontend types and static production build passed.
- 29 isolated Edge HTTP contracts plus last-stock concurrency, duplicate-line,
  direct-origin and Resend recovery/single-use/session-revocation tests passed.
- Free Worker dry-run passed. No domain purchase or paid plan enabled.
- Wrangler OAuth completed; live static storefront and API deployed.
- Turnstile hostname updated to the workers.dev address.
- Public health/catalog/product/order-shell/admin routes and admin login passed.
- Browser product/cart/checkout and admin navigation passed.
- Turnstile loader regression fixed; live automatic token accepted server-side,
  missing token rejected. Supabase Edge v4 and Worker d6d721c8 deployed.
- Launch complete at https://mamyat.henriquealveslohrayne.workers.dev.
- Admin improvement (2026-10-21): dedicated `mamyat-admin` Worker on its own
  Workers.dev origin; storefront `/admin` 308-redirects there; admin Worker
  exposes only `/admin/*`, shared assets, `/api/admin/*` and `/api/health`, with
  noindex/frame-denial headers. Deploy script publishes both Workers from one
  build and derives/overrides the admin URL.
- Admin panel: order pipeline and alert dashboard, order date/status/search
  filters, order/product/customer CSV export, quick stock replenishment,
  product duplication, WhatsApp/copy shortcuts, 30-minute idle sign-out,
  immediate sign-out on 401, and read-only UI for the viewer role.
- Backend: the Python API now enforces the viewer role as read-only, matching
  the Edge API; both allow logout and the account's own password change.
- Media coverage (2026-10-22): added `MediaStoreTestCase` (5 tests) closing the
  gap on decision 0012's security-sensitive media seam — magic-byte sniff for
  JPEG/PNG/WebP (and rejection of truncated/garbage headers), the 5 MiB and
  empty-file limits, declared-vs-detected content-type mismatch, server-key
  traversal/shape safety (`../`, wrong-length, missing keys), and directory
  creation. Backend suite moved 32 → 37 tests, all green; `verify.py` OK.
- Product media build (2026-10-21): decisions 0011/0012; `product-media`
  Supabase bucket and migration applied; `POST /api/admin/media` in the Edge
  core (admin auth outside the commerce transaction, magic-byte validation,
  5 MiB, quota guard); Python filesystem fallback in `api/media.py`;
  `/media/<key>` served by both Workers; admin uploader with browser WebP
  compression, cover/reorder/remove and URL fallback.
- Validation: 37 Python tests, frontend/Worker typechecks, static build and
  both Worker dry runs. The Edge function still needs `npm run deploy:edge`
  with a logged-in Supabase CLI (the project stores no Supabase access token);
  until then the panel hides uploads and keeps the URL/path workflow.

## Historical development log

# Product reviews — 2026-10-26

- Completed paid-purchase review authorization in Python and Edge, pending-only
  submissions, strict ratings, bounded optional text and duplicate prevention.
- Public responses hide pending/rejected reviews and private order references.
- Product form selects a real paid order, submits structured JSON, exposes
  loading/retry/errors and labels star controls for assistive technology.
- Added /admin/avaliacoes for approval/rejection and confirmed deletion; viewer
  roles remain read-only. Existing design tokens/composition retained.
- Four Python regression tests include real HTTP route/permission checks;
  matching network-free Edge checks run with npm run test:reviews.
- Validation: 47 backend tests, Edge review/payment checks, 29 isolated HTTP
  smoke checks and the production static export (28 pages) passed.
- Published Edge API and both Workers on 2026-10-26. All 21 live HTTP checks
  passed, including authenticated admin reviews and origin/auth guards.
  No production commerce records were created or changed. Versions and evidence
  are recorded in CURRENTTASK.

# Atelier discovery and operations — 2026-10-23

- Storefront composition, rose/mulberry tokens, neutral dark surfaces, simplified
  navigation and shopping guidance; existing checkout and payment API retained.
- Interactive catalog showcase; browser-saved pieces; budget, availability and
  saved filters; retry/empty recovery; working product gallery; 320px checkout fix.
- New admin operations workspace: scoped three-stage queue, confirmed transitions,
  tracking, current-snapshot picking printouts, stock-priority CSV and reconciled
  confirmed gross sales with date scope, CSV and responsive seven-day chart.
- Folded tablet/phone admin navigation, viewer access, confirmed destructive order
  actions, scoped status counts and initial dashboard error recovery.
- 43 backend tests, 29 isolated HTTP checks, production build/Worker dry runs,
  80 browser flow checks and 14 final responsive/dark layout checks passed.

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
