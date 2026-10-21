# Free Workers and Supabase Edge (2026-10-21)

The owner explicitly selected free tiers and deferred domain purchase. This
supersedes the paid Container launch in decision 0009.

Next exports static HTML/assets to web/out. A small Worker serves them at
https://mamyat.henriquealveslohrayne.workers.dev and proxies /api to a Supabase
Edge Function. Dynamic product/order pages use a static shell and load actual
identifiers from the URL; links to those pages perform full navigation.

The Edge API uses postgres.js (the Postgres seam exception) and the existing
private JSONB collections. An advisory lock and row locks cover each entire
commerce transaction, including reservations and idempotency. Collection rows
are cloned before mutation and only changed documents are persisted. The
public Data API is disabled and RLS stays enabled. A private shared origin
secret authenticates Worker-to-Edge requests; customer/admin sessions remain
application-authenticated. Turnstile is verified with Fetch server-side.

Email delivery is disabled until a sender domain can be verified. Recovery
shows WhatsApp guidance; no successful email delivery is claimed. Payments
remain explicitly demo. Social sign-in is disabled. Python/container files
remain available for local development and a separately approved future plan.

Validation: existing 29 HTTP API contracts against an isolated SQL schema,
concurrent last-stock checkout, duplicate cart lines and direct-origin denial;
Next static production build and Wrangler dry-run. No production test orders
are needed for these isolated checks.
