# Social login (Better Auth)

Google, Facebook and Apple sign-in run in a small stateless Node process beside
the Python API. Better Auth proves who signed in; the shop decides which
customer that identity belongs to. No Better Auth database exists, so an
ephemeral Render instance is enough.

```
browser ──GET /api/betterauth/sign-in/social──► Python ──proxy──► Node (127.0.0.1:3100)
   │                                                               │
   └──────────── provider consent screen ◄─────────────────────────┘
                                   │
                        GET /api/betterauth/bridge
                                   │  read session, sign identity claim
                                   ▼
                     POST /api/auth/social/bridge (Python)
                                   │  verify HMAC, link/create customer
                                   ▼
            302 /entrar/social?token=<handoff>
                                   │  storefront POSTs /api/auth/social/exchange
                                   ▼
                            normal ms1 customer session
```

## Configuration

Put these in the gitignored `.env.betterauth` (local) or the Render dashboard
(hosted). The Python process reads the same file.

| Variable | Meaning |
|---|---|
| `BETTER_AUTH_SECRET` | 32+ random chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_BRIDGE_SECRET` | shared HMAC key for the identity bridge |
| `BETTER_AUTH_URL` | public origin, e.g. `https://mamyatelie.com` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | comma-separated origins allowed to start/finish |
| `BETTER_AUTH_INTERNAL_URL` | Python → Node, default `http://127.0.0.1:3100` |
| `BETTER_AUTH_INTERNAL_PORT` | Node listen port, default `3100` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth web client |
| `FACEBOOK_CLIENT_ID` / `_SECRET` | Facebook app |
| `APPLE_CLIENT_ID` / `TEAM_ID` / `KEY_ID` / `PRIVATE_KEY` | Sign in with Apple |

A provider is enabled only when its credentials are complete. With none, the
sidecar reports itself disabled and the storefront hides the buttons;
`/api/betterauth/providers` answers `{enabled: false, providers: []}`.

## Redirect URIs to register

```
https://mamyatelie.com/api/betterauth/callback/google
https://mamyatelie.com/api/betterauth/callback/facebook
https://mamyatelie.com/api/betterauth/callback/apple
```

For local development use the localhost equivalents and add
`http://localhost:3000` to `BETTER_AUTH_TRUSTED_ORIGINS`.

Apple notes: create a **Services ID** (that is the client id), a Sign in with
Apple key (`.p8`), and put the key contents in `APPLE_PRIVATE_KEY` with
newlines escaped as `\n`. The sidecar mints the Apple client secret itself.

## The bridge contract

The sidecar POSTs canonical JSON (`sort_keys`, compact separators, ASCII
escapes — matching Python's `json.dumps` defaults) to
`/api/auth/social/bridge` with `X-Bridge-Signature: sha256=<hex hmac>`. The
payload is:

```json
{"provider":"google","subject":"…","email":"…","email_verified":true,
 "name":"…","ts":1750000000}
```

`foundry.betterauth.verify_bridge` checks the signature and the timestamp.
On success the API returns `{handoff, redirect, customer}`. The handoff is
single-use and short-lived; the storefront exchanges it at
`/api/auth/social/exchange` for a normal `ms1` session.

Accounts are matched by provider link first, then by email. A first-time
social user gets a generated unique username and an empty password hash; they
can set a password later from `/conta` if they want email login. When a
provider omits the email, a non-deliverable
`…@social.mamyatelie.invalid` placeholder keeps the row valid.

## Failure modes

| Symptom | Cause |
|---|---|
| No social buttons | no provider credentials, or sidecar not running |
| 503 `betterauth_unavailable` | Python cannot reach `127.0.0.1:3100` |
| Redirect to `/entrar/social?error=…` | bridge rejected the identity; read the Node log |
| `social_invalid` | `BETTER_AUTH_BRIDGE_SECRET` differs between processes |
