@echo off
title Seven Waves ERP - WhatsApp PDF Dispatch Bridge
color 0B

echo ===================================================================
echo   Seven Waves ERP - WhatsApp 1-Click PDF Dispatch Gateway
echo ===================================================================
echo.
echo Starting WhatsApp Bridge Service on port 3005...
echo Once started, open: http://localhost:3005 in your browser
echo.

cd /d "%~dp0\..\services\whatsapp-bridge"

node server.mjs

pause

