"""MuseTalk inference microservice.

Wraps https://github.com/TMElyralab/MuseTalk behind the jobs HTTP contract
shared by every avatar-engine microservice in the parent app
(see lib/avatar-engines/http-engine.ts):

    POST /jobs        -> { jobId, status }
    GET  /jobs/{id}   -> { jobId, status, progress, outputVideoUrl, error, metadata }

All job state lives on disk under WORK_DIR/{jobId}/ so the service can be
restarted without losing track of in-flight or completed jobs. There is no
in-memory job table (other than the list of background worker threads kept
alive for the lifetime of the process).
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
import yaml
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# ── configuration ────────────────────────────────────────────────────────

MUSETALK_REPO_DIR = Path(os.environ.get("MUSETALK_REPO_DIR", "/opt/MuseTalk"))
WORK_DIR = Path(os.environ.get("WORK_DIR", "/data/jobs"))
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:9103").rstrip("/")
API_KEY = os.environ.get("MUSETALK_SERVICE_API_KEY")  # optional bearer token

WORK_DIR.mkdir(parents=True, exist_ok=True)

JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")

# Keep references to background worker threads so they aren't garbage
# collected mid-run. Disk (status.json) remains the source of truth, not
# this list.
_WORKER_THREADS: list[threading.Thread] = []

app = FastAPI(title="MuseTalk inference service")


# ── auth ─────────────────────────────────────────────────────────────────


def require_api_key(request: Request) -> None:
    """Enforce `Authorization: Bearer <key>` when MUSETALK_SERVICE_API_KEY is set."""
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


# ── inference worker ──────────────────────────────────────────────────────


def find_output_mp4(result_dir: Path) -> Optional[Path]:
    """Locate the single .mp4 produced by MuseTalk under result_dir (recursive)."""
    candidates = sorted(result_dir.rglob("*.mp4"))
    return candidates[0] if candidates else None


def run_job(
    job_id: str,
    audio_url: str,
    face_url: str,
) -> None:
    """Background worker: download inputs, run MuseTalk, publish results.

    All progress/errors are written to status.json so GET /jobs/{id} always
    reflects the latest known state, even across a service restart.
    """
    jdir = job_dir(job_id)
    log_path = jdir / "log.txt"

    try:
        write_status(job_id, "processing", 5)

        # (a) download audio + face source
        audio_path = download_to(audio_url, jdir, "audio", ".wav")
        face_path = download_to(face_url, jdir, "face", ".mp4")

        write_status(job_id, "processing", 10)

        # (b) write the MuseTalk inference config
        config = {
            "task_0": {
                "video_path": str(face_path),
                "audio_path": str(audio_path),
            }
        }
        config_path = jdir / "config.yaml"
        config_path.write_text(yaml.safe_dump(config, sort_keys=False))

        # (c) run inference
        result_dir = jdir / "results"
        result_dir.mkdir(parents=True, exist_ok=True)
        write_status(job_id, "processing", 30)

        cmd = [
            "python",
            "-m",
            "scripts.inference",
            "--inference_config",
            str(config_path),
            "--result_dir",
            str(result_dir),
            "--unet_model_path",
            "models/musetalkV15/unet.pth",
            "--unet_config",
            "models/musetalkV15/musetalk.json",
            "--version",
            "v15",
        ]

        with open(log_path, "wb") as log_file:
            proc = subprocess.run(
                cmd,
                cwd=str(MUSETALK_REPO_DIR),
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )

        if proc.returncode != 0:
            raise RuntimeError(f"inference exited with code {proc.returncode}")

        # (d) locate and copy the produced video
        produced = find_output_mp4(result_dir)
        if produced is None:
            raise RuntimeError("inference completed but no .mp4 was found in result_dir")

        output_path = jdir / "output.mp4"
        output_path.write_bytes(produced.read_bytes())

        # (e) done
        write_status(job_id, "completed", 100)

    except Exception as exc:  # noqa: BLE001 - convert any failure into job status
        tail = ""
        if log_path.exists():
            lines = log_path.read_text(errors="replace").splitlines()
            tail = "\n".join(lines[-50:])
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
        args=(job_id, body.audioUrl, face_url),
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
    if not JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=404, detail="not found")

    output_path = job_dir(job_id) / "output.mp4"
    if not output_path.is_file():
        raise HTTPException(status_code=404, detail="not found")

    return FileResponse(str(output_path), media_type="video/mp4")
