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

rem Auto-update: pull the latest code. If the pull changed anything, the
rem launcher itself may have changed - re-exec it so cmd doesn't run a
rem half-old/half-new script (batch files are read by byte offset). The
rem AVATARSTUDIO_UPDATED guard stops an infinite re-exec loop. NOTE: kept
rem flat (goto, no parenthesized blocks) because %VAR% inside a block
rem expands at parse time and would compare stale/empty values.
if defined AVATARSTUDIO_UPDATED goto :after_update
set "OLD_HEAD="
set "NEW_HEAD="
for /f %%i in ('git rev-parse HEAD 2^>nul') do set "OLD_HEAD=%%i"
git pull --ff-only
for /f %%i in ('git rev-parse HEAD 2^>nul') do set "NEW_HEAD=%%i"
if "%OLD_HEAD%"=="%NEW_HEAD%" goto :after_update
echo Update downloaded - relaunching...
set "AVATARSTUDIO_UPDATED=1"
call "%~f0"
exit /b %errorlevel%
:after_update

if not exist "node_modules" (
  echo Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist ".next" (
  echo Building AvatarStudio ^(this can take a minute^)...
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
) else if defined AVATARSTUDIO_UPDATED (
  echo Rebuilding after update...
  call npm install
  call npm run build
  if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )
)

rem Stop any previous AvatarStudio server still holding port 3000 so a stale
rem build never keeps serving. Best-effort only: never let a failure here
rem (e.g. a broken taskkill on some systems) abort the launch.
call :free_port

echo Starting AvatarStudio at http://localhost:3000 ...
start "AvatarStudio server" /min cmd /c "npm run start"

rem Give the server a moment to boot, then open the dashboard.
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/dashboard"

echo AvatarStudio is running. Close the minimized "AvatarStudio server"
echo window to stop it.
timeout /t 5 >nul
endlocal
exit /b 0

:free_port
rem Kill whatever listens on :3000, using full System32 paths and swallowing
rem every error so this can never crash the launcher.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command ^
  "try { Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}" >nul 2>nul
exit /b 0
