#Requires -Version 5.1
<#
.SYNOPSIS
    ZKWAConnect Staging Setup Wizard — PowerShell version
    Walks through Neon + Railway + Vercel setup and deploys automatically.
#>

$ErrorActionPreference = 'Stop'
$PSRoot = Split-Path $PSScriptRoot -Parent

function Open-Url { param([string]$Url); Start-Process $Url }
function Read-Val {
    param([string]$Prompt, [string]$Default='', [bool]$Required=$false)
    while ($true) {
        if ($Default) { $v = Read-Host "$Prompt [$Default]" } else { $v = Read-Host $Prompt }
        if ([string]::IsNullOrWhiteSpace($v)) { $v = $Default }
        if ($Required -and [string]::IsNullOrWhiteSpace($v)) {
            Write-Host "  This value is required." -ForegroundColor Yellow
            continue
        }
        return $v.Trim()
    }
}

function Show-Step { param([string]$Step, [string]$Title)
    Clear-Host
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host "   $Step — $Title" -ForegroundColor White
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host ""
}

# ── Welcome ───────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "   ZKWAConnect Staging Setup Wizard" -ForegroundColor White
Write-Host "   ZKandhavel Infotech Pvt. Ltd." -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  This wizard configures and deploys ZKWAConnect to staging:" -ForegroundColor Gray
Write-Host "    Step 1 — Neon PostgreSQL (cloud database)" -ForegroundColor Gray
Write-Host "    Step 2 — Railway (API + Worker services)" -ForegroundColor Gray
Write-Host "    Step 3 — Vercel (Next.js Web)" -ForegroundColor Gray
Write-Host "    Step 4 — Auto-deploy everything" -ForegroundColor Gray
Write-Host ""
Write-Host "  Time required: ~45 minutes on first setup" -ForegroundColor Gray
Write-Host ""
Read-Host "  Press Enter to begin"

# ── STEP 1: NEON ──────────────────────────────────────────────
Show-Step "STEP 1 of 4" "Neon PostgreSQL Database"
Write-Host "  1. Open: https://console.neon.tech" -ForegroundColor Gray
Write-Host "  2. Click 'New Project'" -ForegroundColor Gray
Write-Host "  3. Name: zkwaconnect-staging" -ForegroundColor Gray
Write-Host "  4. Region: AWS ap-southeast-1 (Singapore)" -ForegroundColor Gray
Write-Host "  5. Click 'Create project'" -ForegroundColor Gray
Write-Host "  6. Go to Connection Details tab" -ForegroundColor Gray
Write-Host "  7. Copy the full connection string (includes ?sslmode=require)" -ForegroundColor Gray
Write-Host ""
Open-Url "https://console.neon.tech"
Write-Host ""

$neonUrl = Read-Val -Prompt "  Paste your Neon DATABASE_URL" -Required $true
if (-not $neonUrl.Contains('neon.tech')) {
    Write-Host "  [WARN] URL doesn't contain neon.tech — please verify." -ForegroundColor Yellow
}
if (-not $neonUrl.Contains('sslmode')) {
    $neonUrl += if ($neonUrl.Contains('?')) { '&sslmode=require' } else { '?sslmode=require' }
    Write-Host "  [OK] Added ?sslmode=require to URL" -ForegroundColor Green
}
Write-Host "  [OK] Neon URL saved." -ForegroundColor Green

# ── STEP 2: RAILWAY ───────────────────────────────────────────
Show-Step "STEP 2 of 4" "Railway API + Worker"
Write-Host "  PART A — Get Railway Token" -ForegroundColor White
Write-Host "  1. Open: https://railway.app/account/tokens" -ForegroundColor Gray
Write-Host "  2. Click 'New Token' → name: zkwa-staging" -ForegroundColor Gray
Write-Host "  3. Copy the token" -ForegroundColor Gray
Write-Host ""
Open-Url "https://railway.app/account/tokens"
$railwayToken = Read-Val -Prompt "  Railway Token" -Required $true

Write-Host ""
Write-Host "  PART B — Create Railway Project" -ForegroundColor White
Write-Host "  1. Open: https://railway.app/new → Empty Project" -ForegroundColor Gray
Write-Host "  2. Name: zkwaconnect-staging" -ForegroundColor Gray
Write-Host "  3. Project Settings → copy Project ID" -ForegroundColor Gray
Write-Host ""
Open-Url "https://railway.app/new"
$railwayProjectId = Read-Val -Prompt "  Railway Project ID" -Required $true

Write-Host ""
Write-Host "  PART C — Add API Service" -ForegroundColor White
Write-Host "  In Railway project: + New → Empty Service → name it 'api'" -ForegroundColor Gray
Write-Host "  Service Settings → copy Service ID" -ForegroundColor Gray
Write-Host ""
$railwayApiId = Read-Val -Prompt "  Railway API Service ID" -Required $true

Write-Host ""
Write-Host "  PART D — Add Worker Service" -ForegroundColor White
Write-Host "  In Railway project: + New → Empty Service → name it 'worker'" -ForegroundColor Gray
Write-Host "  Service Settings → copy Service ID" -ForegroundColor Gray
Write-Host ""
$railwayWorkerId = Read-Val -Prompt "  Railway Worker Service ID" -Required $true
Write-Host "  [OK] Railway configuration saved." -ForegroundColor Green

# ── STEP 3: VERCEL ────────────────────────────────────────────
Show-Step "STEP 3 of 4" "Vercel (Next.js Web)"
Write-Host "  PART A — Get Vercel Token" -ForegroundColor White
Write-Host "  1. Open: https://vercel.com/account/tokens" -ForegroundColor Gray
Write-Host "  2. Create → name: zkwa-staging → No expiration" -ForegroundColor Gray
Write-Host "  3. Copy the token" -ForegroundColor Gray
Write-Host ""
Open-Url "https://vercel.com/account/tokens"
$vercelToken = Read-Val -Prompt "  Vercel Token" -Required $true

Write-Host ""
Write-Host "  PART B — Import GitHub repo to Vercel" -ForegroundColor White
Write-Host "  1. Open: https://vercel.com/new" -ForegroundColor Gray
Write-Host "  2. Import your GitHub repository" -ForegroundColor Gray
Write-Host "  3. Root Directory: apps/web" -ForegroundColor Gray
Write-Host "  4. Framework: Next.js (auto-detected)" -ForegroundColor Gray
Write-Host "  5. Click Deploy" -ForegroundColor Gray
Write-Host "  6. After deploy: Project Settings → copy Team/Org ID + Project ID" -ForegroundColor Gray
Write-Host ""
Open-Url "https://vercel.com/new"
$vercelOrgId     = Read-Val -Prompt "  Vercel Org/Team ID" -Required $true
$vercelProjectId = Read-Val -Prompt "  Vercel Project ID" -Required $true
$vercelProjectName = Read-Val -Prompt "  Vercel Project Name" -Default "zkwaconnect-staging"
Write-Host "  [OK] Vercel configuration saved." -ForegroundColor Green

# ── OTHER CONFIG ──────────────────────────────────────────────
Show-Step "STEP 4 of 4" "Secrets + Deploy"
Write-Host "  A few more values:" -ForegroundColor Gray
Write-Host ""
$jwtSecret = Read-Val -Prompt "  JWT_SECRET (min 32 chars, or press Enter to auto-generate)" -Default ""
if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
    $jwtSecret = "zkwa-staging-$(Get-Random)-$(Get-Random)-secret-minimum-32"
    Write-Host "  [OK] Auto-generated JWT_SECRET" -ForegroundColor Green
}

$metaAppId       = Read-Val -Prompt "  META_APP_ID (from developers.facebook.com, or Enter to skip)" -Default "YOUR_META_APP_ID"
$metaAppSecret   = Read-Val -Prompt "  META_APP_SECRET (or Enter to skip)" -Default "YOUR_META_APP_SECRET"
$metaVerifyToken = Read-Val -Prompt "  META_VERIFY_TOKEN (custom string)" -Default "zkwa_staging_verify_2025"
$twilioSid       = Read-Val -Prompt "  TWILIO_ACCOUNT_SID (or Enter to skip)" -Default ""
$twilioToken     = Read-Val -Prompt "  TWILIO_AUTH_TOKEN (or Enter to skip)" -Default ""
$twilioPhone     = Read-Val -Prompt "  TWILIO_PHONE_NUMBER (or Enter to skip)" -Default ""
$rzpKey          = Read-Val -Prompt "  RAZORPAY_KEY_ID (rzp_test_xxx, or Enter to skip)" -Default ""
$rzpSecret       = Read-Val -Prompt "  RAZORPAY_KEY_SECRET (or Enter to skip)" -Default ""
$rzpWebhook      = Read-Val -Prompt "  RAZORPAY_WEBHOOK_SECRET (or Enter to skip)" -Default ""
$resendKey       = Read-Val -Prompt "  RESEND_API_KEY (re_xxx, or Enter to skip)" -Default ""

$stagingApiUrl  = "https://$vercelProjectName.vercel.app/api/v1"
$frontendUrl    = "https://$vercelProjectName.vercel.app"

# ── WRITE .env.staging ────────────────────────────────────────
$envContent = @"
# ZKWAConnect Staging Environment
# Generated by staging-setup.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# DO NOT COMMIT THIS FILE

APP_ENV=staging
NODE_ENV=production

# Neon Database
DATABASE_URL=$neonUrl

# Redis (add Redis service in Railway if needed)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Application
PORT=4000
API_PORT=4000
WEB_PORT=3000
FRONTEND_URL=$frontendUrl
NEXT_PUBLIC_API_URL=$stagingApiUrl
NEXT_PUBLIC_RAZORPAY_KEY_ID=$rzpKey

# Auth
JWT_SECRET=$jwtSecret

# Meta / WhatsApp
META_APP_ID=$metaAppId
META_APP_SECRET=$metaAppSecret
META_VERIFY_TOKEN=$metaVerifyToken

# Twilio
TWILIO_ACCOUNT_SID=$twilioSid
TWILIO_AUTH_TOKEN=$twilioToken
TWILIO_PHONE_NUMBER=$twilioPhone

# Razorpay (TEST keys for staging)
RAZORPAY_KEY_ID=$rzpKey
RAZORPAY_KEY_SECRET=$rzpSecret
RAZORPAY_WEBHOOK_SECRET=$rzpWebhook

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_S3_BUCKET=zkwaconnect-staging-invoices

# Email
RESEND_API_KEY=$resendKey

# GST
OUR_GSTIN=33AABCZ1234A1Z5
OUR_STATE=Tamil Nadu
COMPANY_NAME=ZKandhavel Infotech Pvt. Ltd.

# Logging
LOG_LEVEL=info

# Railway
RAILWAY_TOKEN=$railwayToken
RAILWAY_PROJECT_ID=$railwayProjectId
RAILWAY_API_SERVICE_ID=$railwayApiId
RAILWAY_WORKER_SERVICE_ID=$railwayWorkerId

# Vercel
VERCEL_TOKEN=$vercelToken
VERCEL_ORG_ID=$vercelOrgId
VERCEL_PROJECT_ID=$vercelProjectId
VERCEL_PROJECT_NAME=$vercelProjectName
"@

$envPath = Join-Path $PSRoot '.env.staging'
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host ""
Write-Host "  [OK] .env.staging written to: $envPath" -ForegroundColor Green

# ── DEPLOY ────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "   Ready to deploy!" -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  The following steps will run automatically:" -ForegroundColor Gray
Write-Host "   1. pnpm install" -ForegroundColor Gray
Write-Host "   2. Prisma generate + migrate deploy (Neon)" -ForegroundColor Gray
Write-Host "   3. Build API + Web" -ForegroundColor Gray
Write-Host "   4. Set Railway env vars" -ForegroundColor Gray
Write-Host "   5. Deploy API + Worker to Railway" -ForegroundColor Gray
Write-Host "   6. Deploy Web to Vercel" -ForegroundColor Gray
Write-Host ""

$doDeploy = Read-Host "  Deploy to staging now? (Y/N)"
if ($doDeploy -ine 'Y') {
    Write-Host ""
    Write-Host "  Skipped. Run zkwa.bat → Option 12 → Deploy Everything when ready." -ForegroundColor Yellow
    Write-Host "  Your .env.staging has been saved at: $envPath" -ForegroundColor Gray
    Read-Host "  Press Enter to exit"
    exit 0
}

# Run via PowerShell Deployment Manager Cloud deploy
$managerScript = Join-Path $PSRoot 'scripts\zkwa.ps1'
if (Test-Path -LiteralPath $managerScript) {
    Write-Host "  Launching Deployment Manager → Cloud Deploy..." -ForegroundColor Cyan
    & $managerScript
} else {
    # Fallback: manual steps
    Push-Location $PSRoot
    try {
        Write-Host "  [1/7] Installing dependencies..." -ForegroundColor Cyan
        & pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

        Write-Host "  [2/7] Generating Prisma client..." -ForegroundColor Cyan
        Push-Location (Join-Path $PSRoot 'packages\db')
        & npx prisma generate
        if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }

        Write-Host "  [3/7] Running migrations on Neon..." -ForegroundColor Cyan
        $env:DATABASE_URL = $neonUrl
        & npx prisma migrate deploy
        if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed. Check DATABASE_URL." }
        Pop-Location

        Write-Host "  [4/7] Building API..." -ForegroundColor Cyan
        Push-Location (Join-Path $PSRoot 'apps\api')
        & pnpm build
        if ($LASTEXITCODE -ne 0) { throw "API build failed" }
        Pop-Location

        Write-Host "  [5/7] Building Web..." -ForegroundColor Cyan
        Push-Location (Join-Path $PSRoot 'apps\web')
        $env:NEXT_PUBLIC_API_URL = $stagingApiUrl
        & pnpm build
        if ($LASTEXITCODE -ne 0) { throw "Web build failed" }
        Pop-Location

        Write-Host "  [6/7] Deploying to Railway..." -ForegroundColor Cyan
        $env:RAILWAY_TOKEN = $railwayToken
        & railway up --service $railwayApiId    --detach
        & railway up --service $railwayWorkerId --detach

        Write-Host "  [7/7] Deploying to Vercel..." -ForegroundColor Cyan
        Push-Location (Join-Path $PSRoot 'apps\web')
        & vercel deploy `
            --token $vercelToken `
            --env "NEXT_PUBLIC_API_URL=$stagingApiUrl" `
            --env "NODE_ENV=production" `
            --build-env "NEXT_PUBLIC_API_URL=$stagingApiUrl" `
            --scope $vercelOrgId
        Pop-Location

    } catch {
        Write-Host "  [ERROR] Deployment failed: $_" -ForegroundColor Red
        Pop-Location
        Read-Host "  Press Enter to exit"
        exit 1
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   STAGING DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Web URL : $frontendUrl" -ForegroundColor Green
Write-Host "   API URL : Check Railway dashboard for URL" -ForegroundColor Green
Write-Host ""
Write-Host "   Next steps:" -ForegroundColor Gray
Write-Host "   1. Copy Railway API URL" -ForegroundColor Gray
Write-Host "   2. Set Meta webhook to: [Railway API URL]/webhook/meta" -ForegroundColor Gray
Write-Host "   3. Test login: $frontendUrl/auth/login" -ForegroundColor Gray
Write-Host "   4. Run zkwa.bat → Health Check to verify all services" -ForegroundColor Gray
Write-Host ""
Read-Host "  Press Enter to exit"
