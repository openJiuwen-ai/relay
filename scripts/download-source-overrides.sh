#!/usr/bin/env bash

#
# Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
#


# Shared download source override helpers for Bash install/start scripts.
# Explicit user input only; no automatic fallback policy here.

ARG_OFFICE_CLAW_NPM_REGISTRY="${ARG_OFFICE_CLAW_NPM_REGISTRY:-}"
ARG_OFFICE_CLAW_PIP_INDEX_URL="${ARG_OFFICE_CLAW_PIP_INDEX_URL:-}"
ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL="${ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}"
ARG_OFFICE_CLAW_HF_ENDPOINT="${ARG_OFFICE_CLAW_HF_ENDPOINT:-}"

parse_manual_download_source_arg() {
  case "${1:-}" in
    --npm-registry=*)
      ARG_OFFICE_CLAW_NPM_REGISTRY="${1#*=}"
      return 0
      ;;
    --pip-index-url=*)
      ARG_OFFICE_CLAW_PIP_INDEX_URL="${1#*=}"
      return 0
      ;;
    --pip-extra-index-url=*)
      ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL="${1#*=}"
      return 0
      ;;
    --hf-endpoint=*)
      ARG_OFFICE_CLAW_HF_ENDPOINT="${1#*=}"
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

apply_manual_download_source_overrides() {
  if [ -n "${ARG_OFFICE_CLAW_NPM_REGISTRY:-}" ]; then
    OFFICE_CLAW_NPM_REGISTRY="${ARG_OFFICE_CLAW_NPM_REGISTRY}"
  fi
  if [ -n "${ARG_OFFICE_CLAW_PIP_INDEX_URL:-}" ]; then
    OFFICE_CLAW_PIP_INDEX_URL="${ARG_OFFICE_CLAW_PIP_INDEX_URL}"
  fi
  if [ -n "${ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}" ]; then
    OFFICE_CLAW_PIP_EXTRA_INDEX_URL="${ARG_OFFICE_CLAW_PIP_EXTRA_INDEX_URL}"
  fi
  if [ -n "${ARG_OFFICE_CLAW_HF_ENDPOINT:-}" ]; then
    OFFICE_CLAW_HF_ENDPOINT="${ARG_OFFICE_CLAW_HF_ENDPOINT}"
  fi

  if [ -n "${OFFICE_CLAW_NPM_REGISTRY:-}" ]; then
    export OFFICE_CLAW_NPM_REGISTRY
    export NPM_CONFIG_REGISTRY="${OFFICE_CLAW_NPM_REGISTRY}"
  fi
  if [ -n "${OFFICE_CLAW_PIP_INDEX_URL:-}" ]; then
    export OFFICE_CLAW_PIP_INDEX_URL
    export PIP_INDEX_URL="${OFFICE_CLAW_PIP_INDEX_URL}"
  fi
  if [ -n "${OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}" ]; then
    export OFFICE_CLAW_PIP_EXTRA_INDEX_URL
    export PIP_EXTRA_INDEX_URL="${OFFICE_CLAW_PIP_EXTRA_INDEX_URL}"
  fi
  if [ -n "${OFFICE_CLAW_HF_ENDPOINT:-}" ]; then
    export OFFICE_CLAW_HF_ENDPOINT
    export HF_ENDPOINT="${OFFICE_CLAW_HF_ENDPOINT}"
  fi
}

print_manual_download_source_summary() {
  [ -n "${OFFICE_CLAW_NPM_REGISTRY:-}" ] && echo "  手动镜像: npm registry=$OFFICE_CLAW_NPM_REGISTRY"
  [ -n "${OFFICE_CLAW_PIP_INDEX_URL:-}" ] && echo "  手动镜像: pip index=$OFFICE_CLAW_PIP_INDEX_URL"
  [ -n "${OFFICE_CLAW_PIP_EXTRA_INDEX_URL:-}" ] && echo "  手动镜像: pip extra-index=$OFFICE_CLAW_PIP_EXTRA_INDEX_URL"
  [ -n "${OFFICE_CLAW_HF_ENDPOINT:-}" ] && echo "  手动镜像: hf endpoint=$OFFICE_CLAW_HF_ENDPOINT"
  true
}
