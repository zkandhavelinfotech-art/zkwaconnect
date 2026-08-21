@echo off
setlocal EnableDelayedExpansion
title ZKWAConnect v3.2.0

REM Read DATABASE_URL from .env
set "DB_NAME=zkwaconnect"
set "DB_HOST=localhost"
set "DB_USER=zkwa"
set "APP_ENV=development"

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="NODE_ENV"    set "APP_ENV=%%B"
    if "%%A"=="DATABASE_URL" set "DATABASE_URL=%%B"
    if "%%A"=="DB_NAME"     set "DB_NAME=%%B"
    if "%%A"=="DB_HOST"     set "DB_HOST=%%B"
    if "%%A"=="DB_USER"     set "DB_USER=%%B"
  )
)

:MENU
cls
echo.
echo  ============================================================
echo   ZKWAConnect v3.2.0 - Master Script
echo   ZKandhavel Infotech Pvt. Ltd.
echo  ============================================================
echo.
echo   Env : !APP_ENV!
echo   DB  : !DB_NAME! on !DB_HOST! (from .env)
echo.
echo   [1] Fresh Install    - First time setup
echo   [2] Start Dev        - Start API + Frontend
echo   [3] Reset Data       - Wipe rows, reload demo data
echo   [4] Full Uninstall   - Delete everything
echo   [5] DB Tools         - Generate, Migrate, Seed, Studio
echo   [6] Health Check     - Verify all services
echo   [7] Switch Env       - dev / staging / production
echo   [8] Run Tests        - Vitest unit tests
echo   [9] Exit
   [12] Deploy Staging — Neon + Railway + Vercel (full auto)
echo.
set /p CHOICE=  Enter choice [1-9]: 

if "%CHOICE%"=="1" goto INSTALL
if "%CHOICE%"=="2" goto START_DEV
if "%CHOICE%"=="3" goto RESET_DATA
if "%CHOICE%"=="4" goto UNINSTALL
if "%CHOICE%"=="5" goto DB_TOOLS
if "%CHOICE%"=="6" goto HEALTH_CHECK
if "%CHOICE%"=="7" goto SWITCH_ENV
if "%CHOICE%"=="8" goto RUN_TESTS
if "%CHOICE%"=="9" goto EXIT
if "%CHOICE%"=="12" goto DEPLOY_EVERYTHING
echo   Invalid. Try again. & timeout /t 2 >nul & goto MENU

:INSTALL
cls & echo. & echo  [1] Fresh Install & echo.
if not exist "packages\db\prisma\schema.prisma" ( echo  [ERROR] Run from project root. & pause & goto MENU )
if not exist ".env" (
  if exist ".env.example" ( copy ".env.example" ".env" >nul & echo  [OK] .env created from .env.example & echo  Edit .env then press any key... & notepad .env & pause )
  else ( echo  [ERROR] .env.example not found. & pause & goto MENU )
)
echo  [OK] .env found (all DB settings read from here)
echo. & echo  [1/5] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 ( echo  [ERROR] Start Docker Desktop first. & pause & goto MENU )
echo  [OK] Docker running
echo. & echo  [2/5] Starting PostgreSQL + Redis...
docker compose -f docker\docker-compose.yml up -d postgres redis
if errorlevel 1 ( echo  [ERROR] docker compose failed. & pause & goto MENU )
echo  [OK] Waiting 8 seconds...
timeout /t 8 /nobreak >nul
echo. & echo  [3/5] Installing dependencies...
call pnpm install
if errorlevel 1 ( call pnpm install --force )
echo. & echo  [4/5] Generating Prisma client...
cd packages\db & call npx prisma generate
if errorlevel 1 ( echo  [ERROR] prisma generate failed. & cd ..\.. & pause & goto MENU )
echo  [OK] Prisma client generated
echo. & echo  [5/5] Creating tables + loading demo data...
call npx prisma migrate reset --force >nul 2>&1
call npx prisma migrate dev --name init_v32
if errorlevel 1 ( echo  [ERROR] Migration failed. Check DATABASE_URL in .env & cd ..\.. & pause & goto MENU )
call npx ts-node prisma\seed.ts
if errorlevel 1 ( echo  [WARN] Seed failed. Use option 5-C to retry. ) else ( echo  [OK] Demo data: demo@zkwaconnect.in / demo1234 )
cd ..\..
echo. & echo  ======================================================
echo   INSTALL COMPLETE. Run option [2] to start the app.
echo  ====================================================== & echo. & pause & goto MENU

:START_DEV
cls & echo. & echo  [2] Start Dev Servers & echo.
docker compose -f docker\docker-compose.yml up -d postgres redis >nul 2>&1
echo  [OK] Database containers started
echo  Opening API window (port 4000)...
start "ZKWAConnect API [!APP_ENV!]" cmd /k "cd /d %CD%\apps\api && echo Starting API... && pnpm dev"
timeout /t 3 /nobreak >nul
echo  Opening Web window (port 3000)...
start "ZKWAConnect Web [!APP_ENV!]" cmd /k "cd /d %CD%\apps\web && echo Starting Web... && pnpm dev"
echo. & echo  Wait for both windows to show Ready.
echo  Then open: http://localhost:3000/auth/login
echo  Login: demo@zkwaconnect.in / demo1234
echo. & set /p W=Open campaign worker too? (Y/N): 
if /I "%W%"=="Y" start "ZKWAConnect Worker" cmd /k "cd /d %CD%\apps\api && pnpm worker"
echo. & pause & goto MENU

:RESET_DATA
cls & echo. & echo  [3] Reset Data & echo.
set /p C=Type YES to wipe all data and reload demo: 
if /I not "%C%"=="YES" ( echo  Cancelled. & pause & goto MENU )
cd packages\db
call npx prisma migrate reset --force --skip-seed
call npx prisma migrate dev --name init_v32
call npx ts-node prisma\seed.ts
cd ..\.. & echo. & echo  Done. Login: demo@zkwaconnect.in / demo1234 & pause & goto MENU

:UNINSTALL
cls & echo. & echo  [4] Full Uninstall & echo.
set /p C=Type UNINSTALL to confirm: 
if /I not "%C%"=="UNINSTALL" ( echo  Cancelled. & pause & goto MENU )
taskkill /F /IM node.exe >nul 2>&1
docker compose -f docker\docker-compose.yml down -v >nul 2>&1
cd packages\db & call npx prisma migrate reset --force >nul 2>&1 & cd ..\..
if exist "node_modules"                rmdir /S /Q "node_modules"
if exist "apps\api\node_modules"     rmdir /S /Q "apps\api\node_modules"
if exist "apps\api\dist"             rmdir /S /Q "apps\api\dist"
if exist "apps\web\node_modules"     rmdir /S /Q "apps\web\node_modules"
if exist "apps\web\.next"            rmdir /S /Q "apps\web\.next"
if exist "packages\db\node_modules"  rmdir /S /Q "packages\db\node_modules"
if exist "packages\types\node_modules" rmdir /S /Q "packages\types\node_modules"
if exist "pnpm-lock.yaml" del /F /Q "pnpm-lock.yaml"
set /p D=Also delete .env? (Y/N): 
if /I "%D%"=="Y" if exist ".env" del /F /Q ".env"
echo. & echo  Uninstall complete. Run option [1] to reinstall. & pause & goto MENU

:DB_TOOLS
cls & echo. & echo  [5] DB Tools & echo.
echo   [A] Generate Prisma client
echo   [B] Run migrations
echo   [C] Seed demo data
echo   [D] Prisma Studio (http://localhost:5555)
echo   [E] Drop all via db-reset.sql
echo   [F] Back
echo. & set /p T=Choice [A-F]: 
if /I "%T%"=="A" ( cd packages\db & call npx prisma generate & cd ..\.. )
if /I "%T%"=="B" ( cd packages\db & call npx prisma migrate dev --name update_v32 & cd ..\.. )
if /I "%T%"=="C" ( cd packages\db & call npx ts-node prisma\seed.ts & cd ..\.. & echo  Login: demo@zkwaconnect.in / demo1234 )
if /I "%T%"=="D" ( cd packages\db & call npx prisma studio & cd ..\.. )
if /I "%T%"=="E" ( docker exec -i zkwa_postgres_development psql -U !DB_USER! -d !DB_NAME! < db-reset.sql & echo  Now run option B to recreate tables. )
if /I "%T%"=="F" goto MENU
pause & goto DB_TOOLS

:HEALTH_CHECK
cls & echo. & echo  [6] Health Check & echo.
echo  Docker containers:
docker ps --format "  {{.Names}}  {{.Status}}  {{.Ports}}" 2>nul
echo. & echo  PostgreSQL:
docker exec zkwa_postgres_development pg_isready -U !DB_USER! >nul 2>&1
if errorlevel 1 (echo  [FAIL] Not ready) else (echo  [OK] Ready)
echo. & echo  Redis:
docker exec zkwa_redis_development redis-cli ping >nul 2>&1
if errorlevel 1 (echo  [FAIL]) else (echo  [OK] Responding)
echo. & echo  API (http://localhost:4000/health):
curl -s --max-time 3 http://localhost:4000/health 2>nul
if errorlevel 1 (echo  [FAIL] Not running - start with option [2]) else (echo. & echo  [OK] Running)
echo. & echo  Web (http://localhost:3000):
curl -s -o nul -w "  HTTP %%{http_code}" --max-time 3 http://localhost:3000 2>nul
if errorlevel 1 (echo  [FAIL] Not running) else (echo. & echo  [OK] Running)
echo. & echo  Open: http://localhost:3000/auth/login
echo  Login: demo@zkwaconnect.in / demo1234 & echo. & pause & goto MENU

:SWITCH_ENV
cls & echo. & echo  [7] Switch Environment & echo.
echo   [D] development  - Docker postgres+redis, pnpm dev
echo   [S] staging      - Neon DB + Railway + Vercel
echo   [P] production   - Neon DB + Railway + Vercel (live)
echo   [B] Back
echo. & set /p E=Choice [D/S/P/B]: 
if /I "%E%"=="D" ( if exist ".env.development" ( copy ".env.development" ".env" >nul ) else ( if exist ".env.example" copy ".env.example" ".env" >nul ) & set "APP_ENV=development" & echo  [OK] Switched to development )
if /I "%E%"=="S" ( if exist ".env.staging" ( copy ".env.staging" ".env" >nul & set "APP_ENV=staging" & echo  [OK] Switched to staging ) else ( echo  [ERROR] .env.staging not found ) )
if /I "%E%"=="P" ( if exist ".env.production" ( set /p C=Type PRODUCTION to confirm: & if /I "!C!"=="PRODUCTION" ( copy ".env.production" ".env" >nul & set "APP_ENV=production" & echo  [OK] Switched to production ) else echo  Cancelled. ) else ( echo  [ERROR] .env.production not found ) )
if /I "%E%"=="B" goto MENU
pause & goto MENU

:RUN_TESTS
cls & echo. & echo  [8] Run Tests & echo.
echo  Running Vitest unit tests...
call pnpm test
echo. & echo  Tests complete. & pause & goto MENU


:DEPLOY_EVERYTHING
cls & echo. & echo  [12] Deploy Staging — Full Auto Deploy & echo.
if not exist ".env.staging" (
  echo  [ERROR] .env.staging not found.
  echo  Run staging-setup.bat first to create it.
  pause & goto MENU
)
echo  Loading .env.staging...
for /f "usebackq tokens=1,* delims==" %%A in (".env.staging") do (
  set "%%A=%%B"
)
if "!DATABASE_URL!"=="" ( echo  [ERROR] DATABASE_URL missing in .env.staging & pause & goto MENU )
if "!RAILWAY_TOKEN!"=="" ( echo  [ERROR] RAILWAY_TOKEN missing in .env.staging & pause & goto MENU )
if "!VERCEL_TOKEN!"=="" ( echo  [ERROR] VERCEL_TOKEN missing in .env.staging & pause & goto MENU )

echo  [OK] .env.staging loaded.
echo.
echo  What will run:
echo    1. pnpm install
echo    2. Prisma generate
echo    3. Prisma migrate deploy (Neon)
echo    4. Build API
echo    5. Build Web
echo    6. Deploy API to Railway
echo    7. Deploy Worker to Railway
echo    8. Deploy Web to Vercel
echo.
set /p C=  Start deployment? (Y/N): 
if /I not "!C!"=="Y" goto MENU

echo. & echo  [1/8] Installing dependencies...
call pnpm install
if errorlevel 1 ( echo  [ERROR] pnpm install failed & pause & goto MENU )
echo  [OK] Dependencies installed.

echo. & echo  [2/8] Generating Prisma client...
cd packages\db
call npx prisma generate
if errorlevel 1 ( echo  [ERROR] prisma generate failed & cd ..\.. & pause & goto MENU )
echo  [OK] Prisma client generated.

echo. & echo  [3/8] Running Prisma migrations on Neon...
call npx prisma migrate deploy
if errorlevel 1 ( echo  [ERROR] migrate deploy failed. Check DATABASE_URL in .env.staging & cd ..\.. & pause & goto MENU )
echo  [OK] Neon database migrated.
cd ..\..

echo. & echo  [4/8] Building API...
cd apps\api & call pnpm build
if errorlevel 1 ( echo  [ERROR] API build failed & cd ..\.. & pause & goto MENU )
cd ..\.. & echo  [OK] API built.

echo. & echo  [5/8] Building Web...
cd apps\web & call pnpm build
if errorlevel 1 ( echo  [ERROR] Web build failed & cd ..\.. & pause & goto MENU )
cd ..\.. & echo  [OK] Web built.

echo. & echo  Checking CLI tools...
railway --version >nul 2>&1
if errorlevel 1 ( call npm install -g @railway/cli )
vercel --version >nul 2>&1
if errorlevel 1 ( call npm install -g vercel )

echo. & echo  [6/8] Deploying API to Railway...
set "RAILWAY_TOKEN=!RAILWAY_TOKEN!"
call railway up --service !RAILWAY_API_SERVICE_ID! --detach
if errorlevel 1 ( echo  [WARN] Railway API deploy issue - check dashboard ) else ( echo  [OK] API deployed. )

echo. & echo  [7/8] Deploying Worker to Railway...
call railway up --service !RAILWAY_WORKER_SERVICE_ID! --detach
if errorlevel 1 ( echo  [WARN] Railway Worker deploy issue - continuing... ) else ( echo  [OK] Worker deployed. )

echo. & echo  [8/8] Deploying Web to Vercel...
cd apps\web
call vercel deploy ^
  --token !VERCEL_TOKEN! ^
  --env NEXT_PUBLIC_API_URL="!NEXT_PUBLIC_API_URL!" ^
  --env NODE_ENV="production" ^
  --build-env NEXT_PUBLIC_API_URL="!NEXT_PUBLIC_API_URL!" ^
  --scope !VERCEL_ORG_ID!
if errorlevel 1 ( echo  [ERROR] Vercel deploy failed & cd ..\.. & pause & goto MENU )
cd ..\..
echo  [OK] Web deployed to Vercel.

echo.
echo  ======================================================
echo   STAGING DEPLOYMENT COMPLETE
echo  ======================================================
echo.
echo   Web : !FRONTEND_URL!
echo   Login: demo@zkwaconnect.in / demo1234
echo.
echo   Next: Set Meta webhook URL in developers.facebook.com
echo.
pause & goto MENU

:EXIT
echo. & echo  ZKWAConnect v3.2.0 & echo. & exit /b 0
