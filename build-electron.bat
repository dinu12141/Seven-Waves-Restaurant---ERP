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
:: Windows Defender holds files open, preventing clean rebuilds.
:: ──────────────────────────────────────────────────────

:: Step 1: Kill processes that may lock build files
echo [1/7] Releasing file locks...
taskkill /F /IM dart.exe >nul 2>&1
taskkill /F /IM esbuild.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "Seven Waves ERP.exe" >nul 2>&1
set USE_HARD_LINKS=false
echo       Done

:: Step 2: Clean old builds (best effort — locked files are okay)
echo [2/7] Cleaning previous build...
if exist "dist\electron\UnPackaged" rmdir /s /q "dist\electron\UnPackaged" 2>nul
if exist "dist\electron\Output" rmdir /s /q "dist\electron\Output" 2>nul
timeout /t 1 /nobreak >nul
echo       Done

:: Step 3: Run Quasar build WITHOUT packaging (--skip-pkg)
echo [3/7] Building Electron app with Quasar (compiling UI + main)...
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
echo [4/7] Verifying compiled output...
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
if not exist "dist\electron\UnPackaged\preload\electron-preload.cjs" (
    echo   ERROR: electron-preload.cjs not found! Build is broken.
    pause
    exit /b 1
)
echo       electron-main.cjs           OK
echo       index.html                  OK
echo       preload/electron-preload.cjs OK

:: Step 5: Remove node_modules from UnPackaged (safety net)
:: Vite already bundled all runtime code — node_modules in the
:: packaged app causes bloat and 0xc000007b crashes from native
:: addons compiled for the wrong Node ABI.
echo [5/7] Cleaning node_modules from UnPackaged (not needed - Vite bundled)...
if exist "dist\electron\UnPackaged\node_modules" (
    rmdir /s /q "dist\electron\UnPackaged\node_modules"
    echo       Removed node_modules (was not needed)
) else (
    echo       Already clean
)
:: Also strip package-lock.json
if exist "dist\electron\UnPackaged\package-lock.json" del "dist\electron\UnPackaged\package-lock.json"

:: Step 6: Verify package.json has no "type":"module" and points to .cjs
echo [6/7] Validating package.json...
findstr /C:"\"type\"" "dist\electron\UnPackaged\package.json" >nul 2>&1
if %errorlevel% equ 0 (
    echo   WARNING: package.json still contains "type" field!
    echo   This may cause CJS loading to fail. Check quasar.config.js extendPackageJson.
)
findstr /C:"electron-main.cjs" "dist\electron\UnPackaged\package.json" >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: package.json "main" does not point to electron-main.cjs!
    pause
    exit /b 1
)
echo       package.json                 OK

:: Step 7: Package with electron-builder
:: Config is in electron-builder.yml (NOT quasar.config.js — that is only
:: used when Quasar invokes packaging itself, which --skip-pkg skips).
echo [7/7] Packaging with electron-builder (NSIS installer)...
echo.
call npx electron-builder --win --x64 ^
    --config=electron-builder.yml ^
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
echo.
echo   VALIDATION: Test the unpacked app FIRST before distributing:
echo     dist\electron\Output\win-unpacked\Seven Waves ERP.exe
echo ============================================
echo.
pause
