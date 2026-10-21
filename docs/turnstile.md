# Captcha (Cloudflare Turnstile)

The shop verifies a Turnstile token on the doors that cost something: signup,
login, password-reset request, contact and checkout. The widget is rendered by
`web/components/turnstile.tsx` with the site key served by `/api/config`.

## Configure

`.env.turnstile` (local) or Cloudflare Worker secrets (hosted):

```
TURNSTILE_SECRET_KEY=0x…
TURNSTILE_SITE_KEY=0x…
TURNSTILE_HOSTNAMES=mamyatelie.com,www.mamyatelie.com,localhost
```

Create the widget in the Cloudflare dashboard → Turnstile. Use the
**managed** mode; add each hostname that serves the storefront.

The secret is the only sensitive value. The site key is public (it is embedded
in the page), and the hostname list is an allowlist checked by Cloudflare.

## Behaviour when unconfigured

With no `TURNSTILE_SECRET_KEY` the verifier is disabled and `App._gate` returns
immediately — the gate is a no-op, not a lockout. With a secret but no site
key, `/api/config` reports `turnstile.enabled = false`, so the widget is not
rendered and the browser sends no token; the server will reject that with
`captcha_required`. Set both or neither.

## How verification works

1. The storefront solves the widget and sends `turnstile_token` in the request
   body.
2. `App._gate(token, action, remote_ip)` calls the verifier, which posts to
   Cloudflare's `siteverify` with the secret, the token and the client IP.
3. The verifier also checks the returned `hostname` against
   `TURNSTILE_HOSTNAMES`.
4. A missing token is `400 captcha_required`; a rejected one is
   `400 captcha_failed`.

The action names passed to Cloudflare are `signup`, `login`, `reset`,
`contact` and `checkout` — useful when reading the Turnstile analytics.

## Test locally

Add `localhost` to `TURNSTILE_HOSTNAMES` and use the test keys Cloudflare
publishes (`1x00000000000000000000AA` for the site key,
`1x0000000000000000000000000000000AA` for the secret) to always pass.

## Failure modes

| Symptom | Cause |
|---|---|
| Widget does not appear | site key missing, or `/api/config` has `enabled: false` |
| `captcha_failed` with a valid widget | hostname not in `TURNSTILE_HOSTNAMES` |
| All doors reject | secret set without a site key |

Production refuses missing service configuration; the unconfigured fallback
applies only to local development. `npm run setup:services` provisions these
services from gitignored `.env.local` and Cloudflare account credentials.
