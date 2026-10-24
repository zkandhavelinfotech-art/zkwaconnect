# ZKWAConnect v5.0.0

**WhatsApp Business API platform for Indian businesses.** It talks only to Meta's official Cloud API, with no AI and no third-party BSP.
Built with Next.js 15 · TypeScript · Prisma 7.9.1 · PostgreSQL. It deploys to Railway, Vercel, GoDaddy or HostGator via GitHub Actions.

---

## What's new in v5.0.0

v5.0.0 brings together the payments work (planned as 4.3), partners and calling (planned as 4.4), and the features of the separate v5.0.0 package, all in this git repo.

| Area | v5.0.0 |
|---|---|
| **UPI without a gateway** | Each workspace's **own UPI ID**. Customers get a payment page with **Google Pay, PhonePe, Paytm and BHIM** buttons plus a QR code, and submit the UTR; the business clicks **Confirm received** |
| **Payment accounts** | Each workspace's own UPI, Razorpay, Cashfree and WhatsApp Pay. Customer money never goes to the platform account |
| **WhatsApp Pay** | A **"Review and pay"** message, paid inside the chat through the business's gateway in WhatsApp Manager |
| **Plan auto-renewal** | Optional **Razorpay UPI AutoPay or card**, with a GST invoice every period |
| **WhatsApp Calling** | Answer customers' WhatsApp calls in the browser, and call them back with permission. Needs a messaging limit of 2,000+ |
| **Partner programme** | `/partner`: agencies manage client workspaces, either **wholesale** (wallet and discount) or **commission**, set per partner |
| **White-label** | The partner's logo, name and colour on sign-in and in client workspaces, at `<slug>.PARTNER_BASE_DOMAIN` or the partner's own domain |
| **Welcome credits** | ₹500 in the WhatsApp wallet for every new sign-up (change or turn off under Admin → Messaging charges) |
| **Credits / wallet** | `/app/billing/credits` → wallet top-up by UPI QR + UTR; messages are deducted automatically in the wallet-based billing options |
| **Org API** | `GET /api/app/org`: workspace, plan, usage and wallet balance |
| **Already in v4.x** (also listed in the v5.0.0 package) | WhatsApp Forms (native Flows + hosted), contact filters and segments, template library (40+), Meta Ads (CTWA and lead forms), live analytics, Free plan ₹0, Starter ₹999 / Business ₹2,499 / Professional ₹4,999 |

Earlier releases (see [CHANGELOG.md](CHANGELOG.md)):
- **v4.0.7:** legal pages, forgot password, two-factor sign-in and login lockout, cloud media storage, and the go-live checklist.
- **Before that:** 7-day trial with upgrade reminders, plan features, internal company workspaces, and AiSensy-parity features.

---

## Quick start (Windows)

```
copy .env.example .env
zkwa.bat  →  [14] Start local PostgreSQL 18 (as Administrator, if it isn't running)
          →  [20] Fresh Install
          →  [10] Start dev server
```

Fresh Install runs: npm install → prisma format / validate / generate → **safe** `prisma db push` → seed.

At minimum, fill in `DATABASE_URL`, `SESSION_SECRET` and `ENCRYPTION_KEY` (32+ random characters each). For Meta onboarding you also need `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` and `NEXT_PUBLIC_META_CONFIG_ID`. The full list, with notes, is in `.env.example`.

### Manual commands
```bash
npm install
npx prisma generate
npx prisma db push        # safe: stops instead of deleting data
npm run db:seed
npm run typecheck
npm run dev
```
> Never run `prisma db push --accept-data-loss` against the live database: it can delete columns and their data. `zkwa.bat [16]` asks for YES and is meant for local development only.

---

## Logins (local development)

`npm run db:seed` prints the logins it creates. Locally, those are `demo@zkwaconnect.in / demo1234` and `admin@zkwaconnect.in / admin2026!`.
In production the demo account is not created, and the admin password comes from `SEED_ADMIN_PASSWORD` (or is random and printed once). Change it and turn on two-factor sign-in (Profile → Two-factor sign-in).

---

## Plans (defaults; edit under Admin → Plans & features)

| Plan | ₹ / month | Users | Numbers | Messages / month |
|---|---|---|---|---|
| Free | 0 | 1 | 1 | 250 |
| Starter | 999 | 3 | 1 | 1,000 |
| Business ⭐ | 2,499 | 10 | 3 | 10,000 |
| Professional | 4,999 | 25 | 10 | 50,000 |
| Enterprise | 9,999 | 100 | 25 | 100,000 |

- New customers get a 7-day Business trial, then move to Free unless they pay.
- Company logins (Admin → Plans → Company logins) get internal workspaces: all features, no plan or charges.
- WhatsApp message charges are separate. You choose Meta-direct, platform fee or reseller wallet under Admin → Messaging charges.

---

## Route map

| Route | Page |
|---|---|
| `/` · `/marketing` | Public website |
| `/login` · `/register` · `/forgot-password` | Customer sign-in, sign-up and password reset |
| `/privacy` · `/terms` · `/refund-policy` · `/data-deletion` | Legal pages (needed for Meta App Review) |
| `/pay/<code>` | Public UPI payment page sent to a business's customers |
| `/partner` | Partner panel: clients, wallet or earnings, branding and domain |
| `/app/calls` | WhatsApp Calls: settings, call a customer, call log |
| `/projects` | Choose or create a workspace |
| `/onboarding/*` | Meta → WABA → phone → done |
| `/app/dashboard` | Dashboard, plan and usage |
| `/app/inbox` | Team inbox |
| `/app/contacts` · `/app/contacts/segments` | Contacts, import/export, saved segments |
| `/app/campaigns` | Broadcasts with scheduling, retargeting and click tracking |
| `/app/templates` | Templates (text, media, carousel) |
| `/app/automation` · `/app/forms` | Chatbot flows and WhatsApp forms |
| `/app/commerce` · `/app/payments` | Catalog and orders · payment requests and payment accounts |
| `/app/ads` · `/app/analytics` | Click-to-WhatsApp ads · analytics |
| `/app/integrations` · `/app/developers` | Shopify, WooCommerce, Zapier, Sheets · API keys and webhooks |
| `/app/team` · `/app/billing` · `/app/settings` · `/app/profile` | Team and roles · plans, invoices, auto-renew · settings · profile and 2FA |
| `/admin/dashboard` | Super admin: tenants, payments, plans, messaging charges, partners, **🚀 go-live checklist** |
| `/tools/*` | Free tools: link generator, button generator, blue tick, ROI calculator |

---

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: build → safe `prisma db push` → deploy to every host whose secrets are set.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for hosting and [docs/GO_LIVE.md](docs/GO_LIVE.md) for Meta approval, email, storage and security.

Webhook URLs to register:
- **Meta WhatsApp:** `https://<domain>/api/webhooks/whatsapp`. Subscribe to `messages`, `message_template_status_update` and `calls` (for WhatsApp Calling).
- **Razorpay:** `https://<domain>/api/webhooks/payments/razorpay`, with events `payment_link.paid` and `subscription.*`. Each workspace that uses its own Razorpay account registers the same URL with its own secret.
- **Cashfree:** `https://<domain>/api/webhooks/payments/cashfree`.
- **Meta data deletion:** `https://<domain>/api/meta/data-deletion`.

---

© 2026 ZKandavel Infotech · ZKWAConnect v5.0.0
