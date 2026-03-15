@echo off
echo ============================================
echo   Seven Waves ERP - Electron Build Script
echo ============================================
echo.

:: Step 1: Enable Developer Mode (for symlink permissions)
echo [1/3] Enabling Windows Developer Mode for symlink support...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f >nul 2>&1
if %errorlevel% equ 0 (
    echo       [OK] Developer Mode enabled
) else (
    echo       [WARN] Could not enable Developer Mode
    echo              Please run this script as Administrator!
    echo.
    pause
    exit /b 1
)

:: Step 2: Set environment variables
echo [2/3] Setting build environment...
set USE_HARD_LINKS=false

:: Step 3: Run the Quasar Electron build
echo [3/3] Starting Electron build (this may take a few minutes)...
echo.
cd /d "%~dp0"
call npx quasar build -m electron

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   BUILD SUCCESSFUL!
    echo   Output: dist\electron\
    echo ============================================
) else (
    echo.
    echo ============================================
    echo   BUILD FAILED! Check errors above.
    echo ============================================
)

echo.
pause
