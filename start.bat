@echo off
setlocal
cd /d "%~dp0"
title WhatsApp Desk

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found.
  echo Install Node.js 20 or newer from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -p "process.versions.node"') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 20 (
  echo.
  echo Node.js 20 or newer is required. You have:
  node --version
  echo.
  pause
  exit /b 1
)

set NEED_INSTALL=
if not exist "node_modules\@whiskeysockets\baileys\package.json" set NEED_INSTALL=1
if not exist "node_modules\express\package.json" set NEED_INSTALL=1
if not exist "node_modules\libsignal\package.json" set NEED_INSTALL=1
if defined NEED_INSTALL (
  echo Installing dependencies. This only happens once...
  call npm install --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
)

if not defined PORT set PORT=3000
echo.
echo WhatsApp Desk is starting at http://127.0.0.1:%PORT%
echo Close this window to stop the app.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%'"
node server/index.js
echo.
echo The server has stopped.
pause
