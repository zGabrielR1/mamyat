# Mercado Pago hosted checkout (2026-10-22)

The owner requested production Mercado Pago payments. Keep the free Workers
and Supabase topology and the existing order/reservation transaction seam.

Create Checkout Pro preferences server-side using the recomputed final total,
including shipping and discounts. Redirect to the returned HTTPS `init_point`;
card details stay on Mercado Pago. Prefer Mercado Pago when its production
access token is configured; retain the existing demo/Asaas local fallbacks.
Do not fall back to demo if configured production payment creation fails.

Authenticate the per-preference notification URL with an order-scoped HMAC,
then retrieve the actual payment using the merchant access token. Match the
immutable order ID, payment ID, metadata, BRL amount and live mode before
committing stock. Browser return parameters are informational only.
Dashboard `x-signature` registration is not required for this URL-token flow.

Preserve the existing 30-minute reservation. Exclude boleto/ATM payment types.
Late approvals can reacquire stock transactionally on Edge if units remain
available. Otherwise mark the payment for manual reconciliation, prevent
another payment attempt and show an operator/customer notice. Duplicate
notifications cannot commit stock twice. A second approved payment or an
approval after cancellation requires manual reconciliation. Refunds and
chargebacks update order status without automatically restocking.

Provider calls have a 12-second timeout and refuse redirects. Checkout errors
retain the order/reservation and expose a retry; successful retries reuse the
same preference. Provider calls remain inside the existing commerce lock;
this is acceptable for this small atelier and avoids a new coordination seam.
Preference creation can succeed before a network/DB failure, so notification
processing checks immutable references and flags duplicate real payments.

Validation includes network-free provider/domain tests, isolated Postgres HTTP
contracts and stock concurrency, the frontend production build, and opening
a real production preference in a browser without submitting payment.
