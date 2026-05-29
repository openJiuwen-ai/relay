#!/usr/bin/env bash

#
# Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
#

# check-dir-size.sh — 目录文件数防腐化检测
# ADR-010: warn=15, error=25 (.ts files per directory, excluding index.ts and *.d.ts)
# Usage: scripts/check-dir-size.sh [--root <path>] [--exceptions <path>]

set -euo pipefail

# --- Configuration ---
WARN_THRESHOLD=15
ERROR_THRESHOLD=25
ROOT="packages/api/src"
EXCEPTIONS_FILE=".dir-exceptions.json"

# --- Colors ---
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --root) ROOT="$2"; shift 2 ;;
    --exceptions) EXCEPTIONS_FILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# --- Load exceptions into a flat list (one path per line) ---
EXCEPTED_DIRS=""
EXCEPTION_ERRORS=""
if [[ -f "$EXCEPTIONS_FILE" ]]; then
  EXCEPTED_DIRS=$(node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$EXCEPTIONS_FILE', 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    let hasError = false;
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    (data.exceptions || []).forEach((e, i) => {
      if (!e.owner || !e.expiresAt) {
        process.stderr.write('❌ Exception #' + (i+1) + ' (' + (e.path||'?') + '): missing required field (owner=' + !!e.owner + ', expiresAt=' + !!e.expiresAt + ')\n');
        hasError = true;
        return;
      }
      if (!isoDateRe.test(e.expiresAt)) {
        process.stderr.write('❌ Exception #' + (i+1) + ' (' + (e.path||'?') + '): invalid expiresAt format (got \"' + e.expiresAt + '\", expected YYYY-MM-DD)\n');
        hasError = true;
        return;
      }
      if (e.expiresAt >= today) {
        console.log(e.path);
      } else {
        process.stderr.write('⚠ Exception expired: ' + e.path + ' (was ' + e.expiresAt + ')\n');
        hasError = true;
      }
    });
    if (hasError) process.exitCode = 1;
  ")
  if [[ $? -ne 0 ]]; then
    EXCEPTION_ERRORS="1"
  fi
fi

is_excepted() {
  echo "$EXCEPTED_DIRS" | grep -qxF "$1"
}

# --- Scan directories ---
has_error=0
has_warning=0
total_dirs=0

echo ""
echo "📁 Directory Size Check (ADR-010)"
echo "   warn=${WARN_THRESHOLD} | error=${ERROR_THRESHOLD} | root=${ROOT}"
echo "   exceptions: ${EXCEPTIONS_FILE}"
echo ""

while IFS= read -r dir; do
  # Count .ts files excluding index.ts and *.d.ts
  count=0
  for f in "$dir"/*.ts; do
    [[ -f "$f" ]] || continue
    base=$(basename "$f")
    [[ "$base" == "index.ts" ]] && continue
    [[ "$base" == *.d.ts ]] && continue
    count=$((count + 1))
  done

  [[ $count -eq 0 ]] && continue

  total_dirs=$((total_dirs + 1))
  rel_dir="${dir#./}"

  if [[ $count -ge $ERROR_THRESHOLD ]]; then
    if is_excepted "$rel_dir"; then
      echo -e "${GRAY}  ⏳ ${rel_dir}: ${count} files (excepted — pending refactoring)${NC}"
    else
      echo -e "${RED}  ❌ ${rel_dir}: ${count} files (> error=${ERROR_THRESHOLD})${NC}"
      has_error=1
    fi
  elif [[ $count -ge $WARN_THRESHOLD ]]; then
    if is_excepted "$rel_dir"; then
      echo -e "${GRAY}  ⏳ ${rel_dir}: ${count} files (excepted)${NC}"
    else
      echo -e "${YELLOW}  ⚠  ${rel_dir}: ${count} files (> warn=${WARN_THRESHOLD})${NC}"
      has_warning=1
    fi
  else
    echo -e "${GREEN}  ✓  ${rel_dir}: ${count} files${NC}"
  fi
done < <(find "$ROOT" -type d 2>/dev/null | sort)

echo ""
echo "Scanned ${total_dirs} directories with .ts files"

if [[ -n "$EXCEPTION_ERRORS" ]]; then
  echo -e "${RED}FAILED: Invalid or expired exceptions in ${EXCEPTIONS_FILE}. Fix them first.${NC}"
  exit 1
elif [[ $has_error -eq 1 ]]; then
  echo -e "${RED}FAILED: One or more directories exceed error threshold (${ERROR_THRESHOLD}).${NC}"
  echo "Options: (1) Split the directory  (2) Add a time-bound exception to ${EXCEPTIONS_FILE}"
  exit 1
elif [[ $has_warning -eq 1 ]]; then
  echo -e "${YELLOW}WARNING: Some directories exceed warn threshold (${WARN_THRESHOLD}).${NC}"
  echo "Document 'why not split' in your commit message."
  exit 0
else
  echo -e "${GREEN}All directories within thresholds.${NC}"
  exit 0
fi
