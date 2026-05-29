#!/usr/bin/env bash

#
# Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
#

# macOS bundled-release startup script.
#
# Launches Redis + API + Web from the .app bundle's embedded runtimes.
# Equivalent of start-windows.ps1 for macOS.
#
# Environment:
#   OFFICE_CLAW_MACOS_BUNDLED=1  — set by Swift launcher
#   PATH includes tools/node/bin and tools/redis/bin

set -euo pipefail

# ─── Resolve paths ───────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── Configuration ───────────────────────────────────────────────────

# Load .env if present (respect explicit overrides)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
fi

CONFIGURED_API_PORT="${API_SERVER_PORT:-3004}"
CONFIGURED_WEB_PORT="${FRONTEND_PORT:-3003}"
CONFIGURED_REDIS_PORT="${REDIS_PORT:-6399}"

BUNDLED_NODE="$PROJECT_ROOT/tools/node/bin/node"
BUNDLED_REDIS="$PROJECT_ROOT/tools/redis/bin/redis-server"
BUNDLED_REDIS_CLI="$PROJECT_ROOT/tools/redis/bin/redis-cli"

# Data directories (use ~/.office-claw for v1 compatibility)
OFFICE_CLAW_HOME="${OFFICE_CLAW_GLOBAL_CONFIG_ROOT:-$HOME/.office-claw}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-$OFFICE_CLAW_HOME/redis-prod}"
RUNTIME_STATE_DIR="$OFFICE_CLAW_HOME/run/macos"
RUNTIME_STATE_FILE="$RUNTIME_STATE_DIR/runtime-state.json"
LOG_DIR="$OFFICE_CLAW_HOME/logs"

mkdir -p "$REDIS_DATA_DIR" "$RUNTIME_STATE_DIR" "$LOG_DIR"

# PID tracking
MANAGED_PIDS=()
STARTED_REDIS=false
CLEANUP_RUNNING=false

# ─── Helpers ─────────────────────────────────────────────────────────

log() { echo -e "$(date '+%H:%M:%S') $*"; }

is_port_available() {
    ! nc -z 127.0.0.1 "$1" 2>/dev/null
}

find_available_port() {
    local exclude=("$@")
    local attempts=0
    while [ "$attempts" -lt 64 ]; do
        # Pick a random port in the dynamic range 49152-65535
        local port=$(( (RANDOM % 16384) + 49152 ))
        local skip=false
        for ex in "${exclude[@]}"; do
            [ "$port" -eq "$ex" ] && skip=true && break
        done
        [ "$skip" = true ] && { attempts=$((attempts + 1)); continue; }
        if is_port_available "$port"; then
            echo "$port"
            return 0
        fi
        attempts=$((attempts + 1))
    done
    return 1
}

# Find a consecutive port pair: web=N, api=N+1 (frontend derives API as port+1)
find_web_api_port_pair() {
    local exclude=("$@")
    local attempts=0
    while [ "$attempts" -lt 64 ]; do
        local web_port=$(( (RANDOM % 16383) + 49152 ))
        local api_port=$(( web_port + 1 ))
        local skip=false
        for ex in "${exclude[@]}"; do
            { [ "$web_port" -eq "$ex" ] || [ "$api_port" -eq "$ex" ]; } && skip=true && break
        done
        [ "$skip" = true ] && { attempts=$((attempts + 1)); continue; }
        if is_port_available "$web_port" && is_port_available "$api_port"; then
            echo "$web_port $api_port"
            return 0
        fi
        attempts=$((attempts + 1))
    done
    return 1
}

# Random port selection: enabled by default in bundled mode (mirrors Windows behavior)
truthy_env() {
    case "${1:-}" in 1|true|yes|on) return 0;; esac
    return 1
}
falsy_env() {
    case "${1:-}" in 0|false|no|off) return 0;; esac
    return 1
}
PREFER_RANDOM_PORTS=false
if [ "${OFFICE_CLAW_MACOS_BUNDLED:-}" = "1" ] && ! falsy_env "${OFFICE_CLAW_MACOS_RANDOM_PORTS:-}"; then
    PREFER_RANDOM_PORTS=true
fi
if truthy_env "${OFFICE_CLAW_MACOS_RANDOM_PORTS:-}"; then
    PREFER_RANDOM_PORTS=true
fi

USE_RANDOM_WEB_API=$( [ "$PREFER_RANDOM_PORTS" = true ] && [ "$CONFIGURED_WEB_PORT" = "3003" ] && [ "$CONFIGURED_API_PORT" = "3004" ] && echo true || echo false )
USE_RANDOM_REDIS=$( [ "$PREFER_RANDOM_PORTS" = true ] && [ "$CONFIGURED_REDIS_PORT" = "6399" ] && echo true || echo false )

if [ "$USE_RANDOM_WEB_API" = true ]; then
    PORT_PAIR=$(find_web_api_port_pair "$CONFIGURED_WEB_PORT" "$CONFIGURED_API_PORT" "$CONFIGURED_REDIS_PORT") || { log "${RED}Cannot find available web+api port pair${NC}"; exit 1; }
    WEB_PORT="${PORT_PAIR% *}"
    API_PORT="${PORT_PAIR#* }"
    log "${YELLOW}  Using random ports: web=$WEB_PORT api=$API_PORT (api=web+1)${NC}"
else
    WEB_PORT="$CONFIGURED_WEB_PORT"
    API_PORT="$CONFIGURED_API_PORT"
fi

if [ "$USE_RANDOM_REDIS" = true ]; then
    REDIS_PORT=$(find_available_port "$WEB_PORT" "$API_PORT" "$CONFIGURED_REDIS_PORT") || { log "${RED}Cannot find available Redis port${NC}"; exit 1; }
else
    REDIS_PORT="$CONFIGURED_REDIS_PORT"
fi

write_runtime_state() {
    cat > "$RUNTIME_STATE_FILE" <<JSONEOF
{
  "FRONTEND_PORT": $WEB_PORT,
  "API_SERVER_PORT": $API_PORT,
  "REDIS_PORT": $REDIS_PORT,
  "REDIS_URL": "redis://localhost:$REDIS_PORT",
  "pid": $$,
  "startedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
JSONEOF
}

wait_for_port() {
    local port="$1" label="$2" timeout="${3:-30}"
    local elapsed=0
    while ! nc -z 127.0.0.1 "$port" 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
            log "${RED}  ✗ $label failed to start on port $port (timeout ${timeout}s)${NC}"
            return 1
        fi
    done
    log "${GREEN}  ✓ $label ready (port $port)${NC}"
}

# ─── Cleanup ─────────────────────────────────────────────────────────

cleanup() {
    [ "$CLEANUP_RUNNING" = true ] && return 0
    CLEANUP_RUNNING=true
    API_WATCHDOG_STOP=true

    log "Shutting down services..."

    # Kill managed child processes
    for pid in "${MANAGED_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Stop Redis if we started it
    if [ "$STARTED_REDIS" = true ] && "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" ping &>/dev/null 2>&1; then
        "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" shutdown save &>/dev/null || true
        log "  Redis (port $REDIS_PORT) stopped."
    fi

    rm -f "$RUNTIME_STATE_FILE"

    wait 2>/dev/null || true
    log "Goodbye!"
}

trap cleanup EXIT INT TERM

# ─── Preflight checks ───────────────────────────────────────────────

log "${GREEN}=== OfficeClaw macOS Bundled Startup ===${NC}"

if [ ! -x "$BUNDLED_NODE" ]; then
    log "${RED}  ✗ Bundled Node.js not found at $BUNDLED_NODE${NC}"
    exit 1
fi

NODE_VERSION=$("$BUNDLED_NODE" --version)
log "  Node.js: $NODE_VERSION"

if [ ! -x "$BUNDLED_REDIS" ]; then
    log "${RED}  ✗ Bundled Redis not found at $BUNDLED_REDIS${NC}"
    exit 1
fi

REDIS_VERSION=$("$BUNDLED_REDIS" --version | head -1)
log "  Redis: $REDIS_VERSION"

# ─── First-boot: apply modelarts preset if not done yet ──────────────

PRESET_FILE="$PROJECT_ROOT/modelarts-preset.json"
CATALOG_FILE="$PROJECT_ROOT/.office-claw/office-claw-catalog.json"
INSTALLER_SCRIPT="$PROJECT_ROOT/scripts/install-auth-config.mjs"

if [ -f "$PRESET_FILE" ] && [ -f "$INSTALLER_SCRIPT" ]; then
    # Run preset if catalog doesn't exist or has more breeds than preset defines
    NEED_PRESET=false
    if [ ! -f "$CATALOG_FILE" ]; then
        NEED_PRESET=true
    else
        PRESET_COUNT=$("$BUNDLED_NODE" -e "const p=require('$PRESET_FILE'); console.log((p.members||[]).length)" 2>/dev/null || echo 0)
        CATALOG_COUNT=$("$BUNDLED_NODE" -e "const c=require('$CATALOG_FILE'); console.log((c.breeds||[]).length)" 2>/dev/null || echo 0)
        [ "$CATALOG_COUNT" -gt "$PRESET_COUNT" ] 2>/dev/null && NEED_PRESET=true
    fi
    if [ "$NEED_PRESET" = true ]; then
        log "  Applying modelarts preset (first boot)..."
        "$BUNDLED_NODE" "$INSTALLER_SCRIPT" modelarts-preset apply --project-dir "$PROJECT_ROOT" 2>/dev/null || true
        log "${GREEN}  ✓ Preset applied${NC}"
    fi
fi

# ─── Start Redis ─────────────────────────────────────────────────────

log "Starting Redis (port $REDIS_PORT)..."

if "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" ping &>/dev/null 2>&1; then
    log "${GREEN}  ✓ Redis already running (port $REDIS_PORT)${NC}"
else
    "$BUNDLED_REDIS" \
        --port "$REDIS_PORT" \
        --bind 127.0.0.1 \
        --dir "$REDIS_DATA_DIR" \
        --dbfilename "dump.rdb" \
        --save "3600 1 300 100 60 10000" \
        --appendonly yes \
        --appendfilename "appendonly.aof" \
        --appendfsync everysec \
        --daemonize yes \
        --pidfile "$REDIS_DATA_DIR/redis-$REDIS_PORT.pid" \
        --logfile "$LOG_DIR/redis-$REDIS_PORT.log" \
        >/dev/null 2>&1

    sleep 1
    if "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" ping &>/dev/null 2>&1; then
        log "${GREEN}  ✓ Redis started (port $REDIS_PORT)${NC}"
        STARTED_REDIS=true
    else
        log "${RED}  ✗ Redis failed to start${NC}"
        exit 1
    fi
fi

export REDIS_URL="redis://localhost:$REDIS_PORT"
export REDIS_PORT

# ─── Start API Server ───────────────────────────────────────────────

log "Starting API Server (port $API_PORT)..."

export API_SERVER_PORT="$API_PORT"
export FRONTEND_PORT="$WEB_PORT"
export NODE_ENV=production

API_DIST="$PROJECT_ROOT/packages/api/dist/cli.js"
if [ ! -f "$API_DIST" ]; then
    log "${RED}  ✗ API dist not found: $API_DIST${NC}"
    exit 1
fi

# Watchdog: restart API server on abnormal exit (e.g. Redis reconnect failure after sleep/wake).
# Exits without restart only when the server finishes cleanly (exit code 0).
API_WATCHDOG_STOP=false
start_api_watchdog() {
    local restart_count=0
    local max_restarts=5
    while [ "$API_WATCHDOG_STOP" = false ] && [ "$restart_count" -lt "$max_restarts" ]; do
        "$BUNDLED_NODE" "$API_DIST" >> "$LOG_DIR/api-server.log" 2>&1
        local exit_code=$?
        [ "$API_WATCHDOG_STOP" = true ] && break
        if [ "$exit_code" -eq 0 ]; then
            # Clean shutdown (SIGTERM/SIGINT from the parent cleanup) — do not restart.
            break
        fi
        restart_count=$((restart_count + 1))
        log "${YELLOW}  API server exited (code $exit_code), restarting in 3s ($restart_count/$max_restarts)...${NC}"
        sleep 3
    done
}
start_api_watchdog &
MANAGED_PIDS+=($!)

wait_for_port "$API_PORT" "API Server" 20 || exit 1

# ─── Start Web Frontend ─────────────────────────────────────────────

log "Starting Frontend (port $WEB_PORT)..."

WEB_SERVER="$PROJECT_ROOT/packages/web/server.cjs"
if [ ! -f "$WEB_SERVER" ]; then
    log "${RED}  ✗ Web server.cjs not found: $WEB_SERVER${NC}"
    exit 1
fi

PORT="$WEB_PORT" "$BUNDLED_NODE" "$WEB_SERVER" \
    >> "$LOG_DIR/web-frontend.log" 2>&1 &
MANAGED_PIDS+=($!)

wait_for_port "$WEB_PORT" "Frontend" 30 || exit 1

# ─── Write runtime state ────────────────────────────────────────────

write_runtime_state

log ""
log "${GREEN}=== OfficeClaw is running ===${NC}"
log "  Frontend: http://localhost:$WEB_PORT"
log "  API:      http://localhost:$API_PORT"
log "  Redis:    redis://localhost:$REDIS_PORT"
log "  Data:     $REDIS_DATA_DIR"
log ""

# Keep script alive — wait for child processes
wait
