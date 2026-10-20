# Going live

Use this with **Admin → 🚀 Go-live checklist** (`/admin/go-live`). The checklist marks each item ✅/❌ on the live server, lists the URLs to paste into Meta, and has buttons to test email, storage and WhatsApp codes.

## 1. Server (Railway recommended)

The background worker (broadcasts, chatbot delays, cart and plan reminders) runs inside the server, so use an always-on host. On Vercel, set `CAMPAIGN_WORKER=off` and `CRON_SECRET`; the every-minute cron in `vercel.json` needs a Vercel Pro plan.

| Variable | Notes |
|---|---|
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | `https://app.zkwaconnect.in` |
| `SESSION_SECRET`, `ENCRYPTION_KEY` | 32+ random characters each (`openssl rand -base64 48`). **Never change `ENCRYPTION_KEY` after customers connect**: stored Meta tokens and 2FA secrets use it. |
| `COMPANY_NAME`, `COMPANY_ADDRESS`, `GSTIN`, `SUPPORT_EMAIL`, `GRIEVANCE_OFFICER`, `LEGAL_JURISDICTION` | Shown on the invoices and legal pages |
| `SMTP_*` | Password-reset emails |
| `S3_*` *or* `STORAGE_DIR` | Media storage (see 3) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Used once by `npm run db:seed`; leave `SEED_DEMO=off` |

## 2. Meta approval (start first: 1–3 weeks)

1. **Business verification**: Meta Business Suite → Security Centre. Use the legal name, address and documents that match the website and GSTIN.
2. **Meta app**: Business type, with the WhatsApp and Facebook Login for Business products, owned by the verified portfolio.
3. **Settings → Basic**: Privacy `/privacy`, Terms `/terms`, Data deletion callback `/api/meta/data-deletion`, icon and category. Then switch to **Live**.
4. **Tech Provider**: needed so customers can connect their own numbers through Embedded Signup.
5. **App Review, advanced access**: `whatsapp_business_management`, `whatsapp_business_messaging` and `business_management`. Add `ads_management`, `pages_show_list` and `instagram_manage_messages` only if you sell Ads or Instagram. Each permission needs a screen recording of ZKWAConnect using it.
6. **Embedded Signup configuration**: its ID goes in `NEXT_PUBLIC_META_CONFIG_ID`.
7. **Webhook**: `https://<domain>/api/webhooks/whatsapp`, verify token = `META_VERIFY_TOKEN`. Subscribe to `messages` and `message_template_status_update`.
8. **Your own number**: connect the company number in ZKWAConnect and add a payment method in WhatsApp Manager. Create an **Authentication** template (e.g. `zk_login_code`, with a "Copy code" button) and select it under Go-live → WhatsApp verification codes.

## 3. Media storage

Uploaded and received files (inbox media, template headers, carousel cards) must survive redeploys.

- **Cloudflare R2** (recommended; free tier, no egress fees): create a bucket and an API token with Object Read & Write, then set `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. Amazon S3, DigitalOcean Spaces and Backblaze B2 work the same way.
- **Railway volume**: add a volume mounted at `/data` and set `STORAGE_DIR=/data`.
- If you switch an existing server to a bucket, files saved before the switch are still read from the disk. Copy `storage/` into the bucket to keep them after the next redeploy.

## 4. Sign-in security (built in from v4.0.7)

- 5 wrong passwords or 2FA codes for an account within 15 minutes lock that account for 15 minutes. 30 failures from one IP lock the IP for 30 minutes.
- **Forgot password**: the email link and the WhatsApp code each last 30 minutes and work once. A reset signs the user out everywhere. At most 3 requests per account per hour.
- **Two-factor sign-in**: Profile → Two-factor sign-in (authenticator app plus 8 recovery codes). Turn it on for every super admin.
- The public demo account and the "Fill demo credentials" box are off unless `SEED_DEMO=on` / `NEXT_PUBLIC_DEMO_LOGIN=on`.

## 5. Before announcing

- [ ] Every Go-live check is ✅. ⚠️ items are optional.
- [ ] Test email, storage and a WhatsApp code from the checklist page.
- [ ] Sign up as a new customer, connect a test number, send a template, then reset your password.
- [ ] Set up daily database backups (Railway → Postgres → Backups) and an uptime monitor on `/api/health`.
- [ ] Have the legal pages reviewed by your CA or lawyer. They are a starting point, not legal advice.
