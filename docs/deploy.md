# Free Cloudflare + Supabase deployment

The owner selected free tiers and deferred domain purchase. Do not upgrade
plans, buy domains, or deploy the historical Container/Render/Vercel paths.

Public address: https://mamyat.henriquealveslohrayne.workers.dev
Admin address: https://mamyat-admin.henriquealveslohrayne.workers.dev/admin/
Supabase project: oiplbtukraykycifwccn (sa-east-1, Free).

## Runtime

Cloudflare serves web/out and proxies /api through cloudflare/free-worker.ts.
A second Worker, `mamyat-admin`, serves the same static export through
`cloudflare/admin-worker.ts` on its own workers.dev origin. It permits only
`/admin/*`, shared `/_next` and `/produtos` assets, `/api/admin/*` and
`/api/health`; every other path returns 404. The storefront Worker 308-redirects
`/admin` and `/admin/*` to that origin and returns 404 for `/api/admin/*`, so
neither the panel nor its API is served from the shop's public address.

`npm run deploy` builds once and publishes both Workers. The admin address is
derived from `PUBLIC_BASE_URL` (`mamyat.<account>.workers.dev` →
`mamyat-admin.<account>.workers.dev`); set `ADMIN_BASE_URL` to override it.
Supabase Edge Function shop-api implements the API using private Postgres.
The public Data API is disabled, RLS enabled, and direct Edge requests require
SHOP_ORIGIN_SECRET. The same secret is set in the Worker and function.

Payments are demo. Email delivery is disabled pending verified Resend sender;
recovery provides WhatsApp guidance. Social sign-in is disabled.

## Repeat a deployment

1. Install root and web dependencies with npm ci.
2. Authenticate Wrangler with the official Cloudflare OAuth flow. Private
   local Wrangler state is under .tmp/xdg, never committed.
3. Keep SHOP_ORIGIN_SECRET and CLOUDFLARE_ACCOUNT_ID in ignored .env.local.
4. Run npm run deploy:check (types, static build, dry runs for both Workers).
5. Run npm run deploy (same checks, secrets and static asset publication for
   the storefront and the admin origin).

The commands use wrangler.free.jsonc. wrangler.jsonc and deploy:container are
historical paid alternatives; never use them for the free launch.

The function is deployed from supabase/functions/shop-api/index.ts and core.mjs
with verify_jwt=false at the Supabase gateway; the function itself always
validates the private origin secret and then application session tokens. Set
DATABASE_URL to the TLS transaction pooler, SHOP_ORIGIN_SECRET, PUBLIC_BASE_URL,
TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, TURNSTILE_HOSTNAMES and MAIL_DELIVERY
(disabled), plus RESEND_API_KEY and MAIL_FROM for future verified delivery.
Management tokens/database credentials never belong in assets.

Product photos use the `product-media` bucket created by
`supabase/migrations/20261021000000_product_media.sql`. Apply it with
`supabase db push` or the SQL editor before uploading. The Edge runtime reads
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides to
hosted functions by default; when either is absent the upload endpoint reports
`media_unavailable` and the panel falls back to URL/local-path images. Both
Workers carry `MEDIA_URL` (the bucket's public prefix) and serve `/media/<key>`
from it.

With an authenticated Supabase CLI, publish function changes using
`npm run deploy:edge` (equivalent to
`supabase functions deploy shop-api --project-ref oiplbtukraykycifwccn`).
The project does not store a Supabase access token; run
`npx supabase login` once, or set `SUPABASE_ACCESS_TOKEN` in the private
environment, before this command. The Worker deployment does not require it.
The checked-in Supabase config preserves the gateway setting described above.

Turnstile's managed widget must allow mamyat.henriquealveslohrayne.workers.dev.

## Validation

python scripts/verify.py validates the local Python stack and frontend types.
node scripts/test_free_api.mjs creates a temporary isolated SQL schema, runs
29 HTTP contract checks plus concurrency/origin tests, then drops only that
schema. It requires the private database environment; it does not create real
store orders or change production stock.

After publication verify /, /api/health, /api/products and a real product URL
on the storefront; verify that the storefront `/admin` request redirects to the
admin origin and `/api/admin/login` returns 404 there; verify `/admin/` login
and navigation on the admin origin; verify that `/api/products` and unknown
paths are rejected there; and check rejection of unauthenticated
admin/direct-origin requests. Check browser errors and that
Turnstile renders on the free storefront hostname.

For media, log in on the admin origin, upload a small JPEG/PNG/WebP in a
product editor, save the product, and confirm the `/media/<key>` URL returns
200 on both the storefront and admin origins. Uploading a text file and an
unauthenticated request must both be rejected.

## Verified launch (2026-10-21)

Worker d6d721c8-d738-4bcf-a93d-6931bbd9c85b and Supabase Edge v4 are live.
Public health/catalog, product/order shells, admin login and admin navigation
passed. Browser product/cart/checkout navigation passed. A real automatically
issued Turnstile login token passed server verification; missing token was
rejected. No production orders or customer records were created by smoke tests.
All commerce mutations were tested in an isolated SQL schema.

Windows builds publish flattened Next segment-prefetch aliases through the
deploy script, preserving client navigation. Dynamic product/order links use
full navigation to the static shell and fetch current identifiers from the URL.
