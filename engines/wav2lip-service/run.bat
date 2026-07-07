@echo off
REM ============================================================================
REM  Starts the wav2lip-service on http://127.0.0.1:9106
REM  Run setup.bat once before the first run.
REM ============================================================================

cd /d "%~dp0"

call "%~dp0venv\Scripts\activate.bat"
if errorlevel 1 (
    echo [ERROR] Could not activate venv at %~dp0venv - did you run setup.bat?
    exit /b 1
)

set WAV2LIP_PYTHON=%~dp0venv\Scripts\python.exe
set WAV2LIP_REPO_DIR=%~dp0Wav2Lip

uvicorn app:app --host 127.0.0.1 --port 9106
