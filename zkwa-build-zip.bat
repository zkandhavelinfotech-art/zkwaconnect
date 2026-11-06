@echo off
echo ============================================================
echo   ZKWAConnect v6 - Automated Build & Release Packager
echo ============================================================
echo.
echo Choose your deployment target environment:
echo   [1] Live / Production (zkwaconnect.in, app.zkwaconnect.in, api.zkwaconnect.in)
echo   [2] Dev / Localhost (localhost:3002)
echo.
set /p choice="Enter choice (1 or 2, default is 1): "

if "%choice%"=="2" (
    echo.
    echo Building Dev / Localhost Package...
    node "%~dp0scripts\package-release.mjs" --env=dev
) else (
    echo.
    echo Building Live / Production Package...
    node "%~dp0scripts\package-release.mjs" --env=live
)

echo.
echo ============================================================
echo   ZIP Package generated in release\ folder!
echo ============================================================
echo.
pause

