# Mamy Ateliê

`mamyatelie.com` — a handmade atelier storefront: catalog with variants, cart,
checkout, Pix, order tracking, customer accounts, social sign-in, and an admin
panel for products, orders, customers, contacts and store settings.

The frontend is Next.js on Vercel; the API and the auth sidecar run in one
container on Render; state lives in Supabase Postgres (or JSON files locally).

## Stack

| Concern | What is used |
|---|---|
| Storefront | Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui |
| API | Python 3.14, stdlib `http.server`, integer centavos |
| Storage | Supabase Postgres via SQLAlchemy/psycopg; JSON files when unset |
| Auth | username/email + CPF, signed `ms1` sessions; Better Auth for Google/Facebook/Apple |
| Captcha | Cloudflare Turnstile on signup, login, reset, contact, checkout |
| Payments | Asaas Pix with webhook confirmation; demo rail when unconfigured |
| Email | Resend; console mailer when unconfigured |
| Deploy | Vercel (web), Render (Docker), Supabase (Postgres) |

## Quick start

```bash
cd web && npm ci && cd ..        # first run only
python scripts/dev.py            # API + auth sidecar + storefront
```

That starts the API on `:8080`, the Better Auth sidecar on `:3100` and Next on
`:3000`, and stops everything on Ctrl+C. Open http://localhost:3000; the admin
panel is at `/admin`.

The panel password is printed on first boot and written to
`data/runtime/admin_initial_password.txt` (change it in the panel). Optional
services are configured through gitignored `.env*` files; every key is
documented in [`.env.example`](.env.example). Nothing is required for a local
run.

Running the pieces by hand also works:

```bash
python -m api.server --port 8080     # backend (JSON stores, demo payments)
cd web && npm run dev                # storefront, proxies /api to :8080
```

## Verify

```bash
python scripts/verify.py          # structure, compile, links, tests, typecheck
python -m unittest discover -s api/tests
cd web && npm run typecheck && npm run build
python scripts/render_deploy.py --check
```

End-to-end over HTTP against a running server:

```bash
python -m api.server --port 8099 &
python scripts/smoke.py --base http://127.0.0.1:8099 --admin-password ...
```

## Layout

`api/` the service; `foundry/` the vendored stdlib kit; `auth-server/` the
Better Auth sidecar; `web/` the storefront; `supabase/` migrations;
`docs/` runbooks; `decisions/` the decision log. Start with
[ARCHITECTURE.md](ARCHITECTURE.md) and [docs/deploy.md](docs/deploy.md).
