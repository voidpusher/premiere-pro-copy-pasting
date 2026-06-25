@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo   Instant Paste - Install to Premiere Pro
echo ============================================
echo.

:: Target CEP extension folder (per-user)
set "EXTENSION_DIR=%APPDATA%\Adobe\CEP\extensions\com.instantpaste.plugin"
set "SOURCE_DIR=%~dp0..\cep-plugin"

echo Installing to: %EXTENSION_DIR%
echo.

:: Enable unsigned CEP extensions (required for development)
echo [1/4] Enabling unsigned CEP extensions...
reg add "HKCU\Software\Adobe\CSXS.11" /v "PlayerDebugMode" /t REG_SZ /d "1" /f >nul 2>&1
reg add "HKCU\Software\Adobe\CSXS.10" /v "PlayerDebugMode" /t REG_SZ /d "1" /f >nul 2>&1
reg add "HKCU\Software\Adobe\CSXS.9"  /v "PlayerDebugMode" /t REG_SZ /d "1" /f >nul 2>&1
echo Done.

:: Create extension folder
echo.
echo [2/4] Creating extension folder...
if exist "%EXTENSION_DIR%" (
    echo Removing existing installation...
    rmdir /s /q "%EXTENSION_DIR%"
)
mkdir "%EXTENSION_DIR%"

:: Copy CSXS manifest
echo.
echo [3/4] Copying plugin files...
xcopy /E /I /Y "%SOURCE_DIR%\CSXS" "%EXTENSION_DIR%\CSXS\" >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy CSXS folder
    exit /b 1
)

:: Copy built dist files
if not exist "%SOURCE_DIR%\dist\index.html" (
    echo [ERROR] Build output not found. Run scripts\build.bat first.
    exit /b 1
)
xcopy /E /I /Y "%SOURCE_DIR%\dist\*" "%EXTENSION_DIR%\" >nul

:: Copy ExtendScript
xcopy /E /I /Y "%SOURCE_DIR%\jsx" "%EXTENSION_DIR%\jsx\" >nul

:: Copy icons if present
if exist "%SOURCE_DIR%\icons" (
    xcopy /E /I /Y "%SOURCE_DIR%\icons" "%EXTENSION_DIR%\icons\" >nul
)

echo Files copied successfully.

:: Package Electron helper
echo.
echo [4/4] Setting up Electron helper...
set "HELPER_DIR=%~dp0..\electron-helper"
if not exist "%HELPER_DIR%\dist\main.js" (
    echo [WARNING] Electron helper not built. Run scripts\build.bat first.
) else (
    :: Copy helper to a convenient location
    set "HELPER_DEST=%USERPROFILE%\InstantPasteHelper"
    if not exist "!HELPER_DEST!" mkdir "!HELPER_DEST!"
    xcopy /E /I /Y "%HELPER_DIR%\*" "!HELPER_DEST!\" /EXCLUDE:"%~dp0exclude.txt" >nul 2>&1
    echo Helper copied to: !HELPER_DEST!
    echo Run it with: cd !HELPER_DEST! ^& npm start
)

echo.
echo ============================================
echo   Installation complete!
echo.
echo   NEXT STEPS:
echo   1. Restart Adobe Premiere Pro
echo   2. Go to Window ^> Extensions ^> Instant Paste
echo   3. Start the helper: cd electron-helper ^& npm start
echo ============================================
