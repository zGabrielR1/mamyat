# 0007 — JSONB collections instead of a normalized schema

Date: 2026-10-20
Status: accepted

## Context

The shop needs to run with zero infrastructure locally (JSON files) and on
Supabase Postgres when deployed. Writing two storage implementations with
different shapes would fork behavior: the tests would cover one and production
the other. A normalized schema (products/variants/orders/order_items) is
correct for analytics and reporting, but it is also ten tables and a join for
every read while the catalog is a few dozen products.

## Decision

One table, one JSONB document per collection:

```sql
mamyat_documents(collection text primary key, payload jsonb, updated_at timestamptz)
```

`make_store()` returns `JsonStore` when `DATABASE_URL` is empty and `SqlStore`
otherwise. Both expose `read`, `write`, `update`, `append`, `replace`, `ping`,
so `catalog.py`, `orders.py`, `accounts.py` and `app.py` never know which one
is in use.

`SqlStore.update` does `SELECT … FOR UPDATE` inside a transaction before
mutating, which makes read-modify-write atomic across instances. `read`
inserts the default document when the row is missing.

The table has RLS enabled and no policy: the service role bypasses it, and
`anon`/`authenticated` are revoked.

## Consequences

- The local and hosted paths run identical domain code; the test suite covers
  both indirectly (JSON by default).
- Every collection write rewrites that collection's document — fine at this
  size, not fine at a hundred thousand orders.
- Reporting/analytics on orders needs `jsonb` queries or an extract later.
- The migration can grow into a normalized schema collection by collection
  without changing the `App` surface: only `make_store` would need a new
  implementation.
