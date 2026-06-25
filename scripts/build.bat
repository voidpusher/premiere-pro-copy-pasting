@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo   Instant Paste - Build Script
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    exit /b 1
)

echo [1/4] Installing CEP plugin dependencies...
cd /d "%~dp0..\cep-plugin"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] CEP npm install failed
    exit /b 1
)

echo.
echo [2/4] Building CEP plugin (React + TypeScript)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] CEP build failed
    exit /b 1
)

echo.
echo [3/4] Installing Electron helper dependencies...
cd /d "%~dp0..\electron-helper"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Electron helper npm install failed
    exit /b 1
)

echo.
echo [4/4] Building Electron helper (TypeScript)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Electron helper build failed
    exit /b 1
)

echo.
echo ============================================
echo   Build complete!
echo   Next: run scripts\install.bat
echo ============================================
