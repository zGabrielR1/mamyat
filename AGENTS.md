# AGENTS — mamyat

Handmade-atelier ecommerce for `mamyatelie.com`. No real money moves in demo
mode; with Asaas configured it sells for real.

## Structure

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
| `api/tests/` | The backend suite (25 tests, no network) |
| `foundry/` | Vendored stdlib kit — email, Turnstile, password/session auth, Better Auth bridge. Source of truth: `projects/foundry/`; regenerate with its `scripts/vendor.py`. Never edit by hand |
| `auth-server/` | The stateless Better Auth process (TypeScript at runtime via Node): Google/Facebook/Apple |
| `api/betterauth_proxy.py` | Same-origin loopback proxy to the sidecar |
| `web/` | Next.js 16 + React 19 storefront with shadcn/ui |
| `supabase/migrations/` | Postgres schema (one JSONB document per collection) |
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
4. The admin panel is a first-class surface: products, categories and customers
   are editable there, and the API behind each action lives in `api/app.py`
   (`admin_*`). A change to a catalog or account rule must be made in
   `api/catalog.py` / `api/accounts.py`, not in the page.
5. Run `python scripts/verify.py` (structure, links, tests, typecheck) and
   `python scripts/smoke.py --base …` against a live server.
6. Rebuild the frontend (`cd web; npm.cmd run build`) whenever modifying
   `web/app`; typecheck alone is not enough for a deploy.
7. Deploy: `npm run setup:services`, `npm run deploy:check`, then
   `npm run deploy`. Hosting is Cloudflare Worker + Container and Supabase;
   do not deploy to Render or Vercel. See `docs/deploy.md`.

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
