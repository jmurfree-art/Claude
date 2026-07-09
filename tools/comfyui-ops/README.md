# ComfyUI Ops Kit

Small toolkit for running ComfyUI reliably on this machine: Windows 11, RTX 5070 Ti
(12GB VRAM), 32GB RAM, ComfyUI portable at `C:\ComfyUI_windows_portable`.

## Scripts

### comfy-launch.bat
The single sane way to start ComfyUI. Checks for `ComfyUI\main.py` under
`%COMFYUI_DIR%` (or `C:\ComfyUI_windows_portable` if that variable isn't set),
detects whether an instance is already listening on port 8188, and if so lets
you reuse it, kill it, or quit. Otherwise it starts the server minimized, waits
for it to become ready, and opens your browser to it.

Usage:
```
comfy-launch.bat
```

### comfy-launch.bat lean
Same as above, but adds `--cache-none` for a low-RAM mode. Use this for
lip-sync sessions (LatentSync etc.) where you want minimal RAM usage at the
cost of some re-execution time.

Usage:
```
comfy-launch.bat lean
```

### comfy-status.ps1
Read-only health check. Reports listening instances (and warns if more than
one), API reachability and version/VRAM info, queue state, GPU usage via
nvidia-smi, system RAM and pagefile size, and a plain-language verdict.

Usage:
```
powershell -ExecutionPolicy Bypass -File comfy-status.ps1
```

### comfy-cleanup.ps1
Occasional maintenance. Offers to disable known-broken custom nodes, reports
(but does not touch) model-less nodes, and offers to switch ComfyUI-Manager
to offline mode. Every destructive action is confirmed individually and
anything edited is backed up first (renames are reversible, config.ini gets a
`.bak` copy).

Usage:
```
powershell -ExecutionPolicy Bypass -File comfy-cleanup.ps1
```

## THE MEMORY PLAYBOOK

This machine runs 22B-class video models via offloading on 12GB VRAM / 32GB
RAM. That's tight. Follow this order of operations:

1. **Don't mix workloads.** Restart ComfyUI (takes about 10 seconds via
   `comfy-launch.bat`) between big LTX/Wan video sessions and LatentSync
   lip-sync jobs. Leftover cached models from a previous workload have caused
   "cannot allocate array memory" errors.
2. **Set a fixed pagefile.** In System Properties > Advanced > Performance
   Settings > Advanced > Virtual memory, set a fixed pagefile of
   49152-65536 MB on your fastest SSD. This turns hard allocation crashes into
   slowdowns instead. This is the single highest-value change you can make.
3. **Use lean mode for lip-sync.** `comfy-launch.bat lean` passes
   `--cache-none`, trading some re-execution time for minimal RAM usage.
4. **Let AvatarStudio free memory automatically.** AvatarStudio can free
   ComfyUI memory before each lip-sync job (`COMFYUI_FREE_BEFORE_JOB`, on by
   default) - but a fresh ComfyUI restart is still cleaner than relying on
   this alone.
5. **Check headroom before big jobs.** Run `comfy-status.ps1` first.

## OPTIONAL PERF

The startup log may note that optimized CUDA ops are disabled under the
current pytorch/cu128 build. Upgrading to cu130 (via the portable's own
update scripts) may improve performance on the 5070 Ti, but carries some risk
of breaking custom-node dependencies that pin older torch/cuda versions. Take
a snapshot (copy the whole portable folder, or at minimum
`python_embeded\Lib\site-packages`) before attempting this, and skip it if
things already work well enough.

## TROUBLESHOOTING

| Symptom | Likely cause / fix |
|---|---|
| Port 8188 bind error / server won't start | A second instance is already running. Use `comfy-launch.bat` - it detects and offers to reuse/kill the existing one. |
| "cannot allocate array memory" | Out of RAM/VRAM headroom. See Memory Playbook steps 1-3: restart between workloads, fix the pagefile, use lean mode for lip-sync. |
| Job accepted but the UI canvas doesn't change | Normal for API-submitted jobs - they don't render on the canvas. Check the queue panel or the ComfyUI server terminal window for progress. |
