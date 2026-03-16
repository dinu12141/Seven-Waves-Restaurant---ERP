@echo off
echo ============================================
echo   Seven Waves ERP - Electron Build Script
echo ============================================
echo.

:: ──────────────────────────────────────────────────────
:: This script builds the Electron desktop app in two steps:
::   1) Quasar compiles the UI + electron main/preload (--skip-pkg)
::   2) electron-builder packages into an NSIS installer
::
:: This two-step approach avoids file-lock issues where
:: Windows Defender holds app.asar open, preventing clean rebuilds.
:: ──────────────────────────────────────────────────────

:: Step 1: Kill processes that may lock build files
echo [1/5] Releasing file locks...
taskkill /F /IM dart.exe >nul 2>&1
taskkill /F /IM esbuild.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "Seven Waves ERP.exe" >nul 2>&1
set USE_HARD_LINKS=false
echo       Done

:: Step 2: Clean old builds (best effort — locked files are okay)
echo [2/5] Cleaning previous build...
if exist "dist\electron\UnPackaged" rmdir /s /q "dist\electron\UnPackaged" 2>nul
if exist "dist\electron\Output" rmdir /s /q "dist\electron\Output" 2>nul
timeout /t 1 /nobreak >nul
echo       Done

:: Step 3: Run Quasar build WITHOUT packaging (--skip-pkg)
echo [3/5] Building Electron app with Quasar (compiling UI + main)...
echo.
cd /d "%~dp0"
call npx quasar build -m electron --skip-pkg

if %errorlevel% neq 0 (
    echo.
    echo   BUILD FAILED at Quasar compile step!
    pause
    exit /b 1
)

:: Step 4: Verify the UnPackaged output
echo [4/5] Verifying compiled output...
if not exist "dist\electron\UnPackaged\electron-main.cjs" (
    echo   ERROR: electron-main.cjs not found! Build is broken.
    pause
    exit /b 1
)
if not exist "dist\electron\UnPackaged\index.html" (
    echo   ERROR: index.html not found! Build is broken.
    pause
    exit /b 1
)
echo       electron-main.cjs  OK
echo       index.html         OK

:: Step 5: Package with electron-builder (separate output dir avoids file locks)
echo [5/5] Packaging with electron-builder (NSIS installer)...
echo.
call npx electron-builder --win --x64 ^
    --config.appId="com.sevenwaves.erp" ^
    --config.productName="Seven Waves ERP" ^
    --config.copyright="Copyright (C) 2026 Cosmo Solutions" ^
    --config.asar=false ^
    --config.asarUnpack="**/*.node" ^
    --config.win.target="nsis" ^
    --config.win.icon="src-electron\icons\icon.ico" ^
    --config.win.signAndEditExecutable=false ^
    --config.nsis.oneClick=false ^
    --config.nsis.allowToChangeInstallationDirectory=true ^
    --config.nsis.createDesktopShortcut=true ^
    --config.nsis.createStartMenuShortcut=true ^
    --config.nsis.artifactName="Seven_Waves_ERP_Setup.exe" ^
    --config.files="**/*" ^
    --config.files="!node_modules/**" ^
    --config.directories.app="dist\electron\UnPackaged" ^
    --config.directories.output="dist\electron\Output"

if %errorlevel% neq 0 (
    echo.
    echo   PACKAGING FAILED! Check errors above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   BUILD SUCCESSFUL!
echo.
echo   Installer:  dist\electron\Output\Seven_Waves_ERP_Setup.exe
echo   Unpacked:   dist\electron\Output\win-unpacked\
echo ============================================
echo.
pause
