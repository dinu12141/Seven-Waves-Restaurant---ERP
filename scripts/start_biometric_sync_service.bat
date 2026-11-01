@echo off
title Seven Waves ERP - Biometric Sync Service
color 0A

echo ===================================================================
echo   Seven Waves ERP - Biometric Fingerprint 24/7 Cloud Sync Service
echo ===================================================================
echo.
echo Connecting to Fingerprint Terminal and syncing punches with Cloud ERP...
echo Cloud Domain: https://erp.sevenwaves.lk
echo.

cd /d "%~dp0\.."

:: Default device IP is 192.168.1.201, Port 4370.
:: You can pass custom IP: start_biometric_sync_service.bat 192.168.1.150
set DEVICE_IP=%1
if "%DEVICE_IP%"=="" set DEVICE_IP=192.168.1.201

set DEVICE_PORT=%2
if "%DEVICE_PORT%"=="" set DEVICE_PORT=4370

echo [INFO] Target Machine IP: %DEVICE_IP%:%DEVICE_PORT%
echo [INFO] Starting automatic sync loop every 30 seconds...
echo.

node scripts/biometric_sync_bridge.mjs %DEVICE_IP% %DEVICE_PORT% --loop

pause
