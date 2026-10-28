# Mercado Pago Checkout Pro

The free production API creates a hosted Checkout Pro preference from the
server-calculated total. Customers choose Pix or card on Mercado Pago. Boleto
and ATM payments are excluded because stock reservations last 30 minutes.
The order page retains a payment button if the customer leaves the checkout.
Retries reuse the existing preference during the reservation.

On returning from Mercado Pago, the order page checks the returned payment ID
through the authenticated `POST /api/orders/{number}/payment-status` endpoint.
The server retrieves and verifies the payment itself; redirect status values
are never trusted. The customer can retry that check when the provider is slow.
The same verified payment transition handles this response and the webhook, so
a delayed webhook cannot commit stock twice. A 15-second cooldown and a
15-request/five-minute client limit keep checks bounded.

The checkout summary uses server quote prices and ignores stale quote
responses. Expired payment links are replaced by a reservation-expired message;
processing, declined and manual-review payments receive distinct guidance.
If a return cannot be verified, the page asks the customer to check again or
contact the atelier before paying again. See decision 0014.

## Private configuration

Store these values in the gitignored `.env.mercadopago.prod` or `.env.local`:

```dotenv
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_NOTIFICATION_SECRET=<random value of at least 32 characters>
PUBLIC_BASE_URL=https://mamyat.henriquealveslohrayne.workers.dev
```

The existing `ACESS_TOKEN` spelling in `.env.mercadopago.prod` is supported for
compatibility. Public key, client ID and client secret are unnecessary for
hosted checkout and are never shipped to the browser. Keep the notification
secret stable: rotating it invalidates notifications for existing preferences.

Run `npm run login:edge` once for browser sign-in, then `npm run deploy:edge`, or set
`SUPABASE_ACCESS_TOKEN` in `.env.local`. CLI auth is kept in ignored
`.tmp/supabase` so deployment needs no writes outside the workspace.
The script uploads the three settings
using a temporary ignored file, removes that file, then publishes the Edge
function. Run `npm run deploy:check` and `npm run deploy` for the storefront.
Use free Workers/Supabase hosting; no paid hosting is required.

## Payment confirmation

Each preference supplies its own HTTPS notification URL under
`/api/webhooks/mercadopago`. It contains a per-order HMAC token generated from
the private notification secret and immutable order ID. This authenticates
notifications without needing a separate dashboard webhook registration.
This token is our notification URL credential, not Mercado Pago's `x-signature`
dashboard secret. Never expose or log complete notification URLs.

The API authenticates the URL, then reads `/v1/payments/{id}` using the private
access token. It checks payment ID, external reference, metadata, exact total,
BRL currency and production mode. Browser return parameters cannot mark an
order paid. Duplicate deliveries do not decrement stock twice. Real payments
cannot be manually marked paid through the admin API.

The Edge implementation reacquires an expired reservation only when all units
remain available. Otherwise it sets `payment.review_required` and leaves the
order unfulfilled for an operator to reconcile/refund in Mercado Pago. It also
flags payments approved after cancellation and second payments against an
already paid order. Refund/chargeback notifications for the recorded payment
move a paid order to refunded; stock is not automatically restocked.
The local Python backend conservatively returns `409 payment_review` for
expired reservations rather than automatically reacquiring them.

## Validation

`node scripts/test_mercadopago.mjs` covers preference creation, private URL
authentication, provider verification, replay, delayed approval, unavailable
stock, cancellation, retries, expiry and admin restrictions without network.
Python provider tests are part of `python scripts/verify.py`.

Official references: [preferences API](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post)
and [payment notifications](https://www.mercadopago.com.br/developers/en/docs/checkout-pro-preferences/payment-notifications).

## Live publication (2026-10-22)

Supabase shop-api and its private payment settings are deployed. Storefront
Worker version `da0f087e-d19e-4ce9-a19b-3a6c03f81cb5` and admin version
`7eace1c0-5a39-44c7-b5bd-e63121485f5c` are published. Live config reports
`mercadopago` / `produ??o`. No real payment was submitted during verification.
Cloudflare device authorization succeeded with `wrangler login --device
--browser=false`, using `XDG_CONFIG_HOME` set to the project's `.tmp/xdg`.

Checkout polish was subsequently published as storefront version
`0d7af566-c8d7-44e4-9c3e-3dad4d678b9f` with the matching admin export.
43 Python tests and isolated API contracts passed; seven synthetic payment
states and quote/coupon recovery were verified in mobile/desktop browsers.
The live API remains in Mercado Pago production mode.
