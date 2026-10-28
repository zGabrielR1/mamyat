# Payment return and expiry experience (2026-10-22)

Polish checkout without changing the hosted payment rail or the free hosting
topology. Summary prices come from the current server quote; stale quote
responses are ignored and failed quotes cannot leave an old payable total.

The Mercado Pago order panel distinguishes pending, processing, rejected,
expired and manual-review states. It shows the reservation deadline and keeps
an unverified return from inviting another payment. An expired preference is
not offered again. The local Python rail also checks expiry before reusing a
saved preference.

A hosted-checkout return may arrive before its webhook. Treat `payment_id` or
`collection_id` only as an identifier, never as evidence of payment. The
customer-authorized `POST /api/orders/{number}/payment-status` fetches that
payment from Mercado Pago and applies the same verified transition as the
webhook. It checks the immutable order reference, metadata, live mode, currency
and exact amount. A browser `status=approved` cannot confirm anything.

Limit return checks to 15 per five minutes per client/route and reuse the last
verified result for the same payment for 15 seconds. Normal order polling
remains local to the shop API and does not call Mercado Pago. Existing manual
review flags remain sticky when a duplicate notification arrives after stock
has changed.

Validate with provider/domain tests, Python App tests, isolated Postgres HTTP
contracts and desktop/mobile browser previews using synthetic orders. Preview
requests never create production orders, accept purchase terms or submit a
payment.
