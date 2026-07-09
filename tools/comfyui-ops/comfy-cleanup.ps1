<#
.SYNOPSIS
    Occasional maintenance for a ComfyUI portable install. All actions are
    reversible, confirmed one at a time, and backed up before editing.
.PARAMETER ComfyDir
    Path to the ComfyUI portable root. Defaults to C:\ComfyUI_windows_portable.
#>
param(
    [string]$ComfyDir = 'C:\ComfyUI_windows_portable'
)

$actionsTaken = @()
$actionsSkipped = @()

function Confirm-Action {
    param([string]$Prompt)
    $resp = Read-Host "$Prompt (y/n)"
    return ($resp -eq 'y' -or $resp -eq 'Y')
}

Write-Host "=== ComfyUI Cleanup: $ComfyDir ===" -ForegroundColor Cyan

# --- Broken custom nodes ---
Write-Host ""
Write-Host "--- Broken custom nodes ---" -ForegroundColor Cyan
$brokenNodes = @('ComfyUI-3D-Pack', 'ComfyUI-RT-LTX2-RareTools', 'comfyui_pilcothink_VisionSLM')
$customNodesDir = Join-Path $ComfyDir 'ComfyUI\custom_nodes'

foreach ($nodeName in $brokenNodes) {
    $nodePath = Join-Path $customNodesDir $nodeName
    $disabledPath = "$nodePath.disabled"

    if (Test-Path $disabledPath) {
        Write-Host "$nodeName is already disabled. Skipping."
        $actionsSkipped += "$nodeName (already disabled)"
        continue
    }

    if (-not (Test-Path $nodePath)) {
        Write-Host "$nodeName not found. Skipping."
        $actionsSkipped += "$nodeName (not found)"
        continue
    }

    if (Confirm-Action "Disable $nodeName? (it fails to import every startup)") {
        try {
            Rename-Item -Path $nodePath -NewName "$nodeName.disabled" -ErrorAction Stop
            Write-Host "Disabled $nodeName. To re-enable, rename '$nodeName.disabled' back to '$nodeName'." -ForegroundColor Green
            $actionsTaken += "Disabled $nodeName"
        } catch {
            Write-Host "Failed to rename $nodeName : $_" -ForegroundColor Red
            $actionsSkipped += "$nodeName (rename failed)"
        }
    } else {
        Write-Host "Skipped $nodeName."
        $actionsSkipped += "$nodeName (user skipped)"
    }
}

# --- Model-less nodes (report only) ---
Write-Host ""
Write-Host "--- Model-less nodes (report only) ---" -ForegroundColor Cyan

$animateDiffModelsDirs = @(
    (Join-Path $customNodesDir 'comfyui-animatediff-evolved\models'),
    (Join-Path $ComfyDir 'ComfyUI\models\animatediff_models')
)
$animateDiffHasFiles = $false
foreach ($d in $animateDiffModelsDirs) {
    if (Test-Path $d) {
        $items = Get-ChildItem -Path $d -File -Recurse -ErrorAction SilentlyContinue
        if ($items -and $items.Count -gt 0) { $animateDiffHasFiles = $true }
    }
}
$animateDiffInstalled = Test-Path (Join-Path $customNodesDir 'comfyui-animatediff-evolved')
if ($animateDiffInstalled -and -not $animateDiffHasFiles) {
    Write-Host "comfyui-animatediff-evolved: installed but has no models: either download models or rename folder to .disabled" -ForegroundColor Yellow
}

$vibeVoiceDir = Join-Path $ComfyDir 'ComfyUI\models\vibevoice'
if (Test-Path $vibeVoiceDir) {
    $vvItems = Get-ChildItem -Path $vibeVoiceDir -File -Recurse -ErrorAction SilentlyContinue
    if (-not $vvItems -or $vvItems.Count -eq 0) {
        Write-Host "VibeVoice: installed but has no models: either download models or rename folder to .disabled" -ForegroundColor Yellow
    }
}

# --- ComfyUI-Manager offline mode ---
Write-Host ""
Write-Host "--- ComfyUI-Manager network mode ---" -ForegroundColor Cyan
$configPath = Join-Path $ComfyDir 'ComfyUI\user\__manager\config.ini'

if (Test-Path $configPath) {
    $configContent = Get-Content -Path $configPath -Raw
    if ($configContent -match 'network_mode\s*=\s*public') {
        if (Confirm-Action "Switch ComfyUI-Manager to offline mode (network_mode = offline)?") {
            $backupPath = "$configPath.bak"
            try {
                Copy-Item -Path $configPath -Destination $backupPath -Force -ErrorAction Stop
                $newContent = $configContent -replace 'network_mode\s*=\s*public', 'network_mode = offline'
                Set-Content -Path $configPath -Value $newContent -ErrorAction Stop
                Write-Host "Switched to offline mode. Backup saved at $backupPath" -ForegroundColor Green
                Write-Host "Note: set network_mode back to public when you want to install/update nodes via Manager."
                $actionsTaken += "Set ComfyUI-Manager network_mode = offline (backup: $backupPath)"
            } catch {
                Write-Host "Failed to update config.ini : $_" -ForegroundColor Red
                $actionsSkipped += "Manager offline mode (write failed)"
            }
        } else {
            Write-Host "Skipped Manager offline mode change."
            $actionsSkipped += "Manager offline mode (user skipped)"
        }
    } else {
        Write-Host "network_mode is not 'public' (or not found as expected) - no change needed."
        $actionsSkipped += "Manager offline mode (not in public mode)"
    }
} else {
    Write-Host "config.ini not found at $configPath - skipping."
    $actionsSkipped += "Manager offline mode (config.ini not found)"
}

# --- Summary ---
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Actions taken:"
if ($actionsTaken.Count -eq 0) {
    Write-Host "  (none)"
} else {
    foreach ($a in $actionsTaken) { Write-Host "  - $a" }
}
Write-Host "Actions skipped:"
if ($actionsSkipped.Count -eq 0) {
    Write-Host "  (none)"
} else {
    foreach ($a in $actionsSkipped) { Write-Host "  - $a" }
}
