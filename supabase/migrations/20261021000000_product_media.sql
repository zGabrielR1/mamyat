-- Product media (decisions 0011 and 0012)
--
-- A public-read bucket for storefront photos. Uploads and deletes are done by
-- the Edge function with the service role, which bypasses RLS. The policy only
-- grants reads so the Worker's /media proxy can stream objects without auth.
--
-- Apply with `supabase db push` or paste into the SQL editor. Re-running is
-- safe: the bucket upsert and policy replacement are idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "product_media_public_read" on storage.objects;

create policy "product_media_public_read" on storage.objects
    for select
    using (bucket_id = 'product-media');
