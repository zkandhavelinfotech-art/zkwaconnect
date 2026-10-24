# Changelog

## 4.4.0 — 2026-10-24 · Partners, white-label & WhatsApp Calling

- **WhatsApp Calling (Calls page and a call widget):**
  - customers tap the call button in the business's WhatsApp chat, the call rings in every open ZKWAConnect tab, and the first agent to answer takes it, talking in the browser over WebRTC;
  - call-back after the customer accepts a call-permission request (7 days, or permanent);
  - call log, missed-call alerts, calls recorded in the chat, and a 📞 button in the inbox;
  - per-number on/off through Meta's settings API, which needs a messaging limit of 2,000+;
  - it's a new plan feature, "WhatsApp Calling", on Professional and Enterprise by default.
- **Partner programme (`/partner`):** an agency applies; super admin approves and sets **Wholesale** (wallet, discount %) or **Commission** (% of client plan payments) per partner.
  - **Clients:** partners create client workspaces with an owner invitation.
  - **Wholesale:** partners top up the wallet by UPI (GST invoice, approved under Payments) and buy or renew client plans from it. Their clients see "plan managed by …" on Billing.
  - **Commission:** accrues automatically on every approved plan payment, including Razorpay auto-renewals. Super admin records payouts.
- **White-label:**
  - partner name, logo, colour, support contact and a "Powered by" switch, applied to sign-in, sign-up and password pages, reset emails, and the app inside client workspaces;
  - each partner gets an address `<slug>.PARTNER_BASE_DOMAIN`, plus an optional own domain verified by DNS CNAME;
  - sign-ups on a partner's address become that partner's clients.
- **Admin:** Partners page (approve or suspend, programme and %, payouts and adjustments, domain status).

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
