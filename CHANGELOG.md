# Changelog

## 4.4.0 — next · Partners & calling (planned)

- **White-label:** partner branding (name, logo, colours, support contact) on sign-in, the app, emails and invoices. Each partner gets a subdomain, plus an optional own domain.
- **Partner/reseller panel (`/partner`):** client workspaces, plans, usage and wallets. Wholesale or commission, chosen per partner by super admin.
- **WhatsApp Calling:** answer customer calls in the browser, call back after the customer grants permission, call logs and missed-call alerts.

## 4.3.0 — 2026-10-24 · Payments

- **Direct UPI without a gateway:**
  - each workspace adds its own UPI ID;
  - customers get a `/pay/<code>` page with Google Pay, PhonePe, Paytm and BHIM buttons plus a QR code, and submit the UTR;
  - the business clicks Confirm received, the linked order is marked paid and the customer gets a WhatsApp receipt.
- **Fix:** customer payment requests used the platform's own UPI ID and Razorpay/Cashfree keys, so money would have gone to the platform account. Each workspace now has its own payment accounts. Gateway webhooks are checked against that workspace's secret.
- **WhatsApp Pay (India):** "Review and pay" `order_details` messages through the business's gateway configured in WhatsApp Manager (Razorpay, PayU, BillDesk or Zaakpay). Meta's signed payment status marks the payment paid and updates the customer's order card.
- **Razorpay automatic plan renewal:** UPI AutoPay mandate or card, switched on by super admin. Every charge creates a GST invoice and extends the plan, and the customer can turn auto-renew off from Billing.
- **Billing:** one-tap UPI app buttons for plan invoices.
- **zkwa.bat:** DB Push and Fresh Install now use the safe `prisma db push` (it stops instead of deleting data). Allowing data loss is a separate option that asks for YES, and there's a new option to start local PostgreSQL 18.

## 4.0.7 — 2026-10-20 · Go-live readiness

- **Legal pages:** `/privacy`, `/terms`, `/refund-policy` and `/data-deletion`. Linked from sign-up, sign-in and the website footer, and filled in with the company details from the environment.
- **Meta data deletion:** a signed callback (`/api/meta/data-deletion`), a public request form with confirmation codes, and a request list in Admin.
- **Forgot password:** a one-time email link (SMTP) and/or a 6-digit WhatsApp code sent from the company's own number with an Authentication template. Resetting signs the user out everywhere.
- **Sign-in security:**
  - lockout after repeated wrong passwords or 2FA codes (per account and per IP);
  - working two-factor sign-in (authenticator app plus recovery codes) for customers and super admins;
  - the admin login no longer has the default password pre-filled;
  - the demo account and demo box are off on the live site;
  - the seed creates a random super-admin password in production.
- **Media storage:** S3-compatible buckets (Cloudflare R2, S3, Spaces, B2) or a persistent disk (`STORAGE_DIR`). Files saved before the switch are still read from the disk.
- **Admin → 🚀 Go-live checklist:**
  - configuration and security checks;
  - the URLs to paste into Meta and the payment gateways;
  - test buttons for email, storage and WhatsApp codes;
  - Meta approval steps.
- **Sign-up** asks for an optional WhatsApp number, used for password-reset codes.

## Since 4.0.6

- **Trials and reminders:** 7-day Business trial for new customers. Upgrade reminders 3 days before, on the last day and when the trial or plan ends, as in-app notifications plus push. New notification bell.
- **Internal workspaces:** company logins get internal workspaces (all features, no plan or charges), and super admin can mark any tenant internal.
- **Plans:** features per plan, a Free plan, server-side feature locks with upgrade prompts, and plan cards on Billing and the website.
- **Deploys:** automatic deploys (Railway, Vercel, GoDaddy and HostGator via GitHub Actions) and `/api/health`.
- **AiSensy-parity features:** broadcast queue, segments, click tracking, opt-out, team roles and invites, Instagram inbox, stores and COD confirmation, wallet billing modes, GST and UPI invoices, ice breakers, carousel templates and more.
