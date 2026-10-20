# Deploying ZKWAConnect v4

Every push to `main` runs **.github/workflows/deploy.yml**:

1. **Check & build** – type check + production build. If this fails, nothing is deployed.
2. **Update database schema** – `prisma db push` adds new tables/columns. It **stops** (and blocks the deploy) if a change would delete data, so nothing is dropped automatically.
3. **Deploy** – to every host whose secrets are set (Railway, Vercel, GoDaddy, HostGator). Hosts without secrets are skipped.
4. **Health check** – calls `https://<your-app>/api/health` until it answers.

You can also run it by hand: GitHub → **Actions → Deploy ZKWAConnect v4 → Run workflow** and pick one target.

All secrets/variables go in GitHub → repository **Settings → Secrets and variables → Actions**.

## Which host to use

| Host | Good for | Notes |
|---|---|---|
| **Railway** (recommended) | Production | Always-on server: broadcasts, webhooks, flow delays and cart reminders run continuously. Add a volume for `storage/`. |
| **GoDaddy / HostGator (cPanel Node.js)** | Production on existing hosting | Needs a plan with **Setup Node.js App** + SSH. Passenger may sleep an idle app — add the cron job below so broadcasts keep sending. |
| **Vercel** | Front-end / demo | Serverless: background work runs from Vercel Cron once a minute (**Pro plan**; Hobby runs crons only daily). Uploaded media (template headers, inbox files) is **not** kept between requests — use Railway or cPanel for production. |

Use **one production database** (e.g. Railway Postgres or Neon) for all hosts you run in parallel.

## Shared settings

**Secret**

| Name | Value |
|---|---|
| `DATABASE_URL` | Production Postgres URL — used by the workflow to update the schema |

**Variables** (baked into the browser bundle at build time)

| Name | Example |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.zkwaconnect.in` |
| `NEXT_PUBLIC_META_APP_ID` | your Meta app ID |
| `NEXT_PUBLIC_META_CONFIG_ID` | Embedded Signup configuration ID |

Every host also needs the **runtime variables** from `.env.example` (DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, APP_URL, META_*, UPI/GST, …) set **on the host itself** (Railway Variables, Vercel Environment Variables, or a `.env` file in the cPanel app folder). Use the same `ENCRYPTION_KEY` everywhere — it decrypts stored Meta tokens.

## Railway

1. Create a project → **Deploy from GitHub repo is not needed** (the workflow uploads the code) → add an empty service, plus **Postgres** (or use Neon).
2. Service → **Variables**: paste the runtime variables. Service → **Settings → Networking**: generate a domain or add `app.zkwaconnect.in`.
3. Service → **Volumes**: mount a volume at `/app/storage`.
4. Account → **Tokens**: create a project token.
5. GitHub secrets: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID` (service → Settings → copy ID). Variable: `RAILWAY_APP_URL` (e.g. `https://app.zkwaconnect.in`).

`railway.toml` sets the build, `npm start`, and the `/api/health` check.

## Vercel

1. Import the repo in Vercel once (or `vercel link` locally) and add the runtime variables under **Settings → Environment Variables**, plus `CAMPAIGN_WORKER=off` and `CRON_SECRET=<long random string>` (Vercel Cron sends it automatically).
2. Turn **off** Vercel's own Git auto-deploy if you only want the workflow to deploy (Settings → Git → Ignored Build Step: `exit 0`).
3. GitHub secrets: `VERCEL_TOKEN` (Account → Tokens), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `.vercel/project.json` after `vercel link`). Variable: `VERCEL_APP_URL`.

`vercel.json` adds the once-a-minute cron for `/api/cron/campaigns`.

## GoDaddy / HostGator (cPanel "Setup Node.js App")

Do this once per host:

1. cPanel → **Setup Node.js App → Create application**: Node.js **20**, mode **Production**, application root e.g. `zkwaconnect`, application URL your domain/sub-domain, startup file **`server.js`**. Save.
2. Copy the **"Enter to the virtual environment"** command shown at the top — the path after `source` (e.g. `/home/USER/nodevenv/zkwaconnect/20/bin/activate`) is `*_NODE_ENV_ACTIVATE`.
3. In the application root create **`.env`** with the runtime variables (File Manager). The workflow never overwrites it.
4. cPanel → **SSH Access → Manage SSH Keys → Generate a new key** (no passphrase), **Authorize** it, and copy the **private key**.
5. cPanel → **Cron Jobs**, every minute (keeps broadcasts/webhooks moving when the app sleeps):
   `curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/cron/campaigns > /dev/null`
   and add `CRON_SECRET=YOUR_CRON_SECRET` to the app's `.env`.

GitHub secrets (use the `GODADDY_` or `HOSTGATOR_` prefix):

| Secret | Example |
|---|---|
| `GODADDY_SSH_HOST` | `zkwaconnect.in` or the server IP |
| `GODADDY_SSH_USER` | cPanel username |
| `GODADDY_SSH_KEY` | the private key (whole text, including BEGIN/END lines) |
| `GODADDY_SSH_PORT` | `22` (GoDaddy/HostGator sometimes use `2222`) |
| `GODADDY_APP_DIR` | `/home/USER/zkwaconnect` (application root) |
| `GODADDY_NODE_ENV_ACTIVATE` | `/home/USER/nodevenv/zkwaconnect/20/bin/activate` |

Variable: `GODADDY_APP_URL` (e.g. `https://app.zkwaconnect.in`). Same names with `HOSTGATOR_` for HostGator.

Each deploy uploads the build, runs `npm install --omit=dev` inside the app's Node environment, and restarts the app (`tmp/restart.txt`). `.env`, `storage/` and `node_modules` on the server are kept.

## After the first deploy

- Admin → **Meta app setup → Register webhook** (uses `APP_URL`), and set the same URL in your Meta app.
- Open **Admin → 🚀 Go-live checklist** and fix every ❌; see [GO_LIVE.md](GO_LIVE.md) for Meta approval, email, storage and security.
- In production the seed skips the demo account and creates the super admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (or prints a random password). Turn on two-factor sign-in for it.
- `npm run db:push` (local helper) uses `--accept-data-loss`; never point it at production — the workflow uses the safe `prisma db push`.
