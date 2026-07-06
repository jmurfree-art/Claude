@echo off
rem ============================================================
rem AvatarStudio — one-time Windows installer.
rem Double-click this file. It will:
rem   1. Install Git, Node.js, and ffmpeg if missing (via winget)
rem   2. Download AvatarStudio to %USERPROFILE%\AvatarStudio
rem   3. Ask for your Supabase anon key (one paste, one time)
rem   4. Install dependencies and build the app
rem   5. Put an AvatarStudio shortcut on your Desktop
rem   6. Launch the app
rem After this, just double-click the Desktop icon.
rem ============================================================
setlocal
title AvatarStudio installer
set "INSTALL_DIR=%USERPROFILE%\AvatarStudio"
set "REPO_URL=https://github.com/jmurfree-art/Claude.git"
set "BRANCH=claude/avatar-video-generator-h2e8gy"
set "SUPABASE_URL=https://fthvbvjvmhmpbqivueis.supabase.co"
set "NEEDS_RERUN="

echo.
echo  === AvatarStudio one-time installer ===
echo.

rem ---- 1) prerequisites -------------------------------------------------
where winget >nul 2>nul
if errorlevel 1 (
  echo winget was not found. Install "App Installer" from the Microsoft
  echo Store, then run this installer again.
  pause & exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo Installing Git...
  winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
  set "NEEDS_RERUN=1"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  set "NEEDS_RERUN=1"
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo Installing ffmpeg...
  winget install --id Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements
  set "NEEDS_RERUN=1"
)

if defined NEEDS_RERUN (
  echo.
  echo  Tools were just installed. Windows needs a fresh window to see them.
  echo  ACTION: close this window and double-click the installer ONE more time.
  echo.
  pause & exit /b 0
)

rem ---- 2) get the app ---------------------------------------------------
if exist "%INSTALL_DIR%\.git" (
  echo Updating AvatarStudio...
  git -C "%INSTALL_DIR%" pull --ff-only
) else (
  echo Downloading AvatarStudio...
  git clone -b "%BRANCH%" "%REPO_URL%" "%INSTALL_DIR%"
  if errorlevel 1 ( echo Clone failed — check your GitHub access. & pause & exit /b 1 )
)

rem ---- 3) configuration (one time) --------------------------------------
rem NOTE: no parenthesized block here — `set /p` values must expand at
rem line-execution time, which batch only does outside (...) blocks.
if exist "%INSTALL_DIR%\.env.local" goto :install

echo.
echo  One-time setup: your Supabase API key.
echo  Copy the key labeled "anon public" or "publishable" — it starts
echo  with eyJ or sb_publishable_. Find it here:
echo  https://supabase.com/dashboard/project/fthvbvjvmhmpbqivueis/settings/api
echo.
set /p ANON_KEY="Paste anon key and press Enter: "
set /p HEYGEN_KEY="Paste HeyGen API key (or just press Enter to skip): "

echo NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%> "%INSTALL_DIR%\.env.local"
echo NEXT_PUBLIC_SUPABASE_ANON_KEY=%ANON_KEY%>> "%INSTALL_DIR%\.env.local"
echo NEXT_PUBLIC_APP_URL=http://localhost:3000>> "%INSTALL_DIR%\.env.local"
echo HEYGEN_API_KEY=%HEYGEN_KEY%>> "%INSTALL_DIR%\.env.local"

echo.
echo  REMINDER: the database schema must be loaded once. If you haven't:
echo  open https://supabase.com/dashboard/project/fthvbvjvmhmpbqivueis/sql/new
echo  paste the contents of supabase\schema.sql and click Run.
echo.

:install
rem ---- 4) install + build -----------------------------------------------
cd /d "%INSTALL_DIR%"
echo Installing dependencies ^(a few minutes the first time^)...
call npm install
if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
echo Building the app...
call npm run build
if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )

rem ---- 5) desktop shortcut ----------------------------------------------
powershell -ExecutionPolicy Bypass -File "%INSTALL_DIR%\scripts\Create-DesktopShortcut.ps1"

rem ---- 6) go -------------------------------------------------------------
echo.
echo  Done! Launching AvatarStudio... From now on, use the Desktop icon.
echo.
start "" "%INSTALL_DIR%\scripts\launch.bat"
timeout /t 5 >nul
endlocal
