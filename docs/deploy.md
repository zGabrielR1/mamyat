# Deploy

Three hosts, one tree:

| Piece | Host | What it runs |
|---|---|---|
| Storefront | Vercel | Next.js build from `web/` |
| API + auth sidecar | Render | the `Dockerfile` (Python + Node) |
| Database | Supabase | the migration in `supabase/migrations/` |

Nothing has to be built on your machine first: Render builds the image from
the repository, and Vercel builds the storefront from `web/`.

## 1. Database (Supabase)

1. Create a project. Copy the **pooler** connection string
   (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`).
2. Open the SQL editor and paste
   `supabase/migrations/20261020000000_mamyat.sql`, or run
   `supabase db push` with the project linked.
3. Confirm `select * from public.mamyat_health();` works with the service role.

The app normalises `postgres://` and `postgresql://` to the psycopg dialect. Use
the pooler on port 6543 for a Render web service.

## 2. Backend (Render)

Blueprint path:

1. Push the repository to GitHub.
2. Render → New → Blueprint → pick the repo. It reads `render.yaml`.
3. Fill the `sync: false` variables in the dashboard (see the list below), or
   run the script.

Script path:

```bash
# ~/.render_api_key  (one line) and ~/.render_repo (one line), or env vars
python scripts/render_deploy.py --check
python scripts/render_deploy.py
```

The script creates or updates the service, **merges** the environment (values
from the gitignored `.env*` files, dashboard-only values preserved), starts a
deploy and watches it. `--replace-env` resets the environment instead.

Required variables:

| Variable | Value |
|---|---|
| `HOST` | `0.0.0.0` (set in `render.yaml`) |
| `DATA_DIR` | `/data` |
| `DATABASE_URL` | the Supabase pooler URL |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | 8+ chars; otherwise a generated one is logged on boot |
| `CUSTOMER_SESSION_SECRET` | optional; derived from `BETTER_AUTH_SECRET` |
| `PUBLIC_BASE_URL` | `https://mamyatelie.com` (used in reset links) |
| `CORS_ORIGINS` | `https://mamyatelie.com,https://www.mamyatelie.com` |

A service with no `DATABASE_URL` and no disk keeps its JSON stores on the
container filesystem — on the free plan that state is lost on redeploy.

## 3. Storefront (Vercel)

1. Import the repository; set **Root Directory** to `web`.
2. Framework preset: Next.js. Build: `npm run build`.
3. Environment variable: `BACKEND_URL=https://<service>.onrender.com`.
4. Deploy, then point `mamyatelie.com` and `www` at Vercel.

`next.config.ts` rewrites `/api/:path*` to `BACKEND_URL`, so the browser only
ever talks to the Vercel origin. After the first deploy, add the Vercel host to
`CORS_ORIGINS` if you ever call the API directly.

**Build-time caveat:** Next freezes `rewrites()` into the build output, so
`BACKEND_URL` must be set when the build runs. On Vercel it already is (project
environment variables are present during the build). Locally, `npm run start`
uses whatever `BACKEND_URL` was set for the last `npm run build`; `npm run dev`
reads it at runtime, which is why the quick start uses dev.

## Optional rails

Each is independent and safe to leave unset:

- Pix → `docs/asaas.md`
- Email → `docs/mail.md`
- Captcha → `docs/turnstile.md`
- Social login → `docs/oauth.md`
- Postgres → `docs/supabase.md` (above)

## Smoke checks after a deploy

```bash
curl https://<service>.onrender.com/api/health
curl https://<service>.onrender.com/api/config

python scripts/smoke.py --base https://<service>.onrender.com \
  --admin-password '<the admin password>'
```

`/api/health` reports which rails are live:

```json
{"ok": true, "storage": "postgres", "payment": "asaas",
 "mail": "resend", "captcha": "turnstile"}
```

Then in the storefront: add to cart, checkout, confirm the Pix page opens, log
in to `/admin`, mark an order paid, and (with Turnstile configured) confirm the
widget appears on `/criar-conta`.

## Triage

| Symptom | Cause |
|---|---|
| Render: "connection refused" forever | `HOST` not `0.0.0.0` |
| `/api/health` 500 | `DATABASE_URL` wrong; check the log for psycopg |
| Social buttons missing | provider credentials absent; check `/api/betterauth/providers` |
| `captcha_required` on signup | Turnstile secret set but the site key is wrong/missing |
| Payments labelled "demonstração" | `ASAAS_API_KEY` not set |
| Reset links point at localhost | `PUBLIC_BASE_URL` not set |
| Orders disappear after a redeploy | free plan, no `DATABASE_URL`, no disk |
