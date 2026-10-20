# Pix (Asaas)

Checkout takes payment by Pix. `api/asaas.py` creates the charge, returns the
copy-and-paste code plus the QR image, and settles only on a provider-confirmed
webhook — never on the browser returning to the success page.

## Configure

`.env.asaas` (local) or Render environment (hosted):

```
ASAAS_API_KEY=…
ASAAS_CUSTOMER_ID=            # optional
ASAAS_WEBHOOK_SECRET=…
ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
```

- `ASAAS_API_KEY` is the only required value. With it unset the shop uses
  `DemoPayments`.
- `ASAAS_CUSTOMER_ID` reuses one Asaas customer; without it each order creates
  (or reuses by CPF) a customer.
- `ASAAS_WEBHOOK_SECRET` is the token you configure on the Asaas webhook. The
  server checks it before touching an order.
- Use `https://api.asaas.com/v3` in production. The sandbox is the default in
  `.env.example`.

## Register the webhook

In Asaas → Integrações → Webhooks, add:

```
https://<service>.onrender.com/api/webhooks/asaas
```

Set the same value in `ASAAS_WEBHOOK_SECRET`. Subscribe to payment events
(`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`). The endpoint also accepts the
sandbox's test calls.

The webhook is idempotent: it matches the order by `payment.provider_id` and
only moves an order that is still `awaiting_payment`.

## Flow

1. `POST /api/orders` reserves stock, creates the order as
   `awaiting_payment`, and asks Asaas for a Pix charge.
2. The order response carries `payment.qr_code`, `payment.qr_base64` and
   `payment.expires_at`; the storefront shows the code and copy button.
3. When Asaas confirms, `POST /api/webhooks/asaas` matches the order by
   `order_number`/`provider_ref`, checks the amount, marks the order `paid`,
   commits the stock reservation, and sends the confirmation email. A wrong
   webhook token is `401 bad_signature`; a mismatched amount is
   `400 payment_mismatch`.
4. If the order is cancelled (by the customer or the admin) the reservation is
   released. An unpaid order can be retried with
   `POST /api/orders/<number>/pay`.
5. An admin can force `paid` from the panel for a payment confirmed by hand.

## When unconfigured

`DemoPayments` returns a fake code and marks the payment mode `demo` in
`/api/config`; the storefront shows a "demonstração" banner. The admin panel
can mark those orders paid to exercise the rest of the flow.

## Failure modes

| Symptom | Cause |
|---|---|
| Order exists but no Pix code (`payment.status: "error"`) | Asaas unreachable or the key was rejected; retry with `/api/orders/<number>/pay` |
| Orders stay `awaiting_payment` | webhook not registered, or the secret differs |
| `"payment": "demo"` in health | no `ASAAS_API_KEY` |
| Sandbox charges in production | `ASAAS_BASE_URL` still points at the sandbox |

A provider outage never fails the checkout: the order is stored as
`awaiting_payment` with `payment.status = "error"` and `retryable = true`, so a
retry cannot lose the sale or hold stock twice.
