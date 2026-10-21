# Needed from the owner

Everything below is optional for a local demo and required for a real launch.
Values belong in gitignored `.env*` files locally and in the hosting dashboard
(never in the repository).

## Accounts and access

- [ ] Supabase organization/project for the shop
  - [ ] project URL and database password (pooler connection string)
  - [ ] migration applied (`supabase/migrations/20261020000000_mamyat.sql`)
- [ ] Cloudflare account ID and API token for this shop (or connected browser)
- [ ] Docker engine or authorized Cloudflare build infrastructure
- [ ] Domain `mamyatelie.com` (and `www`) — ownership/registration and DNS access for Cloudflare

## Payments

- [ ] Asaas account (production, or sandbox to start)
  - [ ] `ASAAS_API_KEY` - `.env.asaas
  - [ ] `ASAAS_WEBHOOK_SECRET` chosen by us and registered in Asaas - `.env.asaas
  - [ ] `ASAAS_CUSTOMER_ID` (optional) - `.env.asaas
  - [ ] decide sandbox (`https://sandbox.asaas.com/api/v3`) vs production - `.env.asaas
        (`https://api.asaas.com/v3`)
- [ ] CPF/CNPJ and bank details registered in Asaas (owner-side, not in code)

## Email

- [x] Resend account access via `.env.local` API key
- [ ] `mamyatelie.com` verified (SPF/DKIM records)
- [x] `RESEND_API_KEY` validated (2026-10-21)
- [x] `MAIL_FROM=oi@mamyatelie.com` configured; domain created in Resend

## Captcha

- [ ] Cloudflare Turnstile widget
  - [ ] `TURNSTILE_SITE_KEY`
  - [ ] `TURNSTILE_SECRET_KEY`
  - [ ] hostnames: `mamyatelie.com`, `www.mamyatelie.com`, plus a dedicated preview
        hostname only if previews must work

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
- [x] city/state and pickup address — the atelier is in `Concórdia · SC`
      (the 47 area code matches Santa Catarina); pickup is combined with the
      atelier after payment
- [ ] the admin password to set (`ADMIN_PASSWORD`, 8+ characters) — or keep the
        generated one from the first boot
- [ ] pickup address and delivery estimate
- [ ] real product photos (the seed ships SVG illustrations) - Will be given in the Admin panel where the owner can create new products.
- [ ] final prices, shipping fee and free-shipping threshold  - Will be given in the Admin panel where the owner can create new products.
- [ ] legal text for `/politicas` (exchange/return policy, privacy) - Generate a template for one

## After the values arrive

1. Put them in `.env.asaas`, `.env.resend`, `.env.turnstile`,
   `.env.betterauth`, `.env.supabase` (copy `.env.example`).
2. `npm run setup:services`
3. `npm run deploy:check`
4. `npm run deploy` (Cloudflare routes both frontend and API).
5. Run the smoke checks in [deploy.md](deploy.md).
