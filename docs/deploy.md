# Deploy on Cloudflare + Supabase

Production uses a Cloudflare Worker and Container, with Supabase Postgres.
Render and Vercel scripts remain historical; do not run them for this launch.
`Dockerfile.cloudflare` builds Next standalone, Python and the Better Auth
sidecar. The Worker routes `/api/*` to Python and other paths to Next.

## Current status (2026-10-21)

- Resend accepted the API key in gitignored `.env.local`.
- `mamyatelie.com` was created as a Resend sending domain in `sa-east-1`.
- Sending DNS verification has not started: DNS account access is missing.
- Sender, stable session secret and a strong initial admin password are saved
  in `.env.local`. Secret values are not included in this document.
- All 19 Cloudflare skills are installed locally in `.agents/skills`.
- `.codex/config.toml` registers `https://mcp.cloudflare.com/mcp`; restart the
  agent and authenticate the server to activate its tools. OAuth is not done.
- No Cloudflare API/account credentials, Supabase database URL, connected
  browser session, or Docker engine were available. No live shop was deployed.
- Verisign RDAP returned HTTP 404 and Google public DNS returned NXDOMAIN
  for mamyatelie.com on 2026-10-21. This suggests registration is still needed;
  confirm availability and price with the registrar before purchase. A Resend
  domain or Cloudflare zone does not purchase a domain.

## Prerequisites

Use Node 22+, Python with `requirements.txt` installed, and a running Docker
engine. Cloudflare Containers needs an eligible paid Workers account; check
billing before deployment. Keep a single container instance until the order
and reservation operations support multi-instance transactions. Container disk
is disposable; JSON storage is forbidden in production.

Add this shop's credentials to `.env.local` (never paste keys into chat):

```dotenv
CLOUDFLARE_API_TOKEN=<account-scoped token>
CLOUDFLARE_ACCOUNT_ID=<account ID>
DATABASE_URL=postgresql://postgres.PROJECT:PASSWORD@POOLER:5432/postgres?sslmode=require
```

Use this shop's Supabase session pooler (IPv4 accessible). URL-encode the DB
password. The role must apply the checked-in migration. Do not reuse another
application's project or credentials.

The Cloudflare token needs this account's Workers scripts, Containers/image
registry, Durable Objects, Turnstile widgets, and zone DNS/setup/Worker routes.
Check current token scopes and paid-plan eligibility in the dashboard.

## Provision and launch

From the project root:

```powershell
npm ci
python -m pip install -r requirements.txt
npm run setup:services
npm run deploy:check
python scripts/verify.py
cd web
npm ci
npm run build
cd ..
npm run deploy
```

`setup:services` reuses the Resend domain, adds/reuses the Cloudflare zone,
installs sending DNS without replacing conflicting records, requests Resend
verification, and creates/reuses a managed Turnstile widget for apex and www.
Keys are saved only to `.env.local`. Existing receiving mail is preserved.

Delegate the domain to the nameservers printed by setup. If unregistered,
purchase it through the registrar first; setup does not buy domains. Re-run
checks after propagation and Resend reports `verified`.

Deploy refuses incomplete prerequisites, checks Supabase access, applies the
security migration, and uploads secrets with the Worker version. The ignored
temporary secret file is removed in a finally block. Account-management tokens
never enter the app. Wrangler installs both custom domains and TLS. Production
health is checked after deployment; submission alone is not a healthy site.

## Validate

```powershell
npm run typecheck
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --containers-rollout none --no-autoconfig
```

This dry run checks Worker packaging only. Docker build and deployed runtime
must also succeed. First container provisioning can take several minutes.
Expect `/api/health` to report `ok: true`, `storage: postgres`, `mail: resend`,
`captcha: turnstile`. Verify www redirects and catalog, signup/login, password
reset, contact and checkout with real Turnstile. Never run the local smoke
script against production customer data; use temporary stores and console mail.

Real payments require Asaas production credentials and its webhook at
`/api/webhooks/asaas`. Without those, payments stay visibly in demonstration
mode. Social login remains optional. Replace seed prices/photos and review
store policies before accepting orders.

## Agent setup

The official setup prompt was fetched. Skills were installed locally because
global configuration is outside the writable sandbox. The optional cf CLI was
not installed; this project uses Wrangler. The Codex executable was unavailable,
so MCP OAuth could not be completed. A restart is needed to load the MCP config.

Sources: [agent setup](https://developers.cloudflare.com/agent-setup/prompt.md),
[Containers](https://developers.cloudflare.com/containers/get-started/),
[Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Remote builds

A local Docker engine can be replaced by Cloudflare Workers Builds connected
to this repository. Set the production deploy command to `npx wrangler deploy`;
Cloudflare can build the Dockerfile in its build environment. Configure runtime
secrets and apply the Supabase migration before enabling the production build.
The local `npm run deploy` prerequisite check intentionally expects local Docker.
See [Cloudflare remote container builds](https://developers.cloudflare.com/containers/guides/deploy/).

## Provisioning update

On 2026-10-21 the browser connected successfully. Created dedicated Supabase
project `mamyat` (`oiplbtukraykycifwccn`) in S?o Paulo, disabled public Data API,
enabled automatic RLS, applied the initial migration and seeded the 12 products.
The real production App can connect to Postgres; RLS is confirmed enabled.
Created a managed Turnstile widget for apex/www. Credentials are saved only in
ignored `.env.supabase` and `.env.turnstile`.

Cloudflare account is on Free. Containers needs $5/month plus usage. Domain
registration is available for $10.46, renewing at $10.46/year. Owner approval
for costs and GitLab login/repository authorization remain pending. No shop
has been deployed. The legacy GitLab PAT returned 401 and should not be reused.
