# Staging Deployment — GitHub Secrets Setup

Set these secrets at: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

## Required secrets for CI/CD auto-deploy

| Secret name | Where to get it | Example |
|---|---|---|
| `STAGING_DATABASE_URL` | Neon console → Connection Details | `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
| `STAGING_JWT_SECRET` | Generate any 32+ char string | `zkwa-staging-secret-minimum-32-chars` |
| `RAILWAY_TOKEN` | railway.app → Account → Tokens | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `RAILWAY_API_SERVICE_ID` | Railway project → API service → Settings | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `RAILWAY_WORKER_SERVICE_ID` | Railway project → Worker service → Settings | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `VERCEL_TOKEN` | vercel.com → Account → Tokens | `xxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `VERCEL_ORG_ID` | Vercel Project → Settings → General | `team_xxxxxxxxxxxx` |
| `STAGING_NEXT_PUBLIC_API_URL` | Your Railway API URL | `https://api-staging.up.railway.app/api/v1` |

## Optional (for full feature support)

| Secret name | Where to get it |
|---|---|
| `STAGING_META_APP_ID` | developers.facebook.com |
| `STAGING_META_APP_SECRET` | developers.facebook.com |
| `STAGING_META_VERIFY_TOKEN` | Your custom string |
| `STAGING_TWILIO_ACCOUNT_SID` | console.twilio.com |
| `STAGING_TWILIO_AUTH_TOKEN` | console.twilio.com |
| `STAGING_TWILIO_PHONE_NUMBER` | console.twilio.com |
| `STAGING_RAZORPAY_KEY_ID` | dashboard.razorpay.com |
| `STAGING_RAZORPAY_KEY_SECRET` | dashboard.razorpay.com |
| `STAGING_RESEND_API_KEY` | resend.com |

## After setting secrets

Push to `main` branch → GitHub Actions will:
1. Lint + type-check + test
2. Build API + Web
3. Run `prisma migrate deploy` against Neon
4. Deploy API + Worker to Railway
5. Deploy Web to Vercel

## Manual deploy (no push needed)

```bash
# Windows
zkwa.bat → [12] Deploy Staging

# PowerShell
.\staging-setup.ps1
```

## Environment URLs after deploy

| Service | URL |
|---|---|
| Web (Vercel) | `https://[project].vercel.app` |
| API (Railway) | From Railway dashboard → Copy URL |
| Prisma Studio | `npx prisma studio` (local only, uses Neon DB) |
| Swagger (.NET) | `http://localhost:5000/swagger` |

## Verifying deployment

```bash
# Health check
curl https://[railway-api-url]/health

# Expected response
{"status":"ok","version":"3.3.0","timestamp":"..."}
```

## Setting webhook in Meta

1. Go to developers.facebook.com → Your App → WhatsApp → Configuration
2. Callback URL: `https://[railway-api-url]/webhook/meta`
3. Verify token: value of `META_VERIFY_TOKEN` in .env.staging
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`
5. Click Verify and Save

## Troubleshooting

**Prisma migrate fails:**
- Check `STAGING_DATABASE_URL` secret is the full Neon URL with `?sslmode=require`
- Make sure Neon project is active (free tier pauses after inactivity)

**Railway deploy fails:**
- Check `RAILWAY_TOKEN` is valid (tokens expire if unused)
- Verify service IDs are correct in Railway dashboard

**Vercel deploy fails:**
- Check `VERCEL_TOKEN` is not expired
- Verify `VERCEL_ORG_ID` is your team ID, not personal ID

**App loads but API calls fail:**
- Check `STAGING_NEXT_PUBLIC_API_URL` is the correct Railway URL
- Make sure Railway API service is running (not paused)
