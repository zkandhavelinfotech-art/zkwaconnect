# ZKWAConnect — Marketing & Product Owner Admin Portal

**Production Domain:** `https://zkwaconnect.in`  
**Root Directory in GitHub:** `apps/marketing`

## Features Included
1. **Public SaaS Marketing Website:**
   - Modern landing page with interactive product tour, AiSensy/Wati comparison calculator, and pricing tiers.
   - Self-serve registration links routing to `https://app.zkwaconnect.in/register`.
2. **Product Owner Super Admin Portal (`/admin`):**
   - Multi-tenant customer accounts and status monitoring.
   - Plan configuration, manual UPI/Bank payment approvals, and invoice auditing.
   - WhatsApp Meta connection health checks and platform-wide metrics.
   - White-label partner and agency management.

## GitHub Deployment Setup (e.g. Vercel / Railway / Render)
1. Link your GitHub repository (`zkwaconnect`).
2. Set **Root Directory** to `apps/marketing`.
3. Add Custom Domain: `zkwaconnect.in` (and `www.zkwaconnect.in`).
4. Set Environment Variables:
   - `DATABASE_URL`: Your MySQL connection string (`mysql://user:pass@host:3306/zkwaconnect`)
   - `NEXT_PUBLIC_APP_URL`: `https://app.zkwaconnect.in`
   - `NEXT_PUBLIC_API_URL`: `https://api.zkwaconnect.in/api/v1`
   - `NEXTAUTH_SECRET`: Random 32+ character string

