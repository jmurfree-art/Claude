@echo off
REM ============================================================================
REM  wav2lip-service one-time setup (Windows, NVIDIA GPU, no Docker).
REM
REM  Clones Rudrabha/Wav2Lip, creates a Python venv, installs deps, and
REM  downloads model weights. Safe to re-run: existing repo/venv/weights are
REM  left alone (weights are skipped if already present).
REM ============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo === wav2lip-service setup ===
echo.

REM --- 1. check prerequisites -------------------------------------------------

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found on PATH. Install Python 3.10 from
    echo         https://www.python.org/downloads/ and re-run this script.
    exit /b 1
)

python -c "import sys; sys.exit(0 if sys.version_info[:2]==(3,10) else 1)" >nul 2>nul
if errorlevel 1 (
    echo [WARN] The active "python" is not 3.10.x. Wav2Lip's pinned deps are
    echo        known to work best on Python 3.10; other versions may fail to
    echo        install ^(e.g. numba/librosa^). Continuing anyway...
)

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git was not found on PATH. Install Git for Windows from
    echo         https://git-scm.com/download/win and re-run this script.
    exit /b 1
)

REM --- 2. clone Wav2Lip --------------------------------------------------------

if exist "%~dp0Wav2Lip\" (
    echo [SKIP] %~dp0Wav2Lip already exists, not re-cloning.
) else (
    echo [STEP] Cloning Rudrabha/Wav2Lip...
    git clone https://github.com/Rudrabha/Wav2Lip "%~dp0Wav2Lip"
    if errorlevel 1 (
        echo [ERROR] git clone failed.
        exit /b 1
    )
)

REM --- 3. create venv -----------------------------------------------------------

if exist "%~dp0venv\Scripts\activate.bat" (
    echo [SKIP] venv already exists at %~dp0venv
) else (
    echo [STEP] Creating virtual environment...
    python -m venv "%~dp0venv"
    if errorlevel 1 (
        echo [ERROR] Failed to create venv.
        exit /b 1
    )
)

call "%~dp0venv\Scripts\activate.bat"
if errorlevel 1 (
    echo [ERROR] Failed to activate venv.
    exit /b 1
)

python -m pip install --upgrade pip

REM --- 4. install torch (CUDA build) --------------------------------------------

echo [STEP] Installing torch/torchvision (CUDA 12.1 wheels)...
REM NOTE: cu121 wheels work on RTX 40-series (e.g. RTX 4070) NVIDIA GPUs. If
REM you have an older/newer CUDA driver, swap the --index-url below for the
REM matching one from https://pytorch.org/get-started/locally/
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
if errorlevel 1 (
    echo [ERROR] torch install failed.
    exit /b 1
)

REM --- 5. install Wav2Lip's own requirements ------------------------------------

echo [STEP] Installing Wav2Lip requirements...
pip install -r "%~dp0Wav2Lip\requirements.txt"
if errorlevel 1 (
    echo [ERROR] Wav2Lip requirements install failed.
    echo         Known fix if librosa/numba version pins conflict on newer
    echo         Python/pip resolvers, run manually then re-run this script:
    echo             pip install librosa==0.9.1 numpy==1.23.5
    REM pip install librosa==0.9.1 numpy==1.23.5
    exit /b 1
)

REM --- 6. install this service's own requirements -------------------------------

echo [STEP] Installing wav2lip-service requirements...
pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [ERROR] Service requirements install failed.
    exit /b 1
)

REM --- 7. download model weights -------------------------------------------------

echo [STEP] Downloading model weights ^(if missing^)...

where curl >nul 2>nul
if errorlevel 1 (
    echo [ERROR] curl was not found on PATH ^(should ship with Windows 10/11^).
    echo         Download the weights manually - see README.md for URLs.
    exit /b 1
)

if not exist "%~dp0Wav2Lip\checkpoints\" mkdir "%~dp0Wav2Lip\checkpoints"
if not exist "%~dp0Wav2Lip\face_detection\detection\sfd\" mkdir "%~dp0Wav2Lip\face_detection\detection\sfd"

if exist "%~dp0Wav2Lip\checkpoints\wav2lip_gan.pth" (
    echo [SKIP] wav2lip_gan.pth already present.
) else (
    echo [STEP] Downloading wav2lip_gan.pth ^(this may take a few minutes^)...
    REM Known-good mirror as of writing. If this 404s, see README.md for how
    REM to find an updated URL.
    curl -L -o "%~dp0Wav2Lip\checkpoints\wav2lip_gan.pth" "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip_gan.pth"
    if errorlevel 1 (
        echo [ERROR] wav2lip_gan.pth download failed. See README.md for
        echo         alternate weight URLs.
        exit /b 1
    )
)

if exist "%~dp0Wav2Lip\face_detection\detection\sfd\s3fd.pth" (
    echo [SKIP] s3fd.pth already present.
) else (
    echo [STEP] Downloading s3fd.pth ^(face detector weights^)...
    REM Known-good mirror as of writing. If this 404s, see README.md for how
    REM to find an updated URL.
    curl -L -o "%~dp0Wav2Lip\face_detection\detection\sfd\s3fd.pth" "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/s3fd.pth"
    if errorlevel 1 (
        echo [ERROR] s3fd.pth download failed. See README.md for alternate
        echo         weight URLs.
        exit /b 1
    )
)

echo.
echo === Setup complete! Run run.bat to start the service. ===
echo.

endlocal
