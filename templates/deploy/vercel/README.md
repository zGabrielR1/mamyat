# Vercel

Vercel runs the **frontend** and **stateless** serverless functions. It is the
right host for a Next.js storefront, a marketing site, or an edge function that
proxies to a real backend. It is the wrong host for anything that owns money or
keeps state, and this template says so instead of pretending otherwise:

- **No durable disk.** A function gets a fresh, read-only-ish filesystem per
  invocation. A JSONL ledger or a SQLite file written there is gone by the next
  request.
- **No long-lived process.** A single lock, an in-process scheduler, a
  background reconciler — none of them survive between invocations.
- **Ephemeral by design.** That is a feature for a storefront and a
  correctness bug for a ledger.

## What to put here

- The `web/` storefront (Next.js) — `{ "framework": "nextjs" }`.
- Stateless API routes that call the Render/Fly backend with a server-side
  secret kept in Vercel's environment variables.

## What not to put here

- The Pix rail, the double-entry ledger, the settlement reconciler. Those run
  on Render or Fly (see `../render` and `../fly`).

## Stamp it

```bash
python -m foundry.deploy vercel --set SERVICE=storefront --out .
```

Then set the backend URL and any server-side secret in the Vercel dashboard
(Project → Settings → Environment Variables). Nothing sensitive goes in
`vercel.json`; it is committed.
