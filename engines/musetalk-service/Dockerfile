# MuseTalk inference microservice.
#
# Base image matches MuseTalk's documented stack: Python 3.10, CUDA, PyTorch 2.0.1.
FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ── MuseTalk repo + its own inference dependencies ───────────────────────
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk /opt/MuseTalk

WORKDIR /opt/MuseTalk

# NOTE: MuseTalk's requirements.txt alone is not always sufficient -- some
# dependencies (notably mmcv, which needs the matching CUDA/torch build) may
# require the exact install steps in the upstream README rather than a plain
# `pip install`. Check https://github.com/TMElyralab/MuseTalk#installation
# and adjust this block if inference fails with an mmcv/mmpose import error.
RUN pip install --no-cache-dir -r requirements.txt

# ── model weights ──────────────────────────────────────────────────────
# Weights are ~10GB and change rarely, so baking them into the image is
# usually the wrong tradeoff. Two options:
#
#   1. (default, used by docker-compose.yml) Mount a host directory at
#      /opt/MuseTalk/models containing weights already downloaded via
#      `sh ./download_weights.sh` on the host or in a one-off container.
#
#   2. Bake them into the image instead -- uncomment the RUN below. This
#      makes the image self-contained but large and slow to build/push.
#
# RUN sh ./download_weights.sh

# ── service layer ─────────────────────────────────────────────────────
WORKDIR /srv
COPY requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt
COPY app.py /srv/app.py

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
