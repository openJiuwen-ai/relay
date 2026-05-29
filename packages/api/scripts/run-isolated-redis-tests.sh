#!/usr/bin/env bash

#
# Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
#

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

REPEAT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repeat)
      if [[ $# -lt 2 ]]; then
        echo "[redis-test] --repeat requires a positive integer" >&2
        exit 2
      fi
      REPEAT="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if ! [[ "$REPEAT" =~ ^[1-9][0-9]*$ ]]; then
  echo "[redis-test] invalid --repeat value: $REPEAT" >&2
  exit 2
fi

if ! command -v redis-server >/dev/null 2>&1; then
  echo "[redis-test] redis-server not found. Install Redis first." >&2
  exit 127
fi

CMD=("pnpm" "test")
if [[ $# -gt 0 ]]; then
  CMD=("$@")
fi

DATADIR="$(mktemp -d -t office-claw-redis-test.XXXXXX)"
PIDFILE="${DATADIR}/redis.pid"
LOGFILE="${DATADIR}/redis.log"

cleanup() {
  if [[ -f "$PIDFILE" ]]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    /bin/rm -f "$PIDFILE"
  fi
  /bin/rm -rf "$DATADIR"
}

trap cleanup EXIT INT TERM

PORT="${REDIS_TEST_PORT:-}"
if [[ -z "$PORT" ]]; then
  for _ in $(seq 1 30); do
    CANDIDATE="$((6300 + RANDOM % 700))"
    if redis-server \
      --port "$CANDIDATE" \
      --dir "$DATADIR" \
      --dbfilename dump.rdb \
      --save "" \
      --appendonly no \
      --daemonize yes \
      --pidfile "$PIDFILE" \
      --logfile "$LOGFILE" >/dev/null 2>&1; then
      PORT="$CANDIDATE"
      break
    fi
  done
else
  redis-server \
    --port "$PORT" \
    --dir "$DATADIR" \
    --dbfilename dump.rdb \
    --save "" \
    --appendonly no \
    --daemonize yes \
    --pidfile "$PIDFILE" \
    --logfile "$LOGFILE"
fi

if [[ -z "$PORT" ]]; then
  echo "[redis-test] failed to allocate an isolated redis port" >&2
  if [[ -f "$LOGFILE" ]]; then
    echo "[redis-test] redis log:" >&2
    cat "$LOGFILE" >&2
  fi
  exit 1
fi

if command -v redis-cli >/dev/null 2>&1; then
  READY=0
  for _ in $(seq 1 50); do
    if redis-cli -h 127.0.0.1 -p "$PORT" ping >/dev/null 2>&1; then
      READY=1
      break
    fi
    sleep 0.1
  done
  if [[ "$READY" -ne 1 ]]; then
    echo "[redis-test] redis failed to become ready on port ${PORT}" >&2
    if [[ -f "$LOGFILE" ]]; then
      echo "[redis-test] redis log:" >&2
      cat "$LOGFILE" >&2
    fi
    exit 1
  fi
else
  sleep 0.2
fi

export REDIS_URL="redis://127.0.0.1:${PORT}/15"
export OFFICE_CLAW_REDIS_TEST_ISOLATED=1

cd "$API_DIR"

echo "[redis-test] isolated redis started: ${REDIS_URL}"
for RUN in $(seq 1 "$REPEAT"); do
  echo "[redis-test] run ${RUN}/${REPEAT}: ${CMD[*]}"
  "${CMD[@]}"
done
