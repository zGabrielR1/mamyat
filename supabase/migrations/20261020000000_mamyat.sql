-- Mamy Ateliê · initial schema
--
-- The backend keeps one JSONB document per collection (products, orders,
-- customers, ...). That is a deliberate first shape (decision 0007): it keeps
-- the stdlib JSON stores and the hosted Postgres store interchangeable while
-- the shop is young, and every write is transactional.
--
-- Apply with `supabase db push` or paste into the SQL editor. The backend uses
-- the service_role key, so RLS is enabled with no browser policy: no anon or
-- authenticated token can read a customer's order directly.

create table if not exists public.mamyat_documents (
    collection  text primary key,
    payload     jsonb not null,
    updated_at  timestamptz not null default now()
);

comment on table public.mamyat_documents is
    'Application state for Mamy Ateliê, one JSONB document per collection.';

create index if not exists mamyat_documents_updated_idx
    on public.mamyat_documents (updated_at desc);

alter table public.mamyat_documents enable row level security;

-- No policies on purpose. service_role bypasses RLS; anon/authenticated do not.
revoke all on public.mamyat_documents from anon, authenticated;
grant all on public.mamyat_documents to service_role;

-- A tiny health probe for the dashboard and for `curl` checks.
create or replace function public.mamyat_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'ok', true,
        'collections', (select count(*) from public.mamyat_documents),
        'updated_at', (select max(updated_at) from public.mamyat_documents)
    );
$$;

revoke all on function public.mamyat_health() from anon, authenticated;
grant execute on function public.mamyat_health() to service_role;
