@echo off
echo ============================================================
echo   ZKWAConnect v6 - Universal Publish & Deployment Portal
echo ============================================================
echo.
echo Opening Publish Portal in your default browser...
start "" "%~dp0publish-portal\index.html"
echo.
echo Done! Follow the on-screen instructions to deploy:
echo   - Marketing: zkwaconnect.in (apps/marketing)
echo   - Customer App: app.zkwaconnect.in (apps/app)
echo   - Backend REST API: api.zkwaconnect.in (apps/api)
echo.
pause

