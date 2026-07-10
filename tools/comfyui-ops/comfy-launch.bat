@echo off
setlocal enabledelayedexpansion

set "COMFY_DIR=%COMFYUI_DIR%"
if not defined COMFY_DIR set "COMFY_DIR=C:\ComfyUI_windows_portable"

if not exist "%COMFY_DIR%\ComfyUI\main.py" (
    echo ERROR: Could not find "%COMFY_DIR%\ComfyUI\main.py"
    echo Set COMFYUI_DIR environment variable to your ComfyUI portable install, or fix the default path in this script.
    pause
    exit /b 1
)

set "EXTRA_FLAGS="
if /I "%~1"=="lean" (
    set "EXTRA_FLAGS=--cache-none"
    echo Lean mode: using --cache-none (low-RAM mode, good for lip-sync sessions)
)

goto CHECK_PORT

:CHECK_PORT
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%PS_EXE%" -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue; if ($conns) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 goto START_SERVER
goto SHOW_MENU

:SHOW_MENU
echo.
echo ComfyUI is already running on port 8188.
echo   [R] Reuse it (open browser)
echo   [K] Kill it and start fresh
echo   [Q] Quit
choice /C RKQ /N /M "Choose an option: "
if errorlevel 3 goto QUIT
if errorlevel 2 goto KILL_EXISTING
if errorlevel 1 goto REUSE_EXISTING
goto QUIT

:REUSE_EXISTING
start "" http://127.0.0.1:8188
goto END_OK

:KILL_EXISTING
"%PS_EXE%" -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}" >nul 2>nul
goto START_SERVER

:QUIT
exit /b 0

:START_SERVER
cd /d "%COMFY_DIR%"
start "ComfyUI server" /min cmd /c ".\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build %EXTRA_FLAGS% & pause"

set "WAIT_COUNT=0"
goto WAIT_LOOP

:WAIT_LOOP
if %WAIT_COUNT% GEQ 60 goto WAIT_TIMEOUT
"%PS_EXE%" -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if errorlevel 1 goto WAIT_RETRY
goto WAIT_READY

:WAIT_RETRY
set /a WAIT_COUNT=%WAIT_COUNT%+1
"%PS_EXE%" -NoProfile -Command "Start-Sleep -Seconds 2" >nul 2>nul
goto WAIT_LOOP

:WAIT_READY
echo ComfyUI is up. Opening browser...
start "" http://127.0.0.1:8188
goto END_OK

:WAIT_TIMEOUT
echo ComfyUI did not become ready - check the minimized ComfyUI server window for errors.
pause
exit /b 1

:END_OK
exit /b 0
