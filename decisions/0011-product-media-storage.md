# 0011 — Product media storage seam

Date: 2026-10-21
Status: accepted

## Context

The owner will supply real product photos through the admin panel. Until now an
image had to be copied into `web/public/produtos/` and the storefront rebuilt
and redeployed, which the owner cannot do. The free launch already has a
Supabase project with the private Edge API and a Cloudflare Worker pair
(storefront and admin); adding a paid media service or a new vendor is not
authorized.

The catalog stores images as an ordered array of strings, and validation already
accepts either an `https://` URL or a store-relative `/…` path. That is the
seam we need to keep: the shop should not care where an image lives.

## Decision

Use Supabase Storage, inside the existing free project, as the hosted media
store. A single public bucket, `product-media`, holds raster product photos
under opaque keys (`<32 hex>.<jpg|png|webp>`).

Uploads go through the admin API:

```
POST /api/admin/media
Content-Type: image/jpeg | image/png | image/webp
X-Admin-Token: <admin session token>
<raw image bytes>
```

The Edge implementation verifies the admin session, validates the bytes, checks
the bucket quota, uploads with the Supabase service role, and returns
`{"url":"/media/<key>"}`. The upload is handled outside the advisory-lock
commerce transaction so a large image never blocks checkout.

The Workers serve the stable same-origin path:

```
GET /media/<key>  ->  https://<project>.supabase.co/storage/v1/object/public/product-media/<key>
```

with a one-year immutable cache header. The storefront Worker and the admin
Worker both handle `/media/*`; the admin Worker only needs it for previews.
Because product rows store `/media/<key>` rather than a Supabase URL, the data
stays portable and the project ref is not embedded in product documents.

Local development keeps a stdlib filesystem implementation:
`data/runtime/media/<key>` with the same URL shape. The Next dev server rewrites
`/media/*` to the Python API, and the Python server serves the file. No new
Python dependency is introduced.

The bucket and its public-read policy are created by a migration:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
```

## Fail-safe behavior

The upload endpoint returns `media_unavailable` (503) when the Supabase URL or
service-role key is absent, or the storage call fails. The admin product editor
hides the upload control when the products response reports `media: false`, and
the existing URL/local-path field remains fully usable. A shop with no media
configuration behaves exactly as it does today.

## Consequences

- The owner can manage real photos without a code change or redeploy.
- Product documents remain small and interchangeable between Python and Edge.
- Images are public-read because they are storefront assets; nothing else in
  the bucket is exposed through the app.
- The free Supabase plan includes the storage needed for a small atelier; a
  quota guard rejects uploads that would cross ~900 MB.
- Serving through the Worker adds one subrequest per uncached image; browsers
  cache the immutable URL after the first load.
- The historical Python container would store media on its disposable disk.
  That path is not the free production runtime; the Edge + Storage path is.
