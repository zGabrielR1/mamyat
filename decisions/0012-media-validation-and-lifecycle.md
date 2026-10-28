# 0012 — Media validation and lifecycle

Date: 2026-10-21
Status: accepted

## Context

Uploading files from a browser is the highest-risk admin action: it accepts
untrusted bytes and writes them to a public bucket. The shop also keeps order
history forever, and each order line snapshots the product image URL. A naive
"delete when removed from the product" rule would break old orders.

## Decision

### Validation

- Accepted types: JPEG, PNG and WebP. SVG, GIF and arbitrary files are rejected.
- The server sniffs magic bytes and requires them to match the declared
  `Content-Type`; a renamed executable is not accepted.
- Per-file limit: 5 MiB. Empty files are rejected.
- Per-product limit: 6 images (the existing catalog rule).
- The browser resizes the longest side to 1600 px and encodes WebP at quality
  0.85 before uploading. The server still validates the result and never trusts
  the client. Source files above 15 MiB are refused in the browser.
- Only `admin` accounts may upload; `viewer` receives `403 forbidden`.
- The Edge endpoint checks the bucket's object sizes and refuses an upload that
  would cross a 900 MB working quota. If the listing call itself fails, the
  upload proceeds with the per-file limit and the failure is logged; a storage
  listing outage must not disable the catalog.
- Keys are server-generated UUIDs. The public `/media/<key>` route accepts only
  the `<32 hex>.<jpg|png|webp>` shape, which prevents traversal or bucket
  escapes.

### Lifecycle

- Stored objects are append-only. Removing an image from a product only removes
  it from that product's `images` array; the object stays in the bucket so a
  historical order's snapshot keeps rendering.
- Reordering the `images` array changes the cover and gallery order only.
- Duplicating a product reuses the same `/media/<key>` URLs. No bytes are
  copied.
- There is no delete endpoint in this iteration. A future media library may add
  a reference-aware cleanup that checks products and order lines first.

### Client behavior

- Upload failures are non-destructive: the editor keeps the previous image list
  and shows the server's message.
- The upload control disappears when the API reports `media: false`, leaving the
  URL/local-path input as the fallback.
- Uploading before saving a product leaves an unreferenced object. That is
  accepted: objects are cheap, and the append-only rule makes cleanup a separate
  decision.

## Consequences

- The public bucket can accumulate unreferenced images; a cleanup tool is a
  future, explicit operation.
- Validating magic bytes in both Python and Edge is duplicated by design: the
  two runtimes must enforce the same catalog rule.
- The client-side WebP pass keeps typical photos well below the 5 MiB limit and
  avoids sending original camera files.
