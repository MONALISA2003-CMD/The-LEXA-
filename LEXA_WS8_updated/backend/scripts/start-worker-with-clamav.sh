#!/bin/sh
set -eu

: "${CLAMAV_HOST:=127.0.0.1}"
: "${CLAMAV_PORT:=3310}"
export CLAMAV_HOST CLAMAV_PORT

case "$CLAMAV_HOST" in
  127.0.0.1|localhost) ;;
  *) echo "This image embeds ClamAV and only permits loopback CLAMAV_HOST." >&2; exit 78 ;;
esac

# Keep signatures fresh and fail closed if the initial database cannot be fetched.
freshclam --stdout --verbose
freshclam --daemon --checks=12 --quiet &
FRESHCLAM_PID=$!
clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

cleanup() {
  kill "$CLAMD_PID" "$FRESHCLAM_PID" 2>/dev/null || true
  wait "$CLAMD_PID" "$FRESHCLAM_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=0
for _ in $(seq 1 60); do
  if printf 'zPING\0' | nc -w 1 127.0.0.1 "$CLAMAV_PORT" 2>/dev/null | grep -q PONG; then
    ready=1
    break
  fi
  kill -0 "$CLAMD_PID" 2>/dev/null || { echo 'clamd exited before readiness.' >&2; exit 1; }
  sleep 1
done
[ "$ready" -eq 1 ] || { echo 'clamd readiness timed out; worker will not start.' >&2; exit 1; }

node dist/src/platform/worker.js &
WORKER_PID=$!
wait "$WORKER_PID"
