# Needed from the owner

Everything below is optional for a local demo and required for a real launch.
Values belong in gitignored `.env*` files locally and in the hosting dashboard
(never in the repository).

## Accounts and access

- [ ] Supabase organization/project for the shop
  - [ ] project URL and database password (pooler connection string)
  - [ ] migration applied (`supabase/migrations/20261020000000_mamyat.sql`)
- [ ] Render account with the repository connected (or a Render API key)
- [ ] Vercel account with the repository importable
- [ ] Domain `mamyatelie.com` (and `www`) — DNS access to point it at Vercel

## Payments

- [ ] Asaas account (production, or sandbox to start)
  - [ ] `ASAAS_API_KEY`
  - [ ] `ASAAS_WEBHOOK_SECRET` chosen by us and registered in Asaas
  - [ ] `ASAAS_CUSTOMER_ID` (optional)
  - [ ] decide sandbox (`https://sandbox.asaas.com/api/v3`) vs production
        (`https://api.asaas.com/v3`)
- [ ] CPF/CNPJ and bank details registered in Asaas (owner-side, not in code)

## Email

- [ ] Resend account
- [ ] `mamyatelie.com` verified (SPF/DKIM records)
- [ ] `RESEND_API_KEY`
- [ ] the sender address to use (`MAIL_FROM`), e.g. `oi@mamyatelie.com`

## Captcha

- [ ] Cloudflare Turnstile widget
  - [ ] `TURNSTILE_SITE_KEY`
  - [ ] `TURNSTILE_SECRET_KEY`
  - [ ] hostnames: `mamyatelie.com`, `www.mamyatelie.com`, plus the Vercel
        preview hostname if previews must work

## Social login (only if wanted)

- [ ] Google OAuth web client (`GOOGLE_CLIENT_ID` / `_SECRET`)
- [ ] Facebook app (`FACEBOOK_CLIENT_ID` / `_SECRET`)
- [ ] Apple Services ID + key + team id (`APPLE_*`)
- [ ] the redirect URIs listed in [oauth.md](oauth.md) registered with each

## Store details

- [x] contact email `taynaramelo45@gmail.com`
- [x] WhatsApp `+55 47 99666-9607`
- [x] Instagram `@atelieda_mamy`
- [x] CNPJ `40.239.348/0001-50`
- [ ] city/state and pickup address — the default city is still `São Paulo · SP`,
      which does not match the 47 area code; confirm the atelier's real location
- [ ] the admin password to set (`ADMIN_PASSWORD`, 8+ characters) — or keep the
        generated one from the first boot
- [ ] pickup address and delivery estimate
- [ ] real product photos (the seed ships SVG illustrations)
- [ ] final prices, shipping fee and free-shipping threshold
- [ ] legal text for `/politicas` (exchange/return policy, privacy)

## After the values arrive

1. Put them in `.env.asaas`, `.env.resend`, `.env.turnstile`,
   `.env.betterauth`, `.env.supabase` (copy `.env.example`).
2. `python scripts/render_deploy.py --check`
3. `python scripts/render_deploy.py`
4. Set `BACKEND_URL` on Vercel to the Render URL and redeploy the frontend.
5. Run the smoke checks in [deploy.md](deploy.md).
