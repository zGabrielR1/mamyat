# Supabase Postgres

The shop keeps one JSONB document per collection in a single table. That is a
deliberate first shape: it keeps the local JSON stores and the hosted Postgres
store interchangeable while the catalog is small, and every write is a
transaction. See [decisions/0007-jsonb-collections.md](../decisions/0007-jsonb-collections.md).

## Create the project

1. Create a Supabase project (a dedicated one, not shared with another app —
   the table is a single shared state surface).
2. Apply `supabase/migrations/20261020000000_mamyat.sql`:
   - paste it into the SQL editor, or
   - `supabase link --project-ref <ref>` then `supabase db push`.
3. Copy the **pooler** connection string from Project Settings → Database.
   Use the IPv4-accessible session pooler on port `5432` for the Cloudflare
   Container. Keep TLS enabled with `sslmode=require`.

## Configure

Set `DATABASE_URL` in gitignored `.env.local`; deployment uploads it as a
Cloudflare Worker secret and forwards it only to the container:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

`api/db.py` normalises `postgres://` and `postgresql://` to
`postgresql+psycopg://`; no other change is needed. On boot, `/api/health`
reports `"storage": "postgres"`.

The backend needs a Postgres connection URL with database credentials, not
a Supabase API key. An anon or service-role API key is not a database password. The
browser never talks to Postgres directly: it goes through the API.

## RLS

The migration enables RLS on `mamyat_documents` and creates **no policy**. The
service role bypasses RLS; `anon` and `authenticated` are revoked from the
table and from `mamyat_health()`. That is intentional — a customer's order must
not be readable with a public key.

## Schema

```sql
mamyat_documents(
  collection  text primary key,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
)
```

Collections: `products`, `orders`, `customers`, `admins`, `admin_sessions`,
`password_resets`, `oauth_links`, `settings`, `reservations`, `contacts`,
`customer_sessions`. Customer session registration must survive container restarts.

`SqlStore.update` takes `SELECT … FOR UPDATE` on the row before mutating, so a
read-modify-write from two instances cannot lose a write. `read` inserts the
default document if the collection row does not exist yet.

## Local development

Leave `DATABASE_URL` empty: the same services run on JSON files under
`DATA_DIR` (default `data/runtime`). The two implementations expose the same
methods, so this is the supported dev path — no Postgres install required.

## Cutover checklist

- [ ] migration applied; `select * from public.mamyat_health();` works
- [ ] `DATABASE_URL` set as a Cloudflare Worker secret, `"storage": "postgres"` in `/api/health`
- [ ] admin login works and a test order survives a redeploy
- [ ] no anon `select` possible on `mamyat_documents`
