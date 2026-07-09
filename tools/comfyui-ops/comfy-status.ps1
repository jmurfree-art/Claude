<#
.SYNOPSIS
    Read-only health check for a local ComfyUI instance on 127.0.0.1:8188.
.DESCRIPTION
    PowerShell 5.1 compatible. Does not modify anything.
#>

Write-Host "=== INSTANCES ===" -ForegroundColor Cyan
$conns = Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Host "No process is listening on port 8188."
} else {
    $pids = $conns | Select-Object -Expand OwningProcess -Unique
    foreach ($ownPid in $pids) {
        try {
            $proc = Get-Process -Id $ownPid -ErrorAction Stop
            $wsMb = [math]::Round($proc.WorkingSet64 / 1MB, 1)
            Write-Host ("PID {0}  Name: {1}  WorkingSet: {2} MB" -f $ownPid, $proc.ProcessName, $wsMb)
        } catch {
            Write-Host ("PID {0}  (process info unavailable)" -f $ownPid)
        }
    }
    if ($pids.Count -gt 1) {
        Write-Host ("WARNING: {0} distinct processes are listening on port 8188!" -f $pids.Count) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== API ===" -ForegroundColor Cyan
$apiReachable = $false
try {
    $stats = Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 3
    $apiReachable = $true
    $version = $stats.system.comfyui_version
    if (-not $version) { $version = "unknown" }
    Write-Host ("ComfyUI version: {0}" -f $version)
    if ($stats.devices) {
        foreach ($dev in $stats.devices) {
            $totalGb = [math]::Round($dev.vram_total / 1GB, 2)
            $freeGb = [math]::Round($dev.vram_free / 1GB, 2)
            Write-Host ("Device: {0}  VRAM total: {1} GB  VRAM free: {2} GB" -f $dev.name, $totalGb, $freeGb)
        }
    }
} catch {
    Write-Host "ComfyUI not responding on 8188 (system_stats)." -ForegroundColor Yellow
}

try {
    $queue = Invoke-RestMethod -Uri "http://127.0.0.1:8188/queue" -TimeoutSec 3
    $runningCount = @($queue.queue_running).Count
    $pendingCount = @($queue.queue_pending).Count
    Write-Host ("Queue running: {0}  Queue pending: {1}" -f $runningCount, $pendingCount)
} catch {
    if ($apiReachable) {
        Write-Host "Could not read /queue."
    } else {
        Write-Host "ComfyUI not responding on 8188 (queue)." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== GPU ===" -ForegroundColor Cyan
try {
    $gpuInfo = & nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>$null
    if ($LASTEXITCODE -eq 0 -and $gpuInfo) {
        Write-Host $gpuInfo
    } else {
        Write-Host "nvidia-smi did not return data."
    }
} catch {
    Write-Host "nvidia-smi not available or failed."
}

Write-Host ""
Write-Host "=== SYSTEM RAM ===" -ForegroundColor Cyan
$freeRamGb = 0
try {
    $os = Get-CimInstance Win32_OperatingSystem
    $totalRamGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $freeRamGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    Write-Host ("Total RAM: {0} GB  Free RAM: {1} GB" -f $totalRamGb, $freeRamGb)
} catch {
    Write-Host "Could not read Win32_OperatingSystem."
}

try {
    $pf = Get-CimInstance Win32_PageFileUsage
    foreach ($p in $pf) {
        Write-Host ("Pagefile: {0}  CurrentUsage: {1} MB  AllocatedBaseSize: {2} MB" -f $p.Name, $p.CurrentUsage, $p.AllocatedBaseSize)
    }
} catch {
    Write-Host "Could not read Win32_PageFileUsage."
}

Write-Host ""
Write-Host "=== VERDICT ===" -ForegroundColor Cyan
$instanceCount = 0
if ($conns) { $instanceCount = @($conns | Select-Object -Expand OwningProcess -Unique).Count }

if ($freeRamGb -gt 0 -and $freeRamGb -lt 6) {
    Write-Host "Low RAM headroom - restart ComfyUI before queuing a lip-sync or large video job." -ForegroundColor Yellow
} elseif ($instanceCount -gt 1) {
    Write-Host "Kill extra instances (comfy-launch.bat handles this)." -ForegroundColor Yellow
} else {
    Write-Host "Looks healthy." -ForegroundColor Green
}
