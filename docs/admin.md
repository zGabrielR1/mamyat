# Admin panel

`/admin` is the shop's back office. It talks to the same public API as the
storefront, with `X-Admin-Token` instead of a customer session.

## Signing in

The first boot seeds an `admin` account. If `ADMIN_PASSWORD` (8+ chars) is not
set, a password is generated, printed to the console and written to
`data/runtime/admin_initial_password.txt`. The dashboard warns until you change
it in **Configurações**. Sessions are opaque bearer tokens stored as SHA-256
fingerprints in `admin_sessions`; logging out revokes the token.

Local: `python scripts/dev.py`, then http://localhost:3000/admin.

## Sections

| Section | What it does |
|---|---|
| Visão geral | Revenue, orders, ticket, customers, low stock, best sellers, recent orders |
| Pedidos | Filter by status/text, open an order, mark paid (demo), advance status, tracking code |
| Produtos | Create, edit, archive/reactivate; variants and stock; images and details |
| Categorias | Create, rename (moves the products), delete when unused |
| Clientes | Search/filter, open a customer, edit data, block/unblock, send reset, anonymize, create |
| Contatos | Messages sent from the storefront contact form |
| Configurações | Store identity, shipping, coupons, admin password |

## Products

Everything the storefront shows comes from the product row. Prices are typed in
reais with a comma (`189,00`) and stored as integer centavos. Rules enforced by
`api/catalog.py`, not by the page:

- name 2–80 chars; description 20–4000; at least one variant;
- one variant per name, optional unique SKU, stock 0–100 000;
- images are local paths (`/produtos/…`) or `https://` URLs, at most 6;
- category must be one of the configured categories;
- `slug` is generated from the name and must be unique;
- `compare_at` only shows when it is above the price;
- `made_to_order` ignores stock and uses `production_days`;
- archiving sets `active = false`; the row is kept so old orders still resolve.

Creating a product does not upload files. Put an image in
`web/public/produtos/` and reference it as `/produtos/arquivo.svg`, or paste an
`https://` URL.

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

## Roles

Both `admin` and `viewer` currently reach every endpoint; the field exists for a
future read-only role. Do not hand out accounts until that split is enforced.

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
```
