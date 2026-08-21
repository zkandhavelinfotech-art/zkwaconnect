@echo off
setlocal EnableDelayedExpansion
title ZKWAConnect Staging Setup Wizard

cls
echo.
echo  ============================================================
echo   ZKWAConnect Staging Setup Wizard
echo   ZKandhavel Infotech Pvt. Ltd.
echo  ============================================================
echo.
echo   This wizard will walk you through the 3 steps needed to
echo   deploy ZKWAConnect to staging:
echo.
echo   Step 1 - Neon PostgreSQL database
echo   Step 2 - Railway API + Worker services
echo   Step 3 - Vercel Web deployment
echo.
echo   You will need accounts at:
echo     https://console.neon.tech
echo     https://railway.app
echo     https://vercel.com
echo.
echo   Takes approx 45 minutes on first setup.
echo.
pause

REM ─────────────────────────────────────────────────────────────
REM STEP 1: NEON DATABASE
REM ─────────────────────────────────────────────────────────────
:STEP1
cls
echo.
echo  ============================================================
echo   STEP 1 of 3 — Neon PostgreSQL Database
echo  ============================================================
echo.
echo   1. Open: https://console.neon.tech
echo   2. Click "New Project"
echo   3. Name it: zkwaconnect-staging
echo   4. Region: aws-ap-southeast-1 (closest to India)
echo   5. Click "Create project"
echo   6. Go to Connection Details tab
echo   7. Copy the connection string. It looks like:
echo.
echo      postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require
echo.
echo   IMPORTANT: Make sure you copy the full URL including ?sslmode=require
echo.
start https://console.neon.tech
echo.
set /p NEON_URL=  Paste your Neon DATABASE_URL here: 

if "!NEON_URL!"=="" (
  echo   [ERROR] DATABASE_URL cannot be empty. Try again.
  pause
  goto STEP1
)
if not "!NEON_URL:neon.tech=!"=="!NEON_URL!" (
  echo   [OK] Neon URL looks valid.
) else (
  echo   [WARN] URL doesn't contain neon.tech - please double-check.
  set /p C=  Continue anyway? (Y/N): 
  if /I not "!C!"=="Y" goto STEP1
)
if not "!NEON_URL:sslmode=!"=="!NEON_URL!" (
  echo   [OK] sslmode=require is present.
) else (
  echo   [WARN] sslmode=require not found in URL. Adding it...
  set "NEON_URL=!NEON_URL!?sslmode=require"
)

echo.
echo   [OK] Neon DATABASE_URL saved.
pause

REM ─────────────────────────────────────────────────────────────
REM STEP 2: RAILWAY
REM ─────────────────────────────────────────────────────────────
:STEP2
cls
echo.
echo  ============================================================
echo   STEP 2 of 3 — Railway (API + Worker)
echo  ============================================================
echo.
echo   PART A — Get your Railway Token
echo.
echo   1. Open: https://railway.app
echo   2. Log in and go to Account Settings (top-right avatar)
echo   3. Click "Tokens"
echo   4. Click "New Token", name it "zkwa-staging-deploy"
echo   5. Copy the token
echo.
start https://railway.app/account/tokens
echo.
set /p RAILWAY_TOKEN=  Paste your Railway Token here: 
if "!RAILWAY_TOKEN!"=="" (
  echo   [ERROR] Token cannot be empty.
  pause
  goto STEP2
)
echo.
echo   [OK] Railway token saved.
echo.
echo   PART B — Create Railway Project
echo.
echo   1. Go to: https://railway.app/new
echo   2. Click "Empty Project"
echo   3. Name it: zkwaconnect-staging
echo   4. Click on the project, go to Settings
echo   5. Copy the Project ID (looks like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
echo.
start https://railway.app/new
echo.
set /p RAILWAY_PROJECT_ID=  Paste your Railway Project ID: 
if "!RAILWAY_PROJECT_ID!"=="" (
  echo   [ERROR] Project ID cannot be empty.
  pause
  goto STEP2
)
echo.
echo   PART C — Add API Service
echo.
echo   1. In your Railway project, click "+ New" → "Empty Service"
echo   2. Name it: api
echo   3. Click the service → Settings → General
echo   4. Copy the Service ID
echo.
set /p RAILWAY_API_SERVICE_ID=  Paste your Railway API Service ID: 
echo.
echo   PART D — Add Worker Service
echo.
echo   1. In your Railway project, click "+ New" → "Empty Service"
echo   2. Name it: worker
echo   3. Click the service → Settings → General
echo   4. Copy the Service ID
echo.
set /p RAILWAY_WORKER_SERVICE_ID=  Paste your Railway Worker Service ID: 
echo.
echo   [OK] Railway configuration saved.
pause

REM ─────────────────────────────────────────────────────────────
REM STEP 3: VERCEL
REM ─────────────────────────────────────────────────────────────
:STEP3
cls
echo.
echo  ============================================================
echo   STEP 3 of 3 — Vercel (Next.js Web)
echo  ============================================================
echo.
echo   PART A — Get Vercel Token
echo.
echo   1. Open: https://vercel.com/account/tokens
echo   2. Click "Create"
echo   3. Name it: zkwa-staging-deploy
echo   4. Set expiry: No expiration
echo   5. Copy the token
echo.
start https://vercel.com/account/tokens
echo.
set /p VERCEL_TOKEN=  Paste your Vercel Token: 
echo.
echo   PART B — Create Vercel Project
echo.
echo   1. Open: https://vercel.com/new
echo   2. Import your GitHub repository
echo   3. Set Root Directory to: apps/web
echo   4. Framework: Next.js (auto-detected)
echo   5. Click Deploy
echo   6. After deploy, go to Project Settings
echo   7. Copy your Team/Org ID and Project ID
echo.
start https://vercel.com/new
echo.
set /p VERCEL_ORG_ID=  Paste your Vercel Org/Team ID: 
set /p VERCEL_PROJECT_ID=  Paste your Vercel Project ID: 
set /p VERCEL_PROJECT_NAME=  Vercel Project Name (e.g. zkwaconnect-staging): 
if "!VERCEL_PROJECT_NAME!"=="" set "VERCEL_PROJECT_NAME=zkwaconnect-staging"
echo.
echo   [OK] Vercel configuration saved.
pause

REM ─────────────────────────────────────────────────────────────
REM JWT SECRET + OTHER REQUIRED VARS
REM ─────────────────────────────────────────────────────────────
:SECRETS
cls
echo.
echo  ============================================================
echo   Additional Configuration
echo  ============================================================
echo.
echo   We need a few more values for your .env.staging file.
echo.
echo   JWT_SECRET: A random string (min 32 chars). 
echo   Press Enter to auto-generate one, or paste your own:
set /p JWT_SECRET=  JWT_SECRET: 
if "!JWT_SECRET!"=="" (
  REM Generate a pseudo-random secret from timestamp + random
  set "JWT_SECRET=zkwa-staging-%RANDOM%%RANDOM%%RANDOM%-secret-key-minimum-32-chars"
  echo   [OK] Auto-generated: !JWT_SECRET:~0,20!...
)
echo.
set /p META_APP_ID=  META_APP_ID (from developers.facebook.com, or press Enter to skip): 
set /p META_APP_SECRET=  META_APP_SECRET (or press Enter to skip): 
set /p META_VERIFY_TOKEN=  META_VERIFY_TOKEN (your custom webhook verify string, e.g. zkwa_staging_2025): 
if "!META_VERIFY_TOKEN!"=="" set "META_VERIFY_TOKEN=zkwa_staging_verify_token"

set /p TWILIO_SID=  TWILIO_ACCOUNT_SID (or press Enter to skip): 
set /p TWILIO_TOKEN=  TWILIO_AUTH_TOKEN (or press Enter to skip): 
set /p TWILIO_PHONE=  TWILIO_PHONE_NUMBER (e.g. +14155552671, or press Enter to skip): 

set /p RAZORPAY_KEY=  RAZORPAY_KEY_ID (TEST key, starts with rzp_test_): 
set /p RAZORPAY_SECRET=  RAZORPAY_KEY_SECRET: 
set /p RAZORPAY_WEBHOOK=  RAZORPAY_WEBHOOK_SECRET: 

set /p RESEND_KEY=  RESEND_API_KEY (re_xxxx, or press Enter to skip): 

REM ─────────────────────────────────────────────────────────────
REM WRITE .env.staging
REM ─────────────────────────────────────────────────────────────
cls
echo.
echo  Writing .env.staging...
echo.

set "STAGING_API_URL=https://!VERCEL_PROJECT_NAME!.vercel.app/api/v1"

(
echo # ZKWAConnect Staging Environment
echo # Generated by staging-setup.bat
echo # DO NOT COMMIT THIS FILE
echo.
echo APP_ENV=staging
echo NODE_ENV=production
echo.
echo # Neon Database
echo DATABASE_URL=!NEON_URL!
echo DB_HOST=
echo DB_PORT=5432
echo DB_USER=
echo DB_PASSWORD=
echo DB_NAME=
echo.
echo # Redis (Railway provides Redis if added as a service)
echo REDIS_URL=redis://localhost:6379
echo REDIS_HOST=localhost
echo REDIS_PORT=6379
echo.
echo # Application
echo PORT=4000
echo API_PORT=4000
echo WEB_PORT=3000
echo FRONTEND_URL=https://!VERCEL_PROJECT_NAME!.vercel.app
echo NEXT_PUBLIC_API_URL=!STAGING_API_URL!
echo.
echo # Auth
echo JWT_SECRET=!JWT_SECRET!
echo.
echo # Meta / WhatsApp
echo META_APP_ID=!META_APP_ID!
echo META_APP_SECRET=!META_APP_SECRET!
echo META_VERIFY_TOKEN=!META_VERIFY_TOKEN!
echo.
echo # Twilio
echo TWILIO_ACCOUNT_SID=!TWILIO_SID!
echo TWILIO_AUTH_TOKEN=!TWILIO_TOKEN!
echo TWILIO_PHONE_NUMBER=!TWILIO_PHONE!
echo.
echo # Razorpay (TEST keys for staging)
echo RAZORPAY_KEY_ID=!RAZORPAY_KEY!
echo RAZORPAY_KEY_SECRET=!RAZORPAY_SECRET!
echo RAZORPAY_WEBHOOK_SECRET=!RAZORPAY_WEBHOOK!
echo.
echo # AWS S3
echo AWS_ACCESS_KEY_ID=
echo AWS_SECRET_ACCESS_KEY=
echo AWS_REGION=ap-south-1
echo AWS_S3_BUCKET=zkwaconnect-staging-invoices
echo.
echo # Email
echo RESEND_API_KEY=!RESEND_KEY!
echo.
echo # GST
echo OUR_GSTIN=33AABCZ1234A1Z5
echo OUR_STATE=Tamil Nadu
echo COMPANY_NAME=ZKandhavel Infotech Pvt. Ltd.
echo.
echo # Logging
echo LOG_LEVEL=info
echo.
echo # Railway
echo RAILWAY_TOKEN=!RAILWAY_TOKEN!
echo RAILWAY_PROJECT_ID=!RAILWAY_PROJECT_ID!
echo RAILWAY_API_SERVICE_ID=!RAILWAY_API_SERVICE_ID!
echo RAILWAY_WORKER_SERVICE_ID=!RAILWAY_WORKER_SERVICE_ID!
echo.
echo # Vercel
echo VERCEL_TOKEN=!VERCEL_TOKEN!
echo VERCEL_ORG_ID=!VERCEL_ORG_ID!
echo VERCEL_PROJECT_ID=!VERCEL_PROJECT_ID!
echo VERCEL_PROJECT_NAME=!VERCEL_PROJECT_NAME!
echo NEXT_PUBLIC_RAZORPAY_KEY_ID=!RAZORPAY_KEY!
) > .env.staging

echo   [OK] .env.staging written.
echo.

REM ─────────────────────────────────────────────────────────────
REM INSTALL CLI TOOLS
REM ─────────────────────────────────────────────────────────────
echo  Checking CLI tools...
railway --version >nul 2>&1
if errorlevel 1 (
  echo  [INSTALL] Installing Railway CLI...
  call npm install -g @railway/cli
) else (
  echo  [OK] Railway CLI found.
)

vercel --version >nul 2>&1
if errorlevel 1 (
  echo  [INSTALL] Installing Vercel CLI...
  call npm install -g vercel
) else (
  echo  [OK] Vercel CLI found.
)
echo.

REM ─────────────────────────────────────────────────────────────
REM DEPLOY
REM ─────────────────────────────────────────────────────────────
cls
echo.
echo  ============================================================
echo   All configuration complete!
echo   Ready to deploy to staging.
echo  ============================================================
echo.
echo   What will happen when you click Deploy:
echo.
echo   1. Install pnpm dependencies
echo   2. Generate Prisma client
echo   3. Build API and Web
echo   4. Run Prisma migrate deploy on Neon
echo   5. Push Railway env vars for API + Worker
echo   6. Deploy API to Railway
echo   7. Deploy Worker to Railway
echo   8. Push Vercel env vars
echo   9. Deploy Web to Vercel
echo.
echo   Estimated time: 5-10 minutes
echo.
set /p DEPLOY=  Deploy to staging now? (Y/N): 
if /I not "!DEPLOY!"=="Y" (
  echo.
  echo   Skipped. Run zkwa.bat → Option 12 → Deploy Everything when ready.
  echo   Your .env.staging has been saved.
  pause
  exit /b 0
)

echo.
echo  ============================================================
echo   Deploying to Staging...
echo  ============================================================
echo.

REM Set env from .env.staging
for /f "usebackq tokens=1,* delims==" %%A in (".env.staging") do (
  set "%%A=%%B"
)

echo  [1/9] Installing dependencies...
call pnpm install
if errorlevel 1 ( echo  [ERROR] pnpm install failed & pause & exit /b 1 )

echo  [2/9] Generating Prisma client...
cd packages\db
call npx prisma generate
if errorlevel 1 ( echo  [ERROR] prisma generate failed & cd ..\.. & pause & exit /b 1 )

echo  [3/9] Running Prisma migrations on Neon...
call npx prisma migrate deploy
if errorlevel 1 ( echo  [ERROR] Prisma migrate deploy failed. Check DATABASE_URL in .env.staging & cd ..\.. & pause & exit /b 1 )
echo   [OK] Neon database migrated.
cd ..\..

echo  [4/9] Building API...
cd apps\api
call pnpm build
if errorlevel 1 ( echo  [ERROR] API build failed & cd ..\.. & pause & exit /b 1 )
cd ..\..

echo  [5/9] Building Web...
cd apps\web
call pnpm build
if errorlevel 1 ( echo  [ERROR] Web build failed & cd ..\.. & pause & exit /b 1 )
cd ..\..

echo  [6/9] Pushing env vars to Railway API service...
set "RAILWAY_TOKEN=!RAILWAY_TOKEN!"
call railway variables set --service !RAILWAY_API_SERVICE_ID! ^
  DATABASE_URL="!NEON_URL!" ^
  NODE_ENV="production" ^
  PORT="4000" ^
  JWT_SECRET="!JWT_SECRET!" ^
  REDIS_URL="!REDIS_URL!" ^
  FRONTEND_URL="!FRONTEND_URL!" ^
  META_APP_ID="!META_APP_ID!" ^
  META_APP_SECRET="!META_APP_SECRET!" ^
  META_VERIFY_TOKEN="!META_VERIFY_TOKEN!" ^
  LOG_LEVEL="info"

echo  [7/9] Deploying API to Railway...
call railway up --service !RAILWAY_API_SERVICE_ID! --detach
if errorlevel 1 ( echo  [ERROR] Railway API deploy failed & pause & exit /b 1 )
echo   [OK] API deployed to Railway.

echo  [8/9] Deploying Worker to Railway...
call railway up --service !RAILWAY_WORKER_SERVICE_ID! --detach
if errorlevel 1 ( echo  [WARN] Worker deploy failed - continuing... )
echo   [OK] Worker deployed to Railway.

echo  [9/9] Deploying Web to Vercel (staging preview)...
cd apps\web
call vercel deploy ^
  --token !VERCEL_TOKEN! ^
  --env NEXT_PUBLIC_API_URL="!STAGING_API_URL!" ^
  --env NODE_ENV="production" ^
  --build-env NEXT_PUBLIC_API_URL="!STAGING_API_URL!" ^
  --scope !VERCEL_ORG_ID!
if errorlevel 1 ( echo  [ERROR] Vercel deploy failed & cd ..\.. & pause & exit /b 1 )
cd ..\..

echo.
echo  ============================================================
echo   STAGING DEPLOYMENT COMPLETE
echo  ============================================================
echo.
echo   Web:     https://!VERCEL_PROJECT_NAME!.vercel.app
echo   API:     Check Railway dashboard for URL
echo   Webhook: [Railway API URL]/webhook/meta
echo.
echo   Next steps:
echo   1. Set Meta webhook URL to your Railway API URL + /webhook/meta
echo   2. Configure Razorpay webhook URL in dashboard
echo   3. Test login at: https://!VERCEL_PROJECT_NAME!.vercel.app/auth/login
echo   4. Run option [6] Health Check in zkwa.bat to verify
echo.
pause
