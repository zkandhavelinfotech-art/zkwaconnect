# ZKWAConnect — Public REST API & Webhooks Engine

**Production Domain:** `https://api.zkwaconnect.in`  
**Base API Endpoint:** `https://api.zkwaconnect.in/api/v1`  
**Root Directory in GitHub:** `apps/api`

## Features Included
1. **Public REST API v1 (`/api/v1/*`):**
   - `POST /api/v1/messages/send` — Direct text/media WhatsApp sender.
   - `POST /api/v1/messages/template` — Approved template sender (bypasses 24h window).
   - `GET /api/v1/messages/:id` — Message delivery status.
   - `GET /api/v1/account` — Workspace profile, plan, credits, and WABA status.
   - `GET /api/v1/whatsapp/phone-numbers` — Connected WhatsApp numbers.
   - `GET /api/v1/contacts` & `POST /api/v1/contacts` — Contact CRM.
   - `GET /api/v1/webhooks` & `POST /api/v1/webhooks` — Outbound webhook subscriptions.
   - `GET /api/v1/usage` — Real-time analytics and rate limit quotas.
2. **OWASP HMAC-SHA256 Security:**
   - Full header verification (`X-ZKWA-Key`, `X-ZKWA-Timestamp`, `X-ZKWA-Signature`).
   - Anti-replay timestamp check (±300 seconds).
   - Sliding-window rate limiting per API key.
3. **Database:**
   - Native **MySQL** & PostgreSQL support.

## GitHub Deployment Setup (e.g. Vercel / Railway / Render)
1. Link your GitHub repository (`zkwaconnect`).
2. Set **Root Directory** to `apps/api`.
3. Add Custom Domain: `api.zkwaconnect.in`.
4. Set Environment Variables:
   - `DATABASE_URL`: Your MySQL connection string (`mysql://user:pass@host:3306/zkwaconnect`)
   - `NEXT_PUBLIC_APP_URL`: `https://app.zkwaconnect.in`
   - `META_APP_ID`, `META_APP_SECRET`: Your Meta Cloud API credentials

