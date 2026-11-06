# ZKWAConnect — WhatsApp Business Customer & Client Platform

**Production Domain:** `https://app.zkwaconnect.in`  
**Root Directory in GitHub:** `apps/app`

## Features Included
1. **Client / Customer Authentication:**
   - Multi-tenant login (`/login`) with email/password or magic link.
   - Client signup & onboarding wizard (`/register`).
2. **Customer Business Suite (`/app`):**
   - **Team Inbox:** Live WhatsApp chats, agent assignments, quick replies, multimedia messaging.
   - **Campaigns:** Broadcast scheduler, audience segmentation, CSV contacts import.
   - **Templates:** Meta-approved template manager with interactive CTA buttons.
   - **WhatsApp Forms & Flows:** Conversational lead collection.
   - **E-Commerce Integrations:** Native 1st-class ZKCommerce, Shopify, and WooCommerce cards.
   - **Developer Portal:** API Keys management, HMAC secret rotation, and webhook subscriptions.
   - **Billing & Wallet:** UPI QR auto-credits and invoice history.
3. **Database:**
   - Native **MySQL** & PostgreSQL support.

## GitHub Deployment Setup (e.g. Vercel / Railway / Render)
1. Link your GitHub repository (`zkwaconnect`).
2. Set **Root Directory** to `apps/app`.
3. Add Custom Domain: `app.zkwaconnect.in`.
4. Set Environment Variables:
   - `DATABASE_URL`: Your MySQL connection string (`mysql://user:pass@host:3306/zkwaconnect`)
   - `NEXT_PUBLIC_APP_URL`: `https://app.zkwaconnect.in`
   - `NEXT_PUBLIC_API_URL`: `https://api.zkwaconnect.in/api/v1`
   - `NEXT_PUBLIC_MARKETING_URL`: `https://zkwaconnect.in`
   - `META_APP_ID`, `META_APP_SECRET`: Your Meta Cloud API credentials

