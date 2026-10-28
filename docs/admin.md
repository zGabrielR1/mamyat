# Admin panel

The back office runs on its own origin instead of the shop's public address.
The free deployment publishes a second Worker, `mamyat-admin`, at
`https://mamyat-admin.<account>.workers.dev`; the storefront's `/admin` routes
308-redirect there. The admin Worker serves only `/admin/*`, the shared Next
assets and `/api/admin/*` plus `/api/health`, and sends
`X-Robots-Tag: noindex`, `X-Frame-Options: DENY` and
`Content-Security-Policy: frame-ancestors 'none'`.

Every action calls the same API through `/api/admin/*` on the admin origin with
`X-Admin-Token` instead of a customer session; the storefront origin returns
404 for those routes. Set `ADMIN_BASE_URL` to override the derived address.

## Signing in

The first boot seeds an `admin` account. If `ADMIN_PASSWORD` (8+ chars) is not
set, a password is generated, printed to the console and written to
`data/runtime/admin_initial_password.txt`. The dashboard warns until you change
it in **Configurações**. Sessions are opaque bearer tokens stored as SHA-256
fingerprints in `admin_sessions`; logging out revokes the token.

Local: `python scripts/dev.py`, then http://localhost:3000/admin.

Deployed: https://mamyat-admin.henriquealveslohrayne.workers.dev/admin/
(the storefront's `/admin` redirects there).

## Sections

| Section | What it does |
|---|---|
| Visão geral | Revenue, order pipeline, alerts, low stock, best sellers, recent orders, quick actions |
| Pedidos | Search/status/date filters, open an order, mark paid (demo), advance status, tracking, CSV export |
| Produtos | Create, edit, duplicate, archive/reactivate; quick stock replenishment; CSV export |
| Categorias | Create, rename (moves the products), delete when unused |
| Clientes | Search/filter, open a customer, edit data, WhatsApp shortcut, block/unblock, send reset, anonymize, create, CSV export |
| Contatos | Messages sent from the storefront contact form, reply/copy email |
| Configurações | Store identity, shipping, coupons, admin password, current storefront/admin addresses |

## Products

Everything the storefront shows comes from the product row. Prices are typed in
reais with a comma (`189,00`) and stored as integer centavos. Rules enforced by
`api/catalog.py`, not by the page:

- name 2–80 chars; description 20–4000; at least one variant;
- one variant per name, optional unique SKU, stock 0–100 000;
- images are uploaded `/media/…` paths, local paths (`/produtos/…`) or
  `https://` URLs, at most 6;
- category must be one of the configured categories;
- `slug` is generated from the name and must be unique;
- `compare_at` only shows when it is above the price;
- `made_to_order` ignores stock and uses `production_days`;
- archiving sets `active = false`; the row is kept so old orders still resolve.

### Photos

The editor accepts uploads directly. Drag files onto the drop zone or choose
them; the browser resizes the longest side to 1600 px, encodes WebP and posts
the bytes to `POST /api/admin/media`. Uploaded photos are served from
`/media/<key>` and stored in the free `product-media` Supabase bucket. Up to six
per product; the first is the cover. Use the arrow buttons to reorder and the
trash button to detach.

The URL field remains for external `https://` images and local paths such as
`/produtos/arquivo.svg`. If the deployment has no Storage configuration, the
upload control disappears and only that field is shown.

Removing a photo from a product does not delete the stored object: historical
orders snapshot the image URL and must keep rendering. Objects are append-only
(decision 0012). Accepted uploads are JPEG, PNG or WebP up to 5 MiB; the server
checks the magic bytes even though the browser already compressed the file.

## Categories

The list lives in settings (`categories`) and is seeded with Bolsas, Amigurumis,
Bordados, Casa, Acessórios, Kits and Encomendas. It drives the storefront filter
chips (empty categories show with count 0), the product category selector, and
validation.

- **Create** appends, case-insensitively unique.
- **Rename** updates every product that used the old name in the same operation
  and reports how many moved.
- **Delete** is refused while any product (active or archived) still uses it;
  at least one category must remain.
- The API also accepts the full list through `PATCH /api/admin/settings`, but
  refuses it if a product would be left in an unknown category.

Endpoints: `GET/POST /api/admin/categories`,
`PATCH/DELETE /api/admin/categories/{name}`.

## Customers

A customer row holds username, email, password hash, optional CPF/phone,
session epoch, marketing flag, provider and `active`.

- **Edit** validates username/email/CPF uniqueness and the same field rules as
  signup. Changing email does not unlink a social provider.
- **Block** sets `active = false`, bumps the session epoch and revokes every
  live token immediately; login and the social bridge both refuse the account
  from then on.
- **Send reset** mints the normal one-time reset link and emails it
  (`PUBLIC_BASE_URL` + `/conta/redefinir?token=…`). With the console mailer the
  link is printed in the server log. It bypasses the customer-facing 3/hour cap.
- **Anonymize** is the delete: name, phone, CPF, password and provider links are
  cleared, email/username become `removido+…@mamyatelie.invalid` /
  `removido…`, the account is blocked and sessions are revoked. Orders stay in
  the books (they reference the customer id).
- **Create** makes an account from the panel. Leave the password blank to get a
  generated one, shown once; otherwise the supplied password must pass the
  policy (8+ chars, letter and digit).

Endpoints: `GET/POST /api/admin/customers`, `GET/PATCH/DELETE
/api/admin/customers/{id}`, `POST /api/admin/customers/{id}/reset`.

## Session safety

- The panel signs out after 30 minutes without activity, warning at 25.
- A 401 from any admin request clears the stored token and returns to the login
  screen immediately.
- The token lives in `sessionStorage`, scoped to the admin origin; closing the
  tab ends the browser session.

## Roles

`admin` can read and write. `viewer` is enforced read-only by both the Python
and Edge APIs: mutations return `403 forbidden`, while viewing and changing the
viewer's own password remain allowed. The panel hides write controls and shows
a read-only banner for these accounts.

## API map (admin)

```
POST   /api/admin/login          POST   /api/admin/logout
GET    /api/admin/me             POST   /api/admin/password
GET    /api/admin/dashboard

GET    /api/admin/products       POST   /api/admin/products
PATCH  /api/admin/products/{id}  DELETE /api/admin/products/{id}

GET    /api/admin/categories     POST   /api/admin/categories
PATCH  /api/admin/categories/{name}
DELETE /api/admin/categories/{name}

GET    /api/admin/orders         GET    /api/admin/orders/{number}
POST   /api/admin/orders/{number}/status
POST   /api/admin/orders/{number}/paid

GET    /api/admin/customers      POST   /api/admin/customers
GET    /api/admin/customers/{id}
PATCH  /api/admin/customers/{id}
DELETE /api/admin/customers/{id}
POST   /api/admin/customers/{id}/reset

GET    /api/admin/contacts
GET    /api/admin/settings       PATCH  /api/admin/settings

POST   /api/admin/media          (raw image body; returns /media/<key>)
GET    /media/<key>              (public photo, cached immutable)
```

## Operations workspace (2026-10-23)

Open **Operação do ateliê** for the oldest-first paid/production/delivery queue.
Search by customer, number or piece; filter by shipment or pickup. Start production,
record dispatch/tracking and confirm receipt through the confirmation dialog.
Delivery dispatch requires a tracking code in this workflow. For local pickup,
use the dispatch step when the piece is ready and confirm receipt after pickup.

Select paid or packing orders and choose **Imprimir separação** to print current
item snapshots with variant, SKU and quantity. If a selected order changed stage,
refresh the queue and review the selection. Viewers can inspect/print but cannot
advance orders.

**Estoque e reposição** distinguishes physical stock from availability after
reservations; made-to-order and inactive products do not appear in low-stock
priorities. Export the list or use Revisar to find the product in the catalog.

**Vendas e receita** totals current confirmed order values by creation date.
These are gross order values including freight/discounts, not provider payouts
or profit. Awaiting, cancelled and refunded orders are excluded from confirmed
value. The seven-day chart is explicitly independent of the chosen summary range.
CSV exports contain customer/order information and should be handled privately.

Cancelling or recording a refund now asks for confirmation. Recording a refunded
status does not issue a provider refund; confirm that separately before recording.
