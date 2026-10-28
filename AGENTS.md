# AGENTS — mamyat

Handmade-atelier ecommerce for `mamyatelie.com`. No real money moves in demo
mode; with Asaas configured it sells for real.

## Structure

Mercado Pago Checkout Pro is the preferred real payment rail when configured.
Its Edge/Python implementations and publishing instructions are documented in
`docs/mercadopago.md` and decision 0013. Keep provider confirmation and browser
return navigation separate; only verified provider data can mark orders paid.

| File / Folder | Role |
|---|---|
| `AGENTS.md` | This instruction map |
| `ARCHITECTURE.md` | System map: layout, request lifecycle, seams |
| `PROGRESS.md` | State tracker — completed capabilities |
| `CURRENTTASK` | Active objective tracker |
| `Makefile`, `scripts/verify.py` | Executable verification: structure, links, tests, typecheck |
| `decisions/` | Decision log, one file per decision |
| `api/` | The service: `server.py` routing, `app.py` wiring, domain modules |
| `api/db.py` | `SqlStore`/`JsonStore` factory — the only storage seam |
| `api/media.py` | Product-image validation and filesystem media store (local/Python) |
| `api/tests/` | The backend suite (32 tests, no network) |
| `foundry/` | Vendored stdlib kit — email, Turnstile, password/session auth, Better Auth bridge. Source of truth: `projects/foundry/`; regenerate with its `scripts/vendor.py`. Never edit by hand |
| `auth-server/` | The stateless Better Auth process (TypeScript at runtime via Node): Google/Facebook/Apple |
| `api/betterauth_proxy.py` | Same-origin loopback proxy to the sidecar |
| `web/` | Next.js 16 + React 19 storefront with shadcn/ui |
| `cloudflare/free-worker.ts` | Storefront Worker: static assets, API proxy, `/admin` redirect |
| `cloudflare/admin-worker.ts` | Dedicated admin origin: admin-only assets, admin API proxy, noindex |
| `cloudflare/media.ts` | `/media/<key>` proxy to the public product-media bucket |
| `wrangler.free.jsonc`, `wrangler.admin.jsonc` | The two free Workers.dev deployments |
| `supabase/functions/shop-api/` | Private Edge API; `POST /api/admin/media` uploads photos to Storage |
| `supabase/migrations/` | Postgres schema (JSONB collections) and the `product-media` bucket |
| `data/seed/products.json` | The seed catalog (12 atelier products) |
| `templates/` | Vendored foundry deploy/auth templates |
| `docs/` | Runbooks: deploy, oauth, mail, turnstile, asaas, supabase |
| `scripts/smoke.py` | End-to-end HTTP check against a running server |
| `scripts/dev.py` | One-command local stack (API + auth + web) |
| `scripts/render_deploy.py` | Create/update/deploy the Render service |

## Workflow

1. Read `CURRENTTASK`, `AGENTS.md`, and `PROGRESS.md`.
2. Consult `ARCHITECTURE.md` and `decisions/` before changing a seam.
3. Keep the backend stdlib-first: no new dependency unless it is the Postgres
   seam, and never inside `foundry/`.
4. The admin panel is a first-class surface and runs on its own origin
   (`mamyat-admin.<account>.workers.dev`); the storefront redirects `/admin`
   there. Products, categories and customers are editable, and the API behind
   each action lives in `api/app.py` (`admin_*`). A change to a catalog or
   account rule must be made in `api/catalog.py` / `api/accounts.py`, not in
   the page. Keep the Edge implementation in `supabase/functions/shop-api/`
   aligned.
5. Run `python scripts/verify.py` (structure, links, tests, typecheck) and
   `python scripts/smoke.py --base …` against a live server.
6. Rebuild the frontend (`cd web; npm.cmd run build`) whenever modifying
   `web/app`; typecheck alone is not enough for a deploy.
7. Product photos are `/media/<key>` paths: uploads go through
   `POST /api/admin/media` to Supabase Storage; Python uses `api/media.py`.
   Stored objects are append-only so historical orders keep rendering. The
   Edge publish requires a logged-in Supabase CLI (`npm run deploy:edge`).
8. Free launch: `npm run deploy:check`, then `npm run deploy`. The deploy builds
   once and publishes `wrangler.free.jsonc` (storefront) and
   `wrangler.admin.jsonc` (admin origin): Workers static assets plus Supabase
   Edge Functions. Do not purchase a domain, upgrade plans, or deploy
   Containers, Render or Vercel. See `docs/deploy.md` and decision 0010. The
   Edge API lives in `supabase/functions/shop-api/`; keep its commerce rules
   aligned with Python.

## Local stack

`python scripts/dev.py` starts the API (`:8080`), the Better Auth sidecar
(`:3100`) and Next (`:3000`), prefixed output and one Ctrl+C. `--no-web`,
`--no-auth` and `--api-port/--web-port` exist for narrower work.

## Invariants

- Prices are integer centavos and are always recomputed server-side. A browser
  total is never trusted.
- Stock is reserved for 30 minutes at order creation, committed on confirmed
  payment, released on cancel.
- Secrets live in gitignored `.env*` files or the host dashboard. `render.yaml`
  never carries a secret value.
- Every optional rail fails safe: no Asaas key means demo payments, no Resend
  key means console mail, no Turnstile secret means a no-op gate, no Better
  Auth credentials means the social buttons disappear.

## Cloudflare production

`wrangler.jsonc` routes both hostnames to `cloudflare/worker.ts`;
`Dockerfile.cloudflare` packages Next standalone, Python, and Better Auth.
`api/configuration.py` refuses production without persistent Postgres, stable
session signing, Resend sender and real Turnstile keys. Customer session
registrations use the same Postgres store seam as other collections.
Cloudflare account tokens remain in the provisioning process, never in the app.
