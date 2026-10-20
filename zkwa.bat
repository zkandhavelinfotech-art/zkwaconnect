@echo off
setlocal enabledelayedexpansion
title ZKWAConnect v4.0.6 — Setup Menu

:MENU
cls
echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║        ZKWAConnect v4.0.6 — Setup Manager            ║
echo  ║        ZKandhavel Infotech Pvt. Ltd.                  ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.
echo   SETUP
echo   [1]  Install dependencies             npm install
echo   [2]  Validate Prisma schema           npx prisma validate
echo   [3]  Format Prisma schema             npx prisma format
echo   [4]  Generate Prisma client           npx prisma generate
echo.
echo   DATABASE
echo   [5]  Migration status                 npx prisma migrate status
echo   [6]  Migrate dev (LOCAL DB only)      npx prisma migrate dev
echo   [15] DB Push (Railway/Neon/GoDaddy)   npx prisma db push  ← USE THIS
echo   [7]  Seed database                    npm run db:seed
echo   [12] Open Prisma Studio               npx prisma studio
echo   [13] Reset database (DANGER)          npx prisma migrate reset
echo.
echo   BUILD & RUN
echo   [8]  TypeScript check                 npm run typecheck
echo   [9]  Build Next.js                    npm run build
echo   [10] Start dev server                 npm run dev
echo   [11] Start production                 npm run start
echo.
echo   FULL SEQUENCES
echo   [20] Fresh Install (recommended)
echo   [21] Full validate + build
echo.
echo   [0]  Exit
echo.
set /p CHOICE=  Enter choice:

if "%CHOICE%"=="1"  goto INSTALL
if "%CHOICE%"=="2"  goto VALIDATE
if "%CHOICE%"=="3"  goto FORMAT
if "%CHOICE%"=="4"  goto GENERATE
if "%CHOICE%"=="5"  goto STATUS
if "%CHOICE%"=="6"  goto MIGRATE
if "%CHOICE%"=="7"  goto SEED
if "%CHOICE%"=="8"  goto TYPECHECK
if "%CHOICE%"=="9"  goto BUILD
if "%CHOICE%"=="10" goto DEV
if "%CHOICE%"=="11" goto START
if "%CHOICE%"=="12" goto STUDIO
if "%CHOICE%"=="13" goto RESET
if "%CHOICE%"=="15" goto DBPUSH
if "%CHOICE%"=="20" goto FRESH
if "%CHOICE%"=="21" goto FULLBUILD
if "%CHOICE%"=="0"  goto EXIT
goto MENU

:INSTALL
cls & echo. & echo  Installing dependencies... & echo.
call npm install
if errorlevel 1 ( echo  [ERROR] npm install failed & pause & goto MENU )
echo. & echo  [OK] Done. & pause & goto MENU

:VALIDATE
cls & echo. & echo  Validating schema... & echo.
call npx prisma validate
if errorlevel 1 ( echo  [ERROR] Schema invalid & pause & goto MENU )
echo. & echo  [OK] Schema is valid. & pause & goto MENU

:FORMAT
cls & echo. & echo  Formatting schema... & echo.
call npx prisma format & echo. & echo  [OK] Done. & pause & goto MENU

:GENERATE
cls & echo. & echo  Generating Prisma client... & echo.
call npx prisma generate
if errorlevel 1 ( echo  [ERROR] Generate failed & pause & goto MENU )
echo. & echo  [OK] Client generated. & pause & goto MENU

:STATUS
cls & echo. & echo  Migration status... & echo.
call npx prisma migrate status & pause & goto MENU

:MIGRATE
cls & echo.
echo  NOTE: migrate dev requires superuser DB access.
echo  For Railway/Neon/GoDaddy use [15] DB Push instead.
echo.
set /p MNAME=  Migration name (e.g. zkwa_v406):
if "!MNAME!"=="" set MNAME=zkwa_v406
call npx prisma migrate dev --name !MNAME!
if errorlevel 1 ( echo  [ERROR] Use [15] DB Push for managed databases & pause & goto MENU )
call npx prisma generate
echo. & echo  [OK] Migration done. & pause & goto MENU

:DBPUSH
cls & echo.
echo  ═══════════════════════════════════════
echo   [15] DB PUSH — Railway / Neon / GoDaddy
echo  ═══════════════════════════════════════
echo.
echo  Pushes schema directly without shadow DB.
echo  Use this for all managed/cloud PostgreSQL.
echo.
set /p C=  Start db push? (Y/N):
if /I not "!C!"=="Y" goto MENU
echo. & echo  [1/3] Generating client...
call npx prisma generate
echo. & echo  [2/3] Pushing schema...
call npx prisma db push --accept-data-loss
if errorlevel 1 ( echo  [ERROR] db push failed — check DATABASE_URL in .env & pause & goto MENU )
echo. & echo  [3/3] Regenerating client...
call npx prisma generate
echo. & echo  [OK] Schema pushed. Now run [7] Seed database.
pause & goto MENU

:SEED
cls & echo. & echo  Seeding database... & echo.
call npm run db:seed
if errorlevel 1 ( echo  [ERROR] Seed failed & pause & goto MENU )
echo.
echo  Customer: demo@zkwaconnect.in  / demo1234
echo  Admin:    admin@zkwaconnect.in / admin2026!
pause & goto MENU

:TYPECHECK
cls & echo. & echo  TypeScript check... & echo.
call npm run typecheck
if errorlevel 1 ( echo  [ERRORS] Fix errors above & pause & goto MENU )
echo. & echo  [OK] 0 TypeScript errors. & pause & goto MENU

:BUILD
cls & echo. & echo  Building Next.js... & echo.
call npm run build
if errorlevel 1 ( echo  [ERROR] Build failed & pause & goto MENU )
echo. & echo  [OK] Build successful. & pause & goto MENU

:DEV
cls & echo. & echo  Starting dev server... & echo.
echo  App:   http://localhost:3000
echo  Admin: http://localhost:3000/admin/login
echo.
call npm run dev
goto MENU

:START
cls & echo. & echo  Starting production... & echo.
call npm run start
goto MENU

:STUDIO
cls & echo. & echo  Opening Prisma Studio... & echo.
start http://localhost:5555
call npx prisma studio
goto MENU

:RESET
cls & echo.
echo  WARNING: Deletes ALL data!
set /p CONFIRM=  Type YES to confirm:
if not "!CONFIRM!"=="YES" goto MENU
call npx prisma migrate reset --force
echo. & echo  [OK] DB reset. & pause & goto MENU

:FRESH
cls & echo.
echo  ═══════════════════════════════════════
echo   FRESH INSTALL — ZKWAConnect v4.0.6
echo  ═══════════════════════════════════════
echo.
echo  Steps:
echo    1. npm install
echo    2. prisma format
echo    3. prisma validate
echo    4. prisma generate
echo    5. prisma db push (works on Railway/Neon/GoDaddy)
echo    6. prisma generate
echo    7. db:seed
echo.
set /p C=  Start? (Y/N):
if /I not "!C!"=="Y" goto MENU

echo. & echo  [1/7] npm install...
call npm install
if errorlevel 1 ( echo  [ERROR] & pause & goto MENU )

echo. & echo  [2/7] prisma format...
call npx prisma format

echo. & echo  [3/7] prisma validate...
call npx prisma validate
if errorlevel 1 ( echo  [ERROR] Schema invalid & pause & goto MENU )

echo. & echo  [4/7] prisma generate...
call npx prisma generate
if errorlevel 1 ( echo  [ERROR] Generate failed & pause & goto MENU )

echo. & echo  [5/7] prisma db push...
call npx prisma db push --accept-data-loss
if errorlevel 1 (
  echo  db push failed — trying migrate dev...
  call npx prisma migrate dev --name zkwa_v406
  if errorlevel 1 ( echo  [ERROR] Both failed. Check DATABASE_URL in .env & pause & goto MENU )
)

echo. & echo  [6/7] prisma generate...
call npx prisma generate

echo. & echo  [7/7] seed database...
call npm run db:seed
if errorlevel 1 ( echo  [ERROR] Seed failed & pause & goto MENU )

echo.
echo  ═══════════════════════════════════════
echo   FRESH INSTALL COMPLETE ✅
echo  ═══════════════════════════════════════
echo.
echo  Run:     zkwa.bat [10] Dev server
echo  Login:   demo@zkwaconnect.in / demo1234
echo  Admin:   admin@zkwaconnect.in / admin2026!
echo.
pause & goto MENU

:FULLBUILD
cls & echo.
echo  Full validate + build...
call npx prisma format
call npx prisma validate
if errorlevel 1 ( echo  [ERROR] Schema invalid & pause & goto MENU )
call npx prisma generate
if errorlevel 1 ( echo  [ERROR] Generate failed & pause & goto MENU )
call npm run typecheck
if errorlevel 1 ( echo  [ERRORS] Fix TypeScript errors first & pause & goto MENU )
call npm run build
if errorlevel 1 ( echo  [ERROR] Build failed & pause & goto MENU )
echo. & echo  [OK] All checks passed. Ready to deploy.
pause & goto MENU

:EXIT
exit
