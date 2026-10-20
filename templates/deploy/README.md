# Deploy templates

Three hosts, three different shapes of "run this service". Each directory here
holds the manifest for one, with the few values that change between services
left as `{{TOKENS}}`. Stamp one with:

```bash
python -m foundry.deploy render --set SERVICE=candibet --health /api/health --port 8080 --out .
python -m foundry.deploy fly    --set SERVICE=wall-e    --health /health     --port 8766 --out .
python -m foundry.deploy vercel --set SERVICE=storefront                      --out .
```

A token left unfilled is an error, so the stamp either writes a working
manifest or writes nothing.

## Which host for which workload

| | Render | Fly.io | Vercel |
|---|---|---|---|
| Long-running container | yes | yes | no |
| State on local disk | paid plans only | **yes** | no |
| Scales to zero | yes (free) | yes | yes |
| SQLite / JSONL ledger | risky on free | **yes, with a volume** | no |
| Best for | a single-container app, cheapest start | a stateful service that must keep data | the frontend and stateless edge functions |

**The money backend never goes on Vercel.** A wallet ledger needs a durable
disk or a database and a process that stays alive between requests; Vercel's
model gives you a fresh, ephemeral function per request and no disk. Vercel
hosts the storefront and stateless API routes that proxy to the Render/Fly
backend — see `vercel/README.md`.

**Render free has no disk.** The operator's ledger, player rows and settings
live in a data directory that is reset on every redeploy and after ~15 minutes
idle. That is fine for a sandbox and wrong for anything else; uncomment the
`disk:` block in `render/render.yaml.tmpl` on a paid plan.

**Fly + a volume is the durable single-container shape.** `fly.toml` mounts a
volume at `/data` and points `DATA_DIR` at it, so the same code that keeps a
JSONL ledger on Render's ephemeral disk keeps it across restarts on Fly.
