#!/usr/bin/env bash
# ============================================================
# AvatarStudio launcher (macOS / Linux)
# Installs deps / builds on first run, opens the dashboard in
# your browser, and runs the server in the foreground
# (Ctrl+C to stop).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org and try again."
  exit 1
fi

if [ ! -f .env.local ]; then
  echo ".env.local is missing."
  echo "Copy .env.example to .env.local and fill in your Supabase keys first."
  exit 1
fi

[ -d node_modules ] || { echo "Installing dependencies (first run)..."; npm install; }
[ -d .next ] || { echo "Building AvatarStudio (first run, takes a minute)..."; npm run build; }

URL="http://localhost:3000/dashboard"
(
  sleep 3
  xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || echo "Open $URL in your browser."
) &

echo "Starting AvatarStudio at http://localhost:3000 (Ctrl+C to stop)..."
exec npm run start
