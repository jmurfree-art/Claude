#!/usr/bin/env bash
# WatchDeck self-check: install, build, lint, test, then boot the app and
# drive scripts/selfcheck.mjs against it. Writes selfcheck-report.txt at the
# repo root and exits non-zero if anything genuinely fails (BLOCKED items,
# e.g. missing Supabase/YouTube access in a sandbox, do not fail the run).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

LOG_DIR="$(mktemp -d)"
REPORT_FILE="${ROOT_DIR}/selfcheck-report.txt"
SERVER_PID=""
SELFCHECK_MODE="${SELFCHECK_MODE:-mock}"

STEP_NAMES=()
STEP_STATUS=()
STEP_LOGS=()

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

log_path_for() {
  local safe
  safe="$(echo "$1" | tr -c 'A-Za-z0-9' '_')"
  echo "${LOG_DIR}/${safe}.log"
}

# run_step NAME CMD...  — runs CMD, tees combined output to a per-step log,
# and records PASS/FAIL for the final report. Never aborts the script.
run_step() {
  local step_name="$1"
  shift
  local log_file
  log_file="$(log_path_for "${step_name}")"
  echo ""
  echo "==> ${step_name}"
  if "$@" > >(tee "${log_file}") 2> >(tee -a "${log_file}" >&2); then
    STEP_NAMES+=("${step_name}")
    STEP_STATUS+=("PASS")
    STEP_LOGS+=("${log_file}")
    return 0
  else
    STEP_NAMES+=("${step_name}")
    STEP_STATUS+=("FAIL")
    STEP_LOGS+=("${log_file}")
    return 1
  fi
}

NODE_VERSION="$(node --version 2>/dev/null || echo 'not found')"
PNPM_VERSION="$(pnpm --version 2>/dev/null || echo 'not found')"

# --- pnpm install (frozen lockfile, falling back to a plain install) -------
INSTALL_LOG="$(log_path_for 'pnpm install')"
echo ""
echo "==> pnpm install"
if pnpm install --frozen-lockfile > >(tee "${INSTALL_LOG}") 2> >(tee -a "${INSTALL_LOG}" >&2); then
  STEP_NAMES+=("pnpm install"); STEP_STATUS+=("PASS"); STEP_LOGS+=("${INSTALL_LOG}")
else
  {
    echo "--- frozen-lockfile install failed, retrying with a plain install ---"
  } >> "${INSTALL_LOG}"
  if pnpm install > >(tee -a "${INSTALL_LOG}") 2> >(tee -a "${INSTALL_LOG}" >&2); then
    STEP_NAMES+=("pnpm install"); STEP_STATUS+=("PASS"); STEP_LOGS+=("${INSTALL_LOG}")
  else
    STEP_NAMES+=("pnpm install"); STEP_STATUS+=("FAIL"); STEP_LOGS+=("${INSTALL_LOG}")
  fi
fi

run_step "pnpm build" pnpm build
run_step "pnpm lint" pnpm lint
run_step "pnpm test" pnpm test

# --- selfcheck fixtures / mode ---------------------------------------------
node scripts/make-test-mp4.mjs

if [ "${SELFCHECK_MODE}" = "mock" ]; then
  export YTDLP_MOCK=1
fi
export SELFCHECK_MODE

if [ -f "${ROOT_DIR}/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env.local"
  set +a
fi

YTDLP_VERSION="mock (scripts/mock-yt-dlp.mjs)"
if [ "${SELFCHECK_MODE}" = "live" ]; then
  YTDLP_VERSION="$("${YTDLP_BIN:-yt-dlp}" --version 2>/dev/null || echo 'not found')"
fi

# --- boot the server and run the harness ------------------------------------
SERVER_LOG="$(log_path_for 'server')"
echo ""
echo "==> starting server on :3111 (SELFCHECK_MODE=${SELFCHECK_MODE})"
pnpm exec next start -p 3111 > "${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

READY=0
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:3111/" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

SELFCHECK_EXIT=1
SELFCHECK_OUT="$(log_path_for 'selfcheck')"
SELFCHECK_JSON_LINE=""

if [ "${READY}" -eq 1 ]; then
  node scripts/selfcheck.mjs "http://localhost:3111" > "${SELFCHECK_OUT}" 2>&1
  SELFCHECK_EXIT=$?
  SELFCHECK_JSON_LINE="$(grep '^SELFCHECK_JSON:' "${SELFCHECK_OUT}" || true)"
else
  echo "server did not become ready on :3111 within 60s" > "${SELFCHECK_OUT}"
fi

cleanup
SERVER_PID=""

# --- decide whether the JSON checklist has any FAIL -------------------------
JSON_HAS_FAIL="no"
if [ -n "${SELFCHECK_JSON_LINE}" ]; then
  JSON_HAS_FAIL="$(node -e '
    const line = process.argv[1].replace(/^SELFCHECK_JSON:/, "");
    let items = [];
    try { items = JSON.parse(line); } catch { items = []; }
    console.log(items.some((i) => i.status === "FAIL") ? "yes" : "no");
  ' "${SELFCHECK_JSON_LINE}")"
fi

# --- compose the report -----------------------------------------------------
{
  echo "WatchDeck self-check report"
  echo "Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "Mode: ${SELFCHECK_MODE}"
  echo "Node: ${NODE_VERSION}"
  echo "pnpm: ${PNPM_VERSION}"
  echo "yt-dlp: ${YTDLP_VERSION}"
  echo ""
  echo "Toolchain steps:"
  for idx in "${!STEP_NAMES[@]}"; do
    step_name="${STEP_NAMES[$idx]}"
    step_status="${STEP_STATUS[$idx]}"
    if [ "${step_status}" = "PASS" ]; then
      echo "  ✅ PASS  ${step_name}"
    else
      echo "  ❌ FAIL  ${step_name}"
      echo "     --- last 30 lines of '${step_name}' log ---"
      tail -n 30 "${STEP_LOGS[$idx]}" | sed 's/^/     /'
    fi
  done
  echo ""
  echo "Runtime checks (server on :3111 + scripts/selfcheck.mjs):"
  if [ "${READY}" -ne 1 ]; then
    echo "  ❌ FAIL  server did not become ready on :3111 within 60s"
    echo "     --- last 30 lines of server log ---"
    tail -n 30 "${SERVER_LOG}" | sed 's/^/     /'
  elif [ -n "${SELFCHECK_JSON_LINE}" ]; then
    node -e '
      const line = process.argv[1].replace(/^SELFCHECK_JSON:/, "");
      let items = [];
      try { items = JSON.parse(line); } catch { items = []; }
      const icon = { PASS: "✅", FAIL: "❌", BLOCKED: "⏭" };
      for (const it of items) {
        console.log(`  ${icon[it.status] ?? "?"} ${it.status}  ${it.name} — ${it.detail}`);
      }
    ' "${SELFCHECK_JSON_LINE}"
    if [ "${JSON_HAS_FAIL}" = "yes" ]; then
      echo "     --- last 30 lines of selfcheck.mjs output ---"
      tail -n 30 "${SELFCHECK_OUT}" | sed 's/^/     /'
    fi
  else
    echo "  ❌ FAIL  scripts/selfcheck.mjs did not print a SELFCHECK_JSON line (exit code ${SELFCHECK_EXIT})"
    echo "     --- last 30 lines of selfcheck.mjs output ---"
    tail -n 30 "${SELFCHECK_OUT}" | sed 's/^/     /'
  fi
  echo ""
} > "${REPORT_FILE}"

# --- overall verdict ---------------------------------------------------------
OVERALL="PASS"
for step_status in "${STEP_STATUS[@]:-}"; do
  if [ "${step_status}" = "FAIL" ]; then
    OVERALL="FAIL"
  fi
done
if [ "${READY}" -ne 1 ]; then
  OVERALL="FAIL"
elif [ -z "${SELFCHECK_JSON_LINE}" ] || [ "${JSON_HAS_FAIL}" = "yes" ]; then
  OVERALL="FAIL"
fi

echo "Overall verdict: ${OVERALL}" >> "${REPORT_FILE}"

cat "${REPORT_FILE}"

if [ "${OVERALL}" = "FAIL" ]; then
  exit 1
fi
exit 0
