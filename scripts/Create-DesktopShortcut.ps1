# ============================================================
# Creates an "AvatarStudio" shortcut on your Desktop that runs
# scripts\launch.bat with the app icon.
#
# Run from the repo (right-click > Run with PowerShell, or):
#   powershell -ExecutionPolicy Bypass -File scripts\Create-DesktopShortcut.ps1
# ============================================================

$repo = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "AvatarStudio.lnk"

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $repo "scripts\launch.bat"
$lnk.WorkingDirectory = $repo
$lnk.Description = "Launch AvatarStudio (AI avatar video generator)"

$icon = Join-Path $repo "public\icons\icon.ico"
if (Test-Path $icon) {
    $lnk.IconLocation = "$icon,0"
}

$lnk.Save()
Write-Host "Created $lnkPath" -ForegroundColor Green
Write-Host "Double-click it to build (first run) and launch AvatarStudio."
