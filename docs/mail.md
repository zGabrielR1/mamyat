# Email (Resend)

Transactional mail goes through Resend when configured, and through the console
mailer otherwise. Every message is sent through `api/app.py` → `foundry.mail`;
nothing in the shop calls a provider directly.

## Configure

`.env.resend` (local) or Cloudflare Worker secrets (hosted):

```
RESEND_API_KEY=re_…
MAIL_FROM=Mamy Ateliê <oi@mamyatelie.com>
MAIL_FROM_NAME=Mamy Ateliê
```

Both the key and a sender are needed for real delivery. `MAIL_FROM` must be on
a domain verified in Resend (add the SPF/DKIM records Resend shows for
`mamyatelie.com`).

## What is sent

| Trigger | Subject | Recipient |
|---|---|---|
| Signup / first social login | `Sua conta no Mamy Ateliê` | the customer |
| Password reset request | `Redefinir sua senha · Mamy Ateliê` | the customer |
| Order created | `Pedido <number> · Mamy Ateliê` | the order email |
| Payment confirmed | `Pagamento confirmado · <number>` | the order email |
| Order shipped | `Pedido enviado · <number>` | the order email |
| Contact form | `Contato do site · <name>` | the store email from settings |

Messages use idempotency keys (`welcome:<id>`, `order-paid:<number>`, …), so a
retry does not double-send.

## Behaviour when unconfigured

`resolve_mailer` returns the console mailer: the message is printed to stdout
(`[mail:console] would send to '…'`) and the API still returns success. This is
intentional — a signup must not fail because email is unset. Check
`/api/health` → `"mail": "console"` versus `"mail": "resend"`.

## Test

```bash
# with the key in .env.resend, this logs instead of sending when it is absent
python -m api.server --port 8099
curl -X POST http://127.0.0.1:8099/api/auth/password/request \
  -H 'content-type: application/json' \
  -d '{"email":"<a real customer>"}'
```

With Resend configured, the message arrives at the customer address and the
reset link uses `PUBLIC_BASE_URL`, never a request header.

## Failure modes

| Symptom | Cause |
|---|---|
| `"mail": "console"` in health | no `RESEND_API_KEY`, or no sender |
| Resend 403 | `MAIL_FROM` domain is not verified |
| Reset link points at localhost | `PUBLIC_BASE_URL` unset on the host |

Production refuses missing service configuration; the unconfigured fallback
applies only to local development. `npm run setup:services` provisions these
services from gitignored `.env.local` and Cloudflare account credentials.
