"""Wav2Lip inference microservice (Windows + NVIDIA GPU, no Docker).

Wraps https://github.com/Rudrabha/Wav2Lip's `inference.py` CLI behind the
same jobs HTTP contract shared by every avatar-engine microservice in the
parent app (see lib/avatar-engines/http-engine.ts):

    POST /jobs        -> { jobId, status }
    GET  /jobs/{id}   -> { jobId, status, progress, outputVideoUrl, error, metadata }
    GET  /files/{id}.mp4
    GET  /healthz

All job state lives on disk under WORK_DIR/{jobId}/ so the service can be
restarted (e.g. after a Windows reboot) without losing track of in-flight or
completed jobs. There is no in-memory job table other than the list of
background worker threads kept alive for the lifetime of the process.

This service is meant to run directly on Windows via run.bat, next to a
checked-out Wav2Lip repo and its own Python venv (see setup.bat) — no Docker.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# ── configuration ────────────────────────────────────────────────────────

SERVICE_DIR = Path(__file__).resolve().parent

# Where the Wav2Lip repo lives (cloned by setup.bat next to this service).
WAV2LIP_REPO_DIR = Path(
    os.environ.get("WAV2LIP_REPO_DIR", str(SERVICE_DIR / "Wav2Lip"))
)

# Python interpreter used to run inference.py. Defaults to the venv created
# by setup.bat; falls back to a bare "python" if that venv doesn't exist
# (e.g. the service's own deps are installed globally instead).
_VENV_PYTHON = SERVICE_DIR / "venv" / "Scripts" / "python.exe"
WAV2LIP_PYTHON = os.environ.get(
    "WAV2LIP_PYTHON", str(_VENV_PYTHON) if _VENV_PYTHON.exists() else "python"
)

# Checkpoint path is relative to WAV2LIP_REPO_DIR unless absolute.
WAV2LIP_CHECKPOINT = os.environ.get(
    "WAV2LIP_CHECKPOINT", "checkpoints/wav2lip_gan.pth"
)

WORK_DIR = Path(os.environ.get("WORK_DIR", str(SERVICE_DIR / "jobs")))
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:9106").rstrip("/")
API_KEY = os.environ.get("WAV2LIP_SERVICE_API_KEY")  # optional bearer token

WORK_DIR.mkdir(parents=True, exist_ok=True)

# uuid4().hex is 32 lowercase hex chars, but accept any sane hex id length so
# manually-constructed / future job ids still pass validation.
JOB_ID_RE = re.compile(r"^[0-9a-f]{8,}$")

# Keep references to background worker threads so they aren't garbage
# collected mid-run. Disk (status.json) remains the source of truth, not
# this list.
_WORKER_THREADS: list[threading.Thread] = []

app = FastAPI(title="Wav2Lip inference service")


# ── auth ─────────────────────────────────────────────────────────────────


def require_api_key(request: Request) -> None:
    """Enforce `Authorization: Bearer <key>` when WAV2LIP_SERVICE_API_KEY is set."""
    if not API_KEY:
        return
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {API_KEY}"
    if auth != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── request/response models ──────────────────────────────────────────────


class CreateJobRequest(BaseModel):
    projectId: Optional[str] = None
    userId: Optional[str] = None
    audioUrl: Optional[str] = None
    avatarImageUrl: Optional[str] = None
    sourceVideoUrl: Optional[str] = None
    script: Optional[str] = None
    language: Optional[str] = None
    aspectRatio: Optional[str] = None
    emotion: Optional[str] = None
    motionIntensity: Optional[float] = None
    options: dict[str, Any] = Field(default_factory=dict)


class CreateJobResponse(BaseModel):
    jobId: str
    status: str


class JobStatusResponse(BaseModel):
    jobId: str
    status: str
    progress: int
    outputVideoUrl: Optional[str]
    error: Optional[str]
    metadata: dict[str, Any]


# ── status.json helpers ───────────────────────────────────────────────────


def job_dir(job_id: str) -> Path:
    return WORK_DIR / job_id


def status_path(job_id: str) -> Path:
    return job_dir(job_id) / "status.json"


def write_status(
    job_id: str,
    status: str,
    progress: int,
    error: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """Persist the job's current state. This file is the only source of truth."""
    payload = {
        "status": status,
        "progress": progress,
        "error": error,
        "metadata": metadata or {},
    }
    tmp_path = status_path(job_id).with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload))
    tmp_path.replace(status_path(job_id))


def read_status(job_id: str) -> dict[str, Any]:
    return json.loads(status_path(job_id).read_text())


# ── download helpers ──────────────────────────────────────────────────────


def guess_extension(url: str, content_type: Optional[str], default: str) -> str:
    """Best-effort file extension from the URL path, falling back to content-type."""
    path = urlparse(url).path
    suffix = Path(path).suffix
    if suffix and len(suffix) <= 6:
        return suffix
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        ct_map = {
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
            "audio/wave": ".wav",
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
        }
        if ct in ct_map:
            return ct_map[ct]
    return default


def download_to(url: str, dest_dir: Path, stem: str, default_ext: str) -> Path:
    """Download `url` into dest_dir/{stem}{ext}, following redirects."""
    with httpx.Client(follow_redirects=True, timeout=300.0) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            ext = guess_extension(url, resp.headers.get("content-type"), default_ext)
            dest = dest_dir / f"{stem}{ext}"
            with open(dest, "wb") as f:
                for chunk in resp.iter_bytes():
                    f.write(chunk)
    return dest


def is_video_url(url: str) -> bool:
    """Best-effort guess of whether a face source URL points at a video."""
    return bool(re.search(r"\.(mp4|mov|webm|avi|mkv)(\?|$)", url, re.IGNORECASE))


# ── inference worker ──────────────────────────────────────────────────────


def build_inference_cmd(
    checkpoint_path: Path, face_path: Path, audio_path: Path, out_path: Path, options: dict[str, Any]
) -> list[str]:
    """Build the `inference.py` CLI invocation, layering in optional flags."""
    cmd = [
        WAV2LIP_PYTHON,
        "inference.py",
        "--checkpoint_path",
        str(checkpoint_path),
        "--face",
        str(face_path),
        "--audio",
        str(audio_path),
        "--outfile",
        str(out_path),
    ]

    pads = options.get("pads")
    if pads:
        # Accept either "0 10 0 0" (str) or [0, 10, 0, 0] (list).
        pads_str = " ".join(str(p) for p in pads) if isinstance(pads, (list, tuple)) else str(pads)
        cmd += ["--pads", *pads_str.split()]

    resize_factor = options.get("resize_factor")
    if resize_factor:
        cmd += ["--resize_factor", str(int(resize_factor))]

    if options.get("nosmooth"):
        cmd += ["--nosmooth"]

    return cmd


def run_job(
    job_id: str,
    audio_url: str,
    face_url: str,
    options: dict[str, Any],
) -> None:
    """Background worker: download inputs, run Wav2Lip, publish results.

    All progress/errors are written to status.json so GET /jobs/{id} always
    reflects the latest known state, even across a service restart.
    """
    jdir = job_dir(job_id)
    log_path = jdir / "log.txt"

    try:
        write_status(job_id, "processing", 5)

        # (a) download audio + face source. Wav2Lip's --face accepts either a
        # still image (treated as a single static frame) or a video.
        audio_path = download_to(audio_url, jdir, "audio", ".wav")
        face_default_ext = ".mp4" if is_video_url(face_url) else ".jpg"
        face_path = download_to(face_url, jdir, "face", face_default_ext)

        write_status(job_id, "processing", 10)

        # (b) resolve checkpoint (allow overriding wav2lip.pth vs wav2lip_gan.pth
        # per-job via options.checkpoint_path).
        checkpoint_name = options.get("checkpoint_path") or WAV2LIP_CHECKPOINT
        checkpoint_path = Path(checkpoint_name)
        if not checkpoint_path.is_absolute():
            checkpoint_path = WAV2LIP_REPO_DIR / checkpoint_path

        out_path = jdir / "output.mp4"
        cmd = build_inference_cmd(checkpoint_path, face_path, audio_path, out_path, options)

        write_status(job_id, "processing", 30)

        # (c) run inference.py with cwd = the Wav2Lip repo (it resolves its own
        # relative paths, e.g. face_detection weights, from there).
        with open(log_path, "wb") as log_file:
            proc = subprocess.run(
                cmd,
                cwd=str(WAV2LIP_REPO_DIR),
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )

        if proc.returncode != 0:
            raise RuntimeError(f"inference.py exited with code {proc.returncode}")

        if not out_path.is_file():
            raise RuntimeError("inference.py exited 0 but no output.mp4 was produced")

        # (d) done
        write_status(job_id, "completed", 100)

    except Exception as exc:  # noqa: BLE001 - convert any failure into job status
        tail = ""
        if log_path.exists():
            text = log_path.read_text(errors="replace")
            tail = text[-1500:]
        error_message = str(exc)
        if tail:
            error_message = f"{error_message}\n\n--- log tail ---\n{tail}"
        write_status(job_id, "failed", 100, error=error_message)


# ── routes ────────────────────────────────────────────────────────────────


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/jobs", response_model=CreateJobResponse, dependencies=[Depends(require_api_key)])
def create_job(body: CreateJobRequest) -> CreateJobResponse:
    if not body.audioUrl:
        raise HTTPException(status_code=400, detail="audioUrl is required")

    face_url = body.sourceVideoUrl or body.avatarImageUrl
    if not face_url:
        raise HTTPException(
            status_code=400, detail="sourceVideoUrl or avatarImageUrl is required"
        )

    job_id = uuid.uuid4().hex
    jdir = job_dir(job_id)
    jdir.mkdir(parents=True, exist_ok=True)

    write_status(job_id, "queued", 0)

    thread = threading.Thread(
        target=run_job,
        args=(job_id, body.audioUrl, face_url, body.options or {}),
        daemon=True,
    )
    _WORKER_THREADS.append(thread)
    thread.start()

    return CreateJobResponse(jobId=job_id, status="queued")


@app.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    dependencies=[Depends(require_api_key)],
)
def get_job(job_id: str) -> JobStatusResponse:
    if not job_dir(job_id).is_dir():
        raise HTTPException(status_code=404, detail="job not found")

    if not status_path(job_id).exists():
        raise HTTPException(status_code=404, detail="job not found")

    state = read_status(job_id)
    status = state.get("status", "queued")
    output_url = None
    if status == "completed":
        output_url = f"{PUBLIC_BASE_URL}/files/{job_id}.mp4"

    return JobStatusResponse(
        jobId=job_id,
        status=status,
        progress=int(state.get("progress", 0)),
        outputVideoUrl=output_url,
        error=state.get("error"),
        metadata=state.get("metadata") or {},
    )


@app.get("/files/{job_id}.mp4")
def get_output_file(job_id: str) -> FileResponse:
    # Sanitize the path param before touching the filesystem to prevent
    # traversal via crafted job ids.
    if not JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=404, detail="not found")

    output_path = job_dir(job_id) / "output.mp4"
    if not output_path.is_file():
        raise HTTPException(status_code=404, detail="not found")

    return FileResponse(str(output_path), media_type="video/mp4")
