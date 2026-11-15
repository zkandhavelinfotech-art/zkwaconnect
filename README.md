# ZKWAConnect v4.0.6

Multi-tenant WhatsApp Business API SaaS Platform.
Built with Next.js 15 · TypeScript · Prisma 7.9.1 · PostgreSQL

---

## Quick Start

### 1. Copy env file
```
copy .env.example .env
```
Fill in `DATABASE_URL` and `SESSION_SECRET` at minimum. To use Meta onboarding, also set real
`META_APP_ID`, `META_APP_SECRET`, and a unique 32+ character `ENCRYPTION_KEY`. Register the
`META_OAUTH_REDIRECT_URI` value in the Meta app's OAuth redirect URI settings.
Meta Ads reporting and Lead Form retrieval also require approved `ads_read`, `leads_retrieval`,
`pages_show_list`, and `pages_read_engagement` permissions in the Meta app.
For UPI checkout and GST invoices, configure `UPI_ID`, supplier `GSTIN`, `COMPANY_NAME`,
`COMPANY_ADDRESS`, `HSN_CODE`, and `GST_RATE`. Invoice tax breakup uses the supplier and
customer state codes; confirm tax settings with your accountant before production use.
Razorpay and Cashfree payment links are optional; configure their keys and webhook secrets to
enable automatic payment confirmation. Set Meta's WhatsApp webhook URL to
`/api/webhooks/whatsapp` and subscribe to `messages` to run keyword workflows and track delivery.
Campaign launches use approved templates, require contact opt-in, and are capped at 500 recipients
per launch. Workflow automation is deterministic keyword/any-message matching with saved replies;
there are no AI agents.
Set `SUPPORT_WHATSAPP_NUMBER` to the support number in international format (digits only) to
enable the floating WhatsApp chat button on the marketing site.

### 2. Fresh Install (Windows)
```
zkwa.bat → [20] Fresh Install
```

### 3. Manual commands
```bash
npm install
npx prisma format
npx prisma validate
npx prisma generate
npx prisma db push --accept-data-loss   ← Railway/Neon/GoDaddy
npx prisma generate
npm run db:seed
npm run typecheck
npm run build
npm run dev
```

---

## Login
| URL | Credentials |
|-----|-------------|
| http://localhost:3000/login | demo@zkwaconnect.in / demo1234 |
| http://localhost:3000/admin/login | admin@zkwaconnect.in / admin2026! |

---

## Route Map

| Route | Description |
|-------|-------------|
| `/` | Smart redirect → /marketing or /app/dashboard |
| `/marketing` | Public marketing website |
| `/login` | Customer login |
| `/waba/login` | Customer login alias |
| `/register` | Customer signup |
| `/admin/login` | Staff-only admin login (dark theme) |
| `/admin/dashboard` | Super admin panel |
| `/onboarding/meta-connect` | Step 1: Meta OAuth |
| `/onboarding/waba-setup` | Step 2: WABA setup |
| `/onboarding/phone-registration` | Step 3: Phone OTP |
| `/onboarding/complete` | Step 4: Completion |
| `/app/dashboard` | Customer dashboard |
| `/app/inbox` | Live WhatsApp inbox |
| `/app/campaigns` | Campaign manager |
| `/app/ads` | Meta Ads, CTWA, website destinations, Lead Forms |
| `/app/forms` | Hosted forms and native WhatsApp Flows |
| `/app/payments` | UPI, Razorpay, and Cashfree WhatsApp payment links |
| `/app/billing` | UPI payment + invoices |
| `/app/settings` | WABA + team + webhook |

---

## GoDaddy / Railway / Neon Deployment

Use `db push` instead of `migrate dev`:
```bash
npx prisma db push --accept-data-loss
```

Next.js config uses standard output (no `standalone`) for compatibility
with GoDaddy Node.js hosting.

---

## Version History

| Version | Status | What's in it |
|---------|--------|--------------|
| v3.3.0 | ✅ Production | Fastify monorepo, .NET Core 8, 38/38 tests |
| v4.0.3 | ✅ Done | WhatsApp Core — Inbox, Contacts, Conversations |
| v4.0.4 | ✅ Done | Campaigns, Billing, Admin dashboard |
| v4.0.5 | ✅ Done | Prisma fixes, login fixed, generated/prisma |
| v4.0.6 | 🔧 Current | Full source rebuild, layout fix, GoDaddy compat |
| v4.0.7 | 📅 Next | Redis queue, BullMQ worker, monitoring |

---

© 2026 ZKandhavel Infotech Pvt. Ltd.
