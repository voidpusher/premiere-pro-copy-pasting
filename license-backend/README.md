# Instant Paste — License Backend

A small Cloudflare Worker that runs **email-login licensing** for the plugin, fully
self-owned (no Gumroad dependency). Free tier is plenty (100k requests/day).

**How it works**
- A payment gateway (or you, manually) calls `/v1/grant` to mark an email as a paid customer.
- The customer logs into the plugin with their email.
- We email them (via **Resend**) a 6-digit code **and** a one-click "Activate in Premiere" link.
- Entering the code OR clicking the link logs them in and binds the account to **one device**.
- A session token keeps them logged in on that device (lifetime).
- You can **reset** a customer's device (to move machines) or **revoke** access (refunds).

---

## One-time setup (~10 min)

You need free accounts at [Cloudflare](https://dash.cloudflare.com/sign-up) and [Resend](https://resend.com).

### 1. Install + log in
```bash
cd instant-paste/license-backend
npm install
npx wrangler login
```

### 2. Create the KV namespace
```bash
npx wrangler kv:namespace create LICENSES
```
Copy the printed `id` into `wrangler.toml`.

### 3. Configure Resend (sending login emails)
- Sign up at resend.com → create an **API key**.
- For real sending, add and verify your domain in Resend, then set `RESEND_FROM`
  in `wrangler.toml` to e.g. `Instant Paste <login@yourdomain.com>`.
- To just test first, leave `RESEND_FROM = "onboarding@resend.dev"` — it only
  delivers to the email address on your own Resend account.

### 4. Set secrets
```bash
npx wrangler secret put RESEND_API_KEY     # paste your Resend API key
npx wrangler secret put ADMIN_TOKEN        # any long random string (authorizes grant/reset/revoke)
```

### 5. Deploy
```bash
npx wrangler deploy
```
Copy the printed worker URL, then:
- set `PUBLIC_URL` in `wrangler.toml` to that URL and run `npx wrangler deploy` again
  (so the magic-link points at the right place),
- paste the URL into the plugin at `cep-plugin/src/config.ts` → `LICENSE_API_URL`,
  set `DEV_BYPASS = false`, rebuild/redeploy the plugin.

---

## Giving a customer access

Your payment gateway's webhook should `POST /v1/grant` after a successful payment.
Until that's wired up, you can grant access manually:
```bash
curl -X POST https://<your-worker>/v1/grant \
  -H "X-Admin-Token: <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d "{\"email\":\"buyer@example.com\",\"plan\":\"lifetime\"}"
```

For a subscription instead of lifetime:
```bash
  -d "{\"email\":\"buyer@example.com\",\"plan\":\"subscription\",\"expires_at\":1750000000000}"
```
(`expires_at` is a millisecond timestamp; renew it from your billing webhook.)

## Moving a customer to a new device
```bash
curl -X POST https://<your-worker>/v1/reset \
  -H "X-Admin-Token: <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d "{\"email\":\"buyer@example.com\"}"
```

## Revoking access (refund/chargeback)
```bash
curl -X POST https://<your-worker>/v1/revoke \
  -H "X-Admin-Token: <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d "{\"email\":\"buyer@example.com\"}"
```

---

## API reference

| Endpoint | Auth | Body | Purpose |
|---|---|---|---|
| `POST /v1/login/start` | — | `{ email, machine_id }` | Email a code + magic link |
| `POST /v1/login/verify` | — | `{ req_id, code }` | Log in via typed code |
| `POST /v1/login/poll` | — | `{ req_id }` | Returns session once the link is clicked |
| `GET  /v1/login/confirm?t=` | — | — | Magic-link target (browser) |
| `POST /v1/session/validate` | — | `{ session, machine_id }` | Startup re-check |
| `POST /v1/grant` | admin | `{ email, plan, expires_at? }` | Mark email as paid |
| `POST /v1/reset` | admin | `{ email }` | Clear device binding |
| `POST /v1/revoke` | admin | `{ email }` | Disable account |
