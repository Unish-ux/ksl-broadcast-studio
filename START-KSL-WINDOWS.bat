@echo off
title KSL Broadcast Studio
cd /d "%~dp0"
echo ======================================
echo       KSL BROADCAST STUDIO
echo ======================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js 20 or newer from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing required packages for first run...
  call npm install
  if errorlevel 1 (
    echo Package installation failed.
    pause
    exit /b 1
  )
)
echo Starting KSL Broadcast Studio...
start "" http://localhost:4000
call npm start
pause
