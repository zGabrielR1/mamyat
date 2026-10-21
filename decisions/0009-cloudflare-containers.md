# 0009: Cloudflare Container and Supabase

The owner requested Cloudflare + Supabase and excluded Render for this launch.
Preserve the existing Python commerce logic and Better Auth sidecar.

One Worker controls a singleton container running Next standalone (:3000),
Python (:8080) and Better Auth (internal :3100). Route by path; replace forwarded
client IP headers; redirect www to the canonical apex. Supabase retains all
collections, including customer session registrations.

Container disk is temporary. Production requires stable signing/admin secrets,
Postgres, a Resend sender and real Turnstile keys. Supervise the three processes
and restart them together after a child failure. Management tokens never enter
the container. DNS-zone creation and domain purchase are separate operations.

Cloudflare Containers eligibility/billing and Docker are prerequisites. Worker
dry run cannot validate container runtime or prove deployment. Keep one instance
until cross-collection stock/order operations support multiple writers safely.
