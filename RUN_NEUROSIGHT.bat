@echo off
setlocal
cd /d "%~dp0"
title NEUROSIGHT AI - Local Research Console
color 0B
echo.
echo   ====================================================
echo     NEUROSIGHT AI  -  PRIVATE LOCAL RESEARCH CONSOLE
echo   ====================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS from https://nodejs.org/
  echo Then double-click this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo [SETUP] Installing application packages and local AI model...
  echo         Internet required during first-time setup.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Setup failed. Read WINDOWS_LAUNCH_GUIDE.md
    pause
    exit /b 1
  )
)
if not exist "public\models\face_landmarker.task" (
  echo [SETUP] Restoring local tracking model...
  call npm run setup:assets
  if errorlevel 1 (
    echo [ERROR] Model setup failed. Read WINDOWS_LAUNCH_GUIDE.md
    pause
    exit /b 1
  )
)
echo.
echo [READY] Opening http://localhost:5173 in your browser...
echo         Keep this window open while using NEUROSIGHT AI.
echo         Press CTRL+C here to stop the server.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:5173'"
call npm run dev
pause
