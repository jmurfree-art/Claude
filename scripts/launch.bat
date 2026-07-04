@echo off
rem ============================================================
rem AvatarStudio launcher (Windows)
rem Installs deps / builds on first run, starts the server
rem minimized, and opens the dashboard in your browser.
rem ============================================================
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo .env.local is missing.
  echo Copy .env.example to .env.local and fill in your Supabase keys first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist ".next" (
  echo Building AvatarStudio ^(first run, takes a minute^)...
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)

echo Starting AvatarStudio at http://localhost:3000 ...
start "AvatarStudio server" /min cmd /c "npm run start"

rem Give the server a moment to boot, then open the dashboard.
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/dashboard"

echo AvatarStudio is running. Close the minimized "AvatarStudio server"
echo window to stop it.
timeout /t 5 >nul
endlocal
