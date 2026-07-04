#!/usr/bin/env bash
# ============================================================
# Creates a desktop launcher for AvatarStudio.
# - Linux: writes a .desktop entry to your Desktop
# - macOS: symlinks launch.sh onto the Desktop (or drag
#   scripts/launch.sh into the Dock)
# ============================================================
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$repo/scripts/launch.sh"

case "$(uname -s)" in
  Linux)
    desktop_dir="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
    mkdir -p "$desktop_dir"
    entry="$desktop_dir/avatarstudio.desktop"
    cat > "$entry" <<EOF
[Desktop Entry]
Type=Application
Name=AvatarStudio
Comment=Launch AvatarStudio (AI avatar video generator)
Exec=$repo/scripts/launch.sh
Icon=$repo/public/icons/icon.svg
Terminal=true
Categories=AudioVideo;Video;
EOF
    chmod +x "$entry"
    # GNOME requires marking the launcher trusted before first use.
    command -v gio >/dev/null 2>&1 && gio set "$entry" metadata::trusted true 2>/dev/null || true
    echo "Created $entry"
    ;;
  Darwin)
    ln -sf "$repo/scripts/launch.sh" "$HOME/Desktop/AvatarStudio"
    echo "Created ~/Desktop/AvatarStudio (double-click to launch)."
    echo "Tip: for a nicer app-like launcher, install the PWA from Chrome instead."
    ;;
  *)
    echo "Unsupported OS. On Windows, run scripts\\Create-DesktopShortcut.ps1"
    exit 1
    ;;
esac
