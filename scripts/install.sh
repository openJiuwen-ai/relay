#!/usr/bin/env bash

#
# Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
#

# OfficeClaw — Linux Repo-Local Install Helper (F113)
# Usage: bash scripts/install.sh [--start] [--memory] [--registry=URL]
# Supported: Debian/Ubuntu, CentOS/RHEL/Fedora

set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
AUTO_START=false; MEMORY_MODE=false; NPM_REGISTRY=""; SOURCE_ONLY=false
PROJECT_DIR=""; PROJECT_HAS_GIT_METADATA=false
for arg in "$@"; do
    case $arg in
        --start) AUTO_START=true ;; --memory) MEMORY_MODE=true ;;
        --registry=*) NPM_REGISTRY="${arg#*=}" ;;
        --source-only) SOURCE_ONLY=true ;;
    esac
done
# Apply registry if specified (helps in China / behind proxy)
use_registry() {
    local reg="$1"
    # Only export env vars — never write to user-level ~/.npmrc.
    # npm/pnpm respect these env vars for all operations in this session.
    export npm_config_registry="$reg" NPM_CONFIG_REGISTRY="$reg" PNPM_CONFIG_REGISTRY="$reg"
}
[[ -n "$NPM_REGISTRY" ]] && use_registry "$NPM_REGISTRY"
npm_global_install() {
    if [[ -n "$NPM_REGISTRY" ]]; then
        $SUDO env npm_config_registry="$NPM_REGISTRY" NPM_CONFIG_REGISTRY="$NPM_REGISTRY" npm install -g "$@"
    else
        $SUDO npm install -g "$@"
    fi
}

info() { echo -e "${CYAN}$*${NC}"; }; ok() { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }; fail() { echo -e "  ${RED}✗${NC} $*"; }
step() { echo ""; echo -e "${BOLD}$*${NC}"; }
USED_FNM=false
persist_user_bin() {
    local bin="$1" path=""; path="$(command -v "$bin" 2>/dev/null || true)"
    [[ -n "$path" ]] || return 0; $SUDO mkdir -p /usr/local/bin
    $SUDO ln -sfn "$(readlink -f "$path" 2>/dev/null || echo "$path")" "/usr/local/bin/$bin"
}

# TTY-safe read + pnpm install with registry fallback
# Verify /dev/tty is both readable AND writable (prompts write to it too).
# Use a real fd-based probe so HAS_TTY is never true on a broken terminal.
HAS_TTY=false
if [[ -r /dev/tty && -w /dev/tty ]] && tty -s </dev/tty 2>/dev/null; then
    # Open a test fd to /dev/tty and close it — catches containers where the
    # device node exists but open() fails with ENXIO.
    if (exec 9</dev/tty) 2>/dev/null; then HAS_TTY=true; fi
fi
# tty_read:  Print prompt explicitly to /dev/tty (not via read -p which goes
#            to stderr and was swallowed by 2>/dev/null).  Read from /dev/tty
#            with a 120 s timeout to avoid infinite blocking.
#            Guard the /dev/tty redirect with the fd-open probe we already ran
#            for HAS_TTY — callers should check HAS_TTY before calling, but we
#            also defend internally against "Device not configured" on macOS
#            and ENXIO on Linux containers.
tty_read() {
    local prompt="$1" var="$2"
    if [[ "$HAS_TTY" == true ]]; then
        printf '%s' "$prompt" >/dev/tty 2>/dev/null || true
        read -r -t 120 "$var" </dev/tty 2>/dev/null || printf -v "$var" '%s' ''
    else
        printf -v "$var" '%s' ''
    fi
}
tty_read_secret() {
    local prompt="$1" var="$2"
    if [[ "$HAS_TTY" == true ]]; then
        printf '%s' "$prompt" >/dev/tty 2>/dev/null || true
        local input="" char
        while IFS= read -rs -n1 -t 120 char </dev/tty 2>/dev/null; do
            [[ -z "$char" ]] && break  # Enter pressed
            if [[ "$char" == $'\x7f' || "$char" == $'\b' ]]; then
                # Backspace
                if [[ -n "$input" ]]; then
                    input="${input%?}"
                    printf '\b \b' >/dev/tty 2>/dev/null || true
                fi
            else
                input+="$char"
                printf '*' >/dev/tty 2>/dev/null || true
            fi
        done
        printf '\n' >/dev/tty 2>/dev/null || true
        printf -v "$var" '%s' "$input"
    else
        printf -v "$var" '%s' ''
    fi
}

# ── Interactive arrow-key selectors (single-select & multi-select) ────────
# These provide a TUI-style menu: ↑↓ to move, space to toggle, enter to confirm.
# Falls back to plain tty_read when HAS_TTY is false.

# tty_select: Single-select with arrow keys.
#   Usage: tty_select RESULT_VAR "prompt" "option1" "option2" ...
#   Sets RESULT_VAR to the 0-based index of the chosen option (default 0).
tty_select() {
    local result_var="$1" prompt="$2"; shift 2
    local -a options=("$@")
    local count=${#options[@]} cur=0

    if [[ "$HAS_TTY" != true || $count -eq 0 ]]; then
        printf -v "$result_var" '%s' '0'; return
    fi

    # Save terminal state and switch to raw mode
    local saved_tty; saved_tty="$(stty -g </dev/tty 2>/dev/null)"
    printf '\n%s\n' "$prompt" >/dev/tty
    printf '  Use ↑↓ arrows to move, Enter to select\n\n' >/dev/tty

    local i
    for ((i=0; i<count; i++)); do
        if ((i == cur)); then
            printf '  \033[36m❯ %s\033[0m\n' "${options[$i]}" >/dev/tty
        else
            printf '    %s\n' "${options[$i]}" >/dev/tty
        fi
    done

    stty -echo -icanon </dev/tty 2>/dev/null
    trap "stty '${saved_tty}' </dev/tty 2>/dev/null || true; trap - INT TERM EXIT; exit 130" INT TERM
    trap "stty '${saved_tty}' </dev/tty 2>/dev/null || true; trap - INT TERM EXIT" EXIT
    while true; do
        local key
        IFS= read -rsn1 -t 120 key </dev/tty 2>/dev/null || break
        local need_redraw=false
        if [[ "$key" == $'\x1b' ]]; then
            read -rsn2 -t 0.1 key </dev/tty 2>/dev/null || true
            case "$key" in
                '[A') ((cur > 0)) && ((cur--)) || true; need_redraw=true ;;
                '[B') ((cur < count-1)) && ((cur++)) || true; need_redraw=true ;;
            esac
        elif [[ "$key" == '' ]]; then
            break
        fi
        [[ "$need_redraw" == true ]] || continue
        printf '\033[%dA' "$count" >/dev/tty
        for ((i=0; i<count; i++)); do
            printf '\r\033[K' >/dev/tty
            if ((i == cur)); then
                printf '  \033[36m❯ %s\033[0m\n' "${options[$i]}" >/dev/tty
            else
                printf '    %s\n' "${options[$i]}" >/dev/tty
            fi
        done
    done
    stty "$saved_tty" </dev/tty 2>/dev/null || true
    trap - INT TERM EXIT
    printf -v "$result_var" '%s' "$cur"
}

# tty_multiselect: Multi-select with arrow keys + space to toggle.
#   Usage: tty_multiselect RESULT_VAR "prompt" "option1" "option2" ...
#   Sets RESULT_VAR to comma-separated 0-based indices of selected options.
#   All options are pre-selected by default.
tty_multiselect() {
    local result_var="$1" prompt="$2"; shift 2
    local -a options=("$@")
    local count=${#options[@]} cur=0

    if [[ "$HAS_TTY" != true || $count -eq 0 ]]; then
        local all_indices=""
        local i
        for ((i=0; i<count; i++)); do
            [[ -n "$all_indices" ]] && all_indices+=","
            all_indices+="$i"
        done
        printf -v "$result_var" '%s' "$all_indices"; return
    fi

    local -a selected=()
    local i
    for ((i=0; i<count; i++)); do selected+=("1"); done

    local saved_tty; saved_tty="$(stty -g </dev/tty 2>/dev/null)"
    printf '\n%s\n' "$prompt" >/dev/tty
    printf '  Use ↑↓ to move, Space to toggle, Enter to confirm\n\n' >/dev/tty

    for ((i=0; i<count; i++)); do
        local marker="◉"; [[ "${selected[$i]}" != "1" ]] && marker="○"
        if ((i == cur)); then
            printf '  \033[36m❯ %s %s\033[0m\n' "$marker" "${options[$i]}" >/dev/tty
        else
            printf '    %s %s\n' "$marker" "${options[$i]}" >/dev/tty
        fi
    done

    stty -echo -icanon </dev/tty 2>/dev/null
    trap "stty '${saved_tty}' </dev/tty 2>/dev/null || true; trap - INT TERM EXIT; exit 130" INT TERM
    trap "stty '${saved_tty}' </dev/tty 2>/dev/null || true; trap - INT TERM EXIT" EXIT
    while true; do
        local key
        IFS= read -rsn1 -t 120 key </dev/tty 2>/dev/null || break
        local need_redraw=false
        if [[ "$key" == $'\x1b' ]]; then
            read -rsn2 -t 0.1 key </dev/tty 2>/dev/null || true
            case "$key" in
                '[A') ((cur > 0)) && ((cur--)) || true; need_redraw=true ;;
                '[B') ((cur < count-1)) && ((cur++)) || true; need_redraw=true ;;
            esac
        elif [[ "$key" == ' ' ]]; then
            if [[ "${selected[$cur]}" == "1" ]]; then selected[$cur]="0"; else selected[$cur]="1"; fi
            need_redraw=true
        elif [[ "$key" == '' ]]; then
            break
        fi
        [[ "$need_redraw" == true ]] || continue
        printf '\033[%dA' "$count" >/dev/tty
        for ((i=0; i<count; i++)); do
            local marker="◉"; [[ "${selected[$i]}" != "1" ]] && marker="○"
            printf '\r\033[K' >/dev/tty
            if ((i == cur)); then
                printf '  \033[36m❯ %s %s\033[0m\n' "$marker" "${options[$i]}" >/dev/tty
            else
                printf '    %s %s\n' "$marker" "${options[$i]}" >/dev/tty
            fi
        done
    done
    stty "$saved_tty" </dev/tty 2>/dev/null || true
    trap - INT TERM EXIT

    local result=""
    for ((i=0; i<count; i++)); do
        if [[ "${selected[$i]}" == "1" ]]; then
            [[ -n "$result" ]] && result+=","
            result+="$i"
        fi
    done
    printf -v "$result_var" '%s' "$result"
}
env_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\''/g")"; }
write_env_key() {
    local key="$1" val="$2" tmp; tmp="$(mktemp)"
    grep -v "^${key}=" .env > "$tmp" 2>/dev/null || true
    printf "%s=%s\n" "$key" "$(env_quote "$val")" >> "$tmp"
    mv "$tmp" .env
}
delete_env_key() {
    local key="$1" tmp; tmp="$(mktemp)"
    grep -v "^${key}=" .env > "$tmp" 2>/dev/null || true
    mv "$tmp" .env
}
env_has_key() { grep -q "^${1}=" .env 2>/dev/null; }
read_env_key() {
    local key="$1" line value
    line="$(grep "^${key}=" .env 2>/dev/null | tail -n 1)" || return 1
    value="${line#*=}"
    if [[ "$value" =~ ^\'(.*)\'$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]}"
        return 0
    fi
    if [[ "$value" =~ ^\"(.*)\"$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]}"
        return 0
    fi
    printf '%s\n' "$value"
}
pnpm_install_with_fallback() {
    pnpm install --frozen-lockfile && return 0; [[ -n "$NPM_REGISTRY" ]] && return 1
    warn "pnpm install failed — retrying with npmmirror"; use_registry "https://registry.npmmirror.com"
    pnpm install --frozen-lockfile
}
build_step() { local label="$1"; shift; info "  Building $label..."
    "$@" || { fail "$label build failed in $PROJECT_DIR"; exit 1; }; ok "$label done"; }
resolve_project_dir_from() {
    local script_source="$1" script_dir="" project_dir=""
    [[ -n "$script_source" ]] || return 1
    script_dir="$(cd "$(dirname "$script_source")" && pwd)"
    project_dir="$(cd "$script_dir/.." && pwd)"
    [[ -f "$project_dir/package.json" && -d "$project_dir/packages/api" ]] || return 1
    printf '%s\n' "$project_dir"
}
resolve_project_dir() {
    local script_source="${BASH_SOURCE[0]:-}"
    [[ -n "$script_source" ]] || {
        fail "This helper must run from a office-claw source tree. Clone or download first, then run: bash scripts/install.sh"
        exit 1
    }
    PROJECT_DIR="$(resolve_project_dir_from "$script_source")" || {
        fail "Could not locate the office-claw source tree from $script_source. Clone or download first, then run: bash scripts/install.sh"
        exit 1
    }
    PROJECT_HAS_GIT_METADATA=false
    [[ -e "$PROJECT_DIR/.git" ]] && PROJECT_HAS_GIT_METADATA=true
    if [[ "$PROJECT_HAS_GIT_METADATA" != true ]]; then
        warn "No .git directory — git-dependent features (diff view, worktree management) will be unavailable"
    fi
}
default_project_allowed_roots() {
    printf '%s\n' "$HOME" '/tmp' '/private/tmp' '/workspace'
    [[ "$(uname -s)" == "Darwin" ]] && printf '%s\n' '/Volumes'
}
project_allowed_roots() {
    local custom="${PROJECT_ALLOWED_ROOTS:-}"
    if [[ -n "$custom" ]]; then
        [[ "${PROJECT_ALLOWED_ROOTS_APPEND:-}" == "true" ]] && default_project_allowed_roots
        local IFS=':' root
        local -a roots=()
        read -r -a roots <<< "$custom"
        for root in "${roots[@]}"; do
            [[ -n "$root" ]] && printf '%s\n' "$root"
        done
    else
        default_project_allowed_roots
    fi
}
normalize_path_lexically() {
    local path="$1" segment="" absolute=""
    local -a segments=() normalized=()
    [[ -n "$path" ]] || return 1

    if [[ "$path" == /* ]]; then
        absolute="$path"
    else
        absolute="$PWD/$path"
    fi
    while [[ "$absolute" == *'//'* ]]; do
        absolute="${absolute//\/\//\/}"
    done

    IFS='/' read -r -a segments <<< "$absolute"
    for segment in "${segments[@]}"; do
        case "$segment" in
            ''|'.') ;;
            '..')
                if ((${#normalized[@]} > 0)); then
                    unset "normalized[$((${#normalized[@]} - 1))]"
                fi
                ;;
            *) normalized+=("$segment") ;;
        esac
    done

    if ((${#normalized[@]} == 0)); then
        printf '/\n'
        return 0
    fi

    local output=""
    for segment in "${normalized[@]}"; do
        output+="/$segment"
    done
    printf '%s\n' "$output"
}
normalize_path_for_compare() {
    local path="$1"
    [[ -n "$path" ]] || return 1
    normalize_path_lexically "$path"
}
path_is_under_root() {
    local root="$1" candidate="$2"
    [[ -n "$root" && -n "$candidate" ]] || return 1
    root="$(normalize_path_for_compare "$root")" || return 1
    candidate="$(normalize_path_for_compare "$candidate")" || return 1
    if [[ "$root" == "/" ]]; then
        [[ "$candidate" == /* ]]; return
    fi
    root="${root%/}"
    candidate="${candidate%/}"
    [[ "$candidate" == "$root" || "$candidate" == "$root/"* ]]
}
candidate_root_is_allowed() {
    local candidate="$1" root=""
    while IFS= read -r root; do
        [[ -n "$root" ]] || continue
        path_is_under_root "$root" "$candidate" && return 0
    done < <(project_allowed_roots)
    return 1
}
provider_profiles_candidate_root_is_allowed() {
    local candidate="$1"
    candidate_root_is_allowed "$candidate"
}
resolve_provider_profiles_dir() {
    local git_entry="$PROJECT_DIR/.git"
    if [[ ! -e "$git_entry" ]]; then
        printf '%s/.office-claw\n' "$PROJECT_DIR"; return
    fi
    if [[ -d "$git_entry" ]]; then
        printf '%s/.office-claw\n' "$PROJECT_DIR"; return
    fi
    if [[ -f "$git_entry" ]] && command -v git &>/dev/null; then
        local gitdir="" worktrees_dir="" common_git_dir="" candidate=""
        gitdir="$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-dir 2>/dev/null || true)"
        [[ -n "$gitdir" ]] || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        worktrees_dir="$(dirname "$gitdir" 2>/dev/null)"
        [[ "$(basename "$worktrees_dir" 2>/dev/null)" == "worktrees" ]] || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        common_git_dir="$(dirname "$worktrees_dir" 2>/dev/null)"
        [[ "$(basename "$common_git_dir" 2>/dev/null)" == ".git" ]] || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }

        local backref_file="$gitdir/gitdir" backref_resolved=""
        if [[ ! -f "$backref_file" ]]; then
            printf '%s/.office-claw\n' "$PROJECT_DIR"; return
        fi
        backref_resolved="$(cd "$gitdir" 2>/dev/null && realpath "$(head -1 "$backref_file" 2>/dev/null)" 2>/dev/null)" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        local git_entry_resolved=""
        git_entry_resolved="$(realpath "$git_entry" 2>/dev/null)" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        [[ "$backref_resolved" == "$git_entry_resolved" ]] || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }

        local commondir_file="$gitdir/commondir" commondir_value="" commondir_resolved=""
        if [[ ! -f "$commondir_file" ]]; then
            printf '%s/.office-claw\n' "$PROJECT_DIR"; return
        fi
        commondir_value="$(head -1 "$commondir_file" 2>/dev/null)" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        [[ -n "$commondir_value" ]] || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        commondir_resolved="$(cd "$gitdir" 2>/dev/null && realpath "$commondir_value" 2>/dev/null)" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        local common_git_dir_resolved=""
        common_git_dir_resolved="$(realpath "$common_git_dir" 2>/dev/null)" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        [[ "$commondir_resolved" == "$common_git_dir_resolved" ]] || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }

        candidate="$(dirname "$common_git_dir_resolved")"
        candidate="$(normalize_path_for_compare "$candidate" 2>/dev/null)" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        provider_profiles_candidate_root_is_allowed "$candidate" || { printf '%s/.office-claw\n' "$PROJECT_DIR"; return; }
        printf '%s/.office-claw\n' "$candidate"; return
    fi
    printf '%s/.office-claw\n' "$PROJECT_DIR"
}
docker_detected() {
    [[ -f /.dockerenv ]] || grep -qsw docker /proc/1/cgroup 2>/dev/null
}
ENV_CREATED=false
maybe_write_docker_api_host() {
    docker_detected || return 0
    if [[ "$ENV_CREATED" == true ]]; then
        write_env_key "API_SERVER_HOST" "0.0.0.0"
        ok "Docker detected — API_SERVER_HOST=0.0.0.0"
    elif env_has_key "API_SERVER_HOST"; then
        ok "Docker detected — preserving existing API_SERVER_HOST"
    else
        write_env_key "API_SERVER_HOST" "0.0.0.0"
        ok "Docker detected — added API_SERVER_HOST=0.0.0.0 (was missing from existing .env)"
    fi
}

default_frontend_url() {
    local frontend_port=""
    if [[ -f .env ]]; then
        frontend_port="$(read_env_key FRONTEND_PORT || true)"
    fi
    frontend_port="${frontend_port:-${FRONTEND_PORT:-3003}}"
    printf 'http://localhost:%s\n' "$frontend_port"
}

ENV_KEYS=(); ENV_VALUES=(); ENV_DELETE_KEYS=()
reset_env_changes() { ENV_KEYS=(); ENV_VALUES=(); ENV_DELETE_KEYS=(); }
collect_env() { ENV_KEYS+=("$1"); ENV_VALUES+=("$2"); }
clear_env() { ENV_DELETE_KEYS+=("$1"); }
set_codex_oauth_mode() {
    collect_env "CODEX_AUTH_MODE" "oauth"
    clear_env "OPENAI_API_KEY"; clear_env "OPENAI_BASE_URL"; clear_env "CAT_CODEX_MODEL"
}
set_codex_api_key_mode() {
    local key="$1" base_url="$2" model="$3"
    collect_env "CODEX_AUTH_MODE" "api_key"; collect_env "OPENAI_API_KEY" "$key"
    [[ -n "$base_url" ]] && collect_env "OPENAI_BASE_URL" "$base_url" || clear_env "OPENAI_BASE_URL"
    [[ -n "$model" ]] && collect_env "CAT_CODEX_MODEL" "$model" || clear_env "CAT_CODEX_MODEL"
}
set_gemini_oauth_mode() {
    clear_env "GEMINI_API_KEY"; clear_env "GEMINI_BASE_URL"; clear_env "CAT_GEMINI_MODEL"
}
set_gemini_api_key_mode() {
    local key="$1" base_url="$2" model="$3"
    collect_env "GEMINI_API_KEY" "$key"
    [[ -n "$base_url" ]] && collect_env "GEMINI_BASE_URL" "$base_url" || clear_env "GEMINI_BASE_URL"
    [[ -n "$model" ]] && collect_env "CAT_GEMINI_MODEL" "$model" || clear_env "CAT_GEMINI_MODEL"
}
apply_modelarts_custom_env() {
    # OFFICE_CLAW_CLIENT_LABELS is the single source of truth:
    # keys = enabled clients, values = console display names.
    # Format: "clientId:DisplayName,clientId:DisplayName"
    # Available client IDs: anthropic | openai | google | dare | opencode | antigravity | relayclaw
    # Example: "dare:jiuwen,anthropic:Claude,opencode:OpenCode"
    # OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED=false hides all builtin auth.
    collect_env "OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED" "false"
    collect_env "OFFICE_CLAW_CLIENT_LABELS" "dare:dare,relayclaw:jiuwen"
    clear_env "CODEX_AUTH_MODE"
    clear_env "OPENAI_API_KEY"; clear_env "OPENAI_BASE_URL"; clear_env "OPENAI_API_BASE"; clear_env "CAT_CODEX_MODEL"
    clear_env "GEMINI_API_KEY"; clear_env "GEMINI_BASE_URL"; clear_env "CAT_GEMINI_MODEL"
}
write_claude_profile() {
    local key="$1" base_url="$2" model="$3" pdir=""
    pdir="$(resolve_provider_profiles_dir)"; mkdir -p "$pdir"
    node - "$pdir" "$key" "${base_url:-https://api.anthropic.com}" "$model" <<'EONODE'
const fs = require('fs'), path = require('path');
const [dir, key, baseUrl, model] = process.argv.slice(2), id = 'installer-managed', now = new Date().toISOString();
const pf = path.join(dir, 'provider-profiles.json'), sf = path.join(dir, 'provider-profiles.secrets.local.json');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { version: 1, providers: {} }; } };
const profiles = read(pf), secrets = read(sf), anth = profiles.providers.anthropic ?? { profiles: [] };
const keep = (anth.profiles ?? []).filter((p) => p.id !== id);
keep.push({ id, provider: 'anthropic', name: 'Installer API Key', mode: 'api_key', baseUrl, createdAt: now, updatedAt: now, ...(model ? { modelOverride: model } : {}) });
profiles.providers.anthropic = { ...anth, activeProfileId: id, profiles: keep };
secrets.providers.anthropic = { ...(secrets.providers.anthropic ?? {}), [id]: { apiKey: key } };
fs.writeFileSync(pf, JSON.stringify(profiles)); fs.writeFileSync(sf, JSON.stringify(secrets)); fs.chmodSync(sf, 0o600);
EONODE
}
remove_claude_installer_profile() {
    local pdir=""
    pdir="$(resolve_provider_profiles_dir)"; [[ -d "$pdir" ]] || return 0
    node - "$pdir" <<'EONODE'
const fs = require('fs'), path = require('path');
const [dir] = process.argv.slice(2), id = 'installer-managed';
const pf = path.join(dir, 'provider-profiles.json'), sf = path.join(dir, 'provider-profiles.secrets.local.json');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const profiles = read(pf), secrets = read(sf); if (!profiles?.providers?.anthropic) process.exit(0);
const anth = profiles.providers.anthropic, nextProfiles = (anth.profiles ?? []).filter((p) => p.id !== id);
profiles.providers.anthropic = { ...anth, profiles: nextProfiles, ...(anth.activeProfileId === id ? { activeProfileId: nextProfiles[0]?.id ?? '' } : {}) };
if (secrets?.providers?.anthropic?.[id]) delete secrets.providers.anthropic[id];
fs.writeFileSync(pf, JSON.stringify(profiles)); if (secrets) fs.writeFileSync(sf, JSON.stringify(secrets));
EONODE
}

if [[ "$SOURCE_ONLY" == true ]]; then
    return 0 2>/dev/null || exit 0
fi

# ── [1/9] Environment detection ────────────────────────────
step "[1/9] Detecting environment / 环境检测..."

if [[ "$(uname -s)" != "Linux" ]]; then
    fail "This script is for Linux only. Detected: $(uname -s)"; exit 1
fi

DISTRO_FAMILY=""; DISTRO_NAME=""; PKG_INSTALL=""; PKG_UPDATE=""
if [[ -f /etc/os-release ]]; then
    . /etc/os-release; DISTRO_NAME="${ID:-unknown}"
    case "$DISTRO_NAME" in
        ubuntu|debian|linuxmint|pop) DISTRO_FAMILY="debian"; PKG_UPDATE="apt-get update -qq"
            PKG_INSTALL="apt-get install -y"; export DEBIAN_FRONTEND=noninteractive ;;
        centos|rhel|rocky|almalinux|fedora) DISTRO_FAMILY="rhel"; PKG_UPDATE="true"
            if command -v dnf &>/dev/null; then PKG_INSTALL="dnf install -y"; else PKG_INSTALL="yum install -y"; fi ;;
    esac
fi

if [[ -z "$DISTRO_FAMILY" ]]; then fail "Unsupported: ${DISTRO_NAME:-unknown}. Need: Ubuntu/Debian or CentOS/RHEL/Fedora"; exit 1; fi
ok "OS: ${PRETTY_NAME:-$DISTRO_NAME} ($DISTRO_FAMILY)"

SUDO=""
if [[ $EUID -ne 0 ]]; then
    command -v sudo &>/dev/null || { fail "Not root and sudo not found / 请以 root 运行或安装 sudo"; exit 1; }
    SUDO="sudo"
fi

resolve_project_dir
ok "Source tree: $PROJECT_DIR"

# ── [2/9] Install system dependencies ──────────────────────
step "[2/9] Checking system dependencies / 检测系统依赖..."
NEED_PKGS=()
for cmd in git curl; do
    if command -v "$cmd" &>/dev/null; then ok "$cmd found"
    else warn "$cmd not found — will install"
        NEED_PKGS+=("$cmd")
    fi
done
if ! command -v gcc &>/dev/null || ! command -v g++ &>/dev/null || ! command -v make &>/dev/null; then
    warn "C/C++ build toolchain incomplete — will install"
    case "$DISTRO_FAMILY" in debian) NEED_PKGS+=(build-essential) ;; rhel) NEED_PKGS+=(gcc gcc-c++ make) ;; esac
fi
# Ensure HTTPS/GPG deps exist (needed for NodeSource)
case "$DISTRO_FAMILY" in
    debian) for p in ca-certificates gnupg; do dpkg -s "$p" &>/dev/null || NEED_PKGS+=("$p"); done ;;
    rhel) rpm -q ca-certificates &>/dev/null || NEED_PKGS+=(ca-certificates); rpm -q gnupg2 &>/dev/null || NEED_PKGS+=(gnupg2) ;;
esac
if [[ ${#NEED_PKGS[@]} -gt 0 ]]; then
    info "  Installing: ${NEED_PKGS[*]}..."
    $SUDO $PKG_UPDATE 2>/dev/null || true
    $SUDO $PKG_INSTALL "${NEED_PKGS[@]}"; ok "System dependencies installed"
else ok "All system dependencies present"
fi

# F088 Phase J2: pandoc for document generation (MD → PDF/DOCX)
if command -v pandoc &>/dev/null; then
    ok "pandoc found ($(pandoc --version | head -1))"
else
    info "Installing pandoc (document generation)..."
    case "$DISTRO_FAMILY" in
        debian) $SUDO $PKG_INSTALL pandoc && ok "pandoc installed" || warn "pandoc install failed — document generation will fall back to .md" ;;
        rhel) $SUDO $PKG_INSTALL pandoc && ok "pandoc installed" || warn "pandoc install failed — document generation will fall back to .md" ;;
        *) warn "pandoc not installed — document generation will fall back to .md" ;;
    esac
fi

# ── [3/9] Install Node.js 20+ ────────────────────────────
step "[3/9] Checking Node.js / 检测 Node.js..."
node_needs_install() {
    command -v node &>/dev/null || return 0
    local v; v=$(node -v | sed 's/v//' | cut -d. -f1)
    [[ "$v" -lt 20 ]] && { warn "Node.js $(node -v) < v20 — upgrading"; return 0; }
    return 1
}
install_node_fnm() {
    USED_FNM=true; warn "NodeSource unreachable — trying fnm..."
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell 2>/dev/null \
        || curl -fsSL https://ghp.ci/https://raw.githubusercontent.com/Schniz/fnm/master/.ci/install.sh | bash -s -- --skip-shell 2>/dev/null || return 1
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
    eval "$(fnm env --shell bash 2>/dev/null)" 2>/dev/null || true
    fnm install 20 && fnm use 20 && fnm default 20 || return 1
    for bin in node npm npx corepack; do persist_user_bin "$bin"; done
    command -v node &>/dev/null || return 1
    [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -ge 20 ]] || return 1
}
if node_needs_install; then
    NODE_OK=false
    case "$DISTRO_FAMILY" in
        debian)
            $SUDO mkdir -p /etc/apt/keyrings
            if timeout 15 curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
                | $SUDO gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null; then
                echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
                    | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
                $SUDO apt-get update -qq && $SUDO apt-get install -y -qq nodejs && NODE_OK=true
            fi
            [[ "$NODE_OK" == false ]] && install_node_fnm && NODE_OK=true
            ;;
        rhel)
            if timeout 15 curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash - 2>/dev/null; then
                $SUDO $PKG_INSTALL nodejs && NODE_OK=true
            fi
            [[ "$NODE_OK" == false ]] && install_node_fnm && NODE_OK=true
            ;;
    esac
    node_needs_install && NODE_OK=false
    [[ "$NODE_OK" == false ]] && { fail "Could not install Node.js 20. Install manually: https://nodejs.org"; exit 1; }
    ok "Node.js $(node -v) installed"
else
    ok "Node.js $(node -v) already installed (>= 20)"
fi

# ── [4/9] Install pnpm + Redis ─────────────────────────────
step "[4/9] Checking pnpm & Redis / 检测 pnpm 和 Redis..."
if ! command -v pnpm &>/dev/null; then
    warn "pnpm not found — installing"
    if command -v corepack &>/dev/null; then
        $SUDO corepack enable 2>/dev/null || true
        COREPACK_ENABLE_DOWNLOAD_PROMPT=0 timeout 30 corepack prepare pnpm@latest --activate 2>/dev/null || true
    fi
    if ! command -v pnpm &>/dev/null; then
        npm_global_install pnpm || { warn "npm failed — trying npmmirror"; $SUDO npm install -g pnpm --registry https://registry.npmmirror.com; }
    fi
    [[ "$USED_FNM" == true ]] && persist_user_bin pnpm
    ok "pnpm $(pnpm -v) installed"
else ok "pnpm $(pnpm -v) already installed"
fi
# Redis: detect → already running / --memory skip / ask user
install_redis_local() {
    case "$DISTRO_FAMILY" in debian) $SUDO $PKG_INSTALL redis-server ;; rhel) $SUDO $PKG_INSTALL redis ;; esac
    $SUDO systemctl enable redis-server 2>/dev/null || $SUDO systemctl enable redis 2>/dev/null || true
    $SUDO systemctl start redis-server 2>/dev/null || $SUDO systemctl start redis 2>/dev/null || true; ok "Redis installed and started"
}
if [[ "$MEMORY_MODE" == true ]]; then warn "Memory mode (--memory) — skipping Redis"
elif command -v redis-server &>/dev/null; then ok "Redis already installed"
    redis-cli ping &>/dev/null 2>&1 || {
        warn "Redis not running — starting..."
        $SUDO systemctl start redis-server 2>/dev/null || $SUDO systemctl start redis 2>/dev/null || true; }
else
    warn "Redis not found — installing locally"
    install_redis_local
fi

# ── [5/9] Build checked-out project ────────────────────────
step "[5/9] Preparing current repo / 准备当前仓库..."
cd "$PROJECT_DIR"
ok "Using project: $PROJECT_DIR"
pnpm_install_with_fallback || { fail "pnpm install failed in $PROJECT_DIR"; exit 1; }
ok "Packages installed"
build_step "shared" pnpm --dir packages/shared run build
build_step "mcp-server" pnpm --dir packages/mcp-server run build
build_step "api" pnpm --dir packages/api run build
build_step "web" env NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}" pnpm --dir packages/web run build
ok "Build complete"
# Skills: per-skill user-level symlinks (ADR-009)
SKILLS_SOURCE="$PROJECT_DIR/office-claw-skills"
if [[ -d "$SKILLS_SOURCE" ]]; then
    for tdir in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.gemini/skills"; do
        mkdir -p "$tdir"
        for sd in "$SKILLS_SOURCE"/*/; do
            [[ -d "$sd" ]] || continue; sn=$(basename "$sd"); [[ "$sn" == "refs" ]] && continue; ln -sfn "$sd" "$tdir/$sn"
        done
    done; ok "Skills linked"
else fail "office-claw-skills/ not found"; exit 1; fi

# F135: DARE CLI — clone + venv setup
# Pin to a known-good commit for reproducible installs (bump via PR when upgrading DARE).
DARE_CLI_REF="${DARE_CLI_REF:-6654255f003b2be58c1c75160607b7d7bf0eb957}"
DARE_VENDOR_DIR="$PROJECT_DIR/vendor/dare-cli"
if [[ -f "$DARE_VENDOR_DIR/client/__main__.py" ]]; then
    ok "DARE CLI already present at vendor/dare-cli"
else
    info "  Cloning DARE CLI to vendor/dare-cli (ref: ${DARE_CLI_REF:0:7})..."
    mkdir -p "$PROJECT_DIR/vendor"
    if git clone https://github.com/clowder-labs/Deterministic-Agent-Runtime-Engine.git \
           "$DARE_VENDOR_DIR" 2>&1 && \
       git -C "$DARE_VENDOR_DIR" checkout "$DARE_CLI_REF" 2>&1; then
        ok "DARE CLI cloned at ${DARE_CLI_REF:0:7}"
    else
        warn "DARE clone failed — DARE CLI will not be available"
        rm -rf "$DARE_VENDOR_DIR" 2>/dev/null || true
        DARE_VENDOR_DIR=""
    fi
fi
if [[ -n "$DARE_VENDOR_DIR" && -f "$DARE_VENDOR_DIR/client/__main__.py" ]]; then
    if [[ ! -f "$DARE_VENDOR_DIR/.venv/bin/python" ]]; then
        info "  Setting up DARE Python venv..."
        if command -v uv &>/dev/null; then
            if uv venv "$DARE_VENDOR_DIR/.venv" 2>&1 && \
               uv pip install --python "$DARE_VENDOR_DIR/.venv/bin/python" \
                   -r "$DARE_VENDOR_DIR/requirements.txt" "httpx[socks]" 2>&1; then
                ok "DARE venv ready"
            else
                warn "DARE venv setup failed (uv) — DARE CLI will not be available"
                DARE_VENDOR_DIR=""
            fi
        elif command -v python3 &>/dev/null; then
            if python3 -m venv "$DARE_VENDOR_DIR/.venv" 2>&1 && \
               "$DARE_VENDOR_DIR/.venv/bin/pip" install \
                   -r "$DARE_VENDOR_DIR/requirements.txt" "httpx[socks]" 2>&1; then
                ok "DARE venv ready"
            else
                warn "DARE venv setup failed (python3) — DARE CLI will not be available"
                DARE_VENDOR_DIR=""
            fi
        else
            warn "Neither uv nor python3 found — skipping DARE venv setup"
            DARE_VENDOR_DIR=""
        fi
    else
        ok "DARE venv already exists"
    fi
fi

# F custom: jiuwen runtime (Linux)
JIUWEN_VENDOR_DIR="$PROJECT_DIR/vendor/jiuwenclaw"
if [[ -f "$JIUWEN_VENDOR_DIR/jiuwenclaw/app.py" ]]; then
    if [[ ! -f "$JIUWEN_VENDOR_DIR/.venv/bin/python" ]]; then
        info "  Preparing jiuwen runtime..."
        if command -v uv &>/dev/null; then
            if uv venv "$JIUWEN_VENDOR_DIR/.venv" 2>&1 && \
               uv pip install --python "$JIUWEN_VENDOR_DIR/.venv/bin/python" -e "$JIUWEN_VENDOR_DIR" 2>&1; then
                ok "jiuwen runtime ready"
            else
                warn "jiuwen runtime setup failed (uv) — jiuwen client will stay unavailable"
                JIUWEN_VENDOR_DIR=""
            fi
        elif command -v python3 &>/dev/null; then
            if python3 -m venv "$JIUWEN_VENDOR_DIR/.venv" 2>&1 && \
               "$JIUWEN_VENDOR_DIR/.venv/bin/pip" install --upgrade pip setuptools wheel 2>&1 && \
               "$JIUWEN_VENDOR_DIR/.venv/bin/pip" install -e "$JIUWEN_VENDOR_DIR" 2>&1; then
                ok "jiuwen runtime ready"
            else
                warn "jiuwen runtime setup failed (python3) — jiuwen client will stay unavailable"
                JIUWEN_VENDOR_DIR=""
            fi
        else
            warn "Neither uv nor python3 found — skipping jiuwen runtime setup"
            JIUWEN_VENDOR_DIR=""
        fi
    else
        ok "jiuwen runtime already exists"
    fi
fi

# ── [6/9] AI CLI tools (skipped for custom install) ──────
step "[6/9] AI CLI tools / AI 命令行工具..."
info "  Custom install — no external CLI tools required"
ok "Skipped (dare/jiuwen use vendored runtimes)"

# ── [7/9] Authentication setup / 认证配置 ─────────────────
step "[7/9] Authentication setup / 认证配置..."
node scripts/install-auth-config.mjs modelarts-preset apply --project-dir "$PROJECT_DIR"
apply_modelarts_custom_env
ok "ModelArts preset written: 2 cats / shared glm-5 profile / dare+jiuwen only"

# ── [8/9] Generate .env with all collected config ─────────
step "[8/9] Generating config / 生成配置..."
if [[ -f .env ]]; then
    warn ".env already exists — not overwriting. To regenerate: cp .env.example .env"
elif [[ -f .env.example ]]; then
    cp .env.example .env; ENV_CREATED=true; ok ".env generated from .env.example"
else fail ".env.example not found in $PROJECT_DIR"; exit 1
fi
# Write collected auth config + Docker detection
for key in "${ENV_DELETE_KEYS[@]}"; do delete_env_key "$key"; done
for i in "${!ENV_KEYS[@]}"; do write_env_key "${ENV_KEYS[$i]}" "${ENV_VALUES[$i]}"; done
[[ ${#ENV_KEYS[@]} -gt 0 ]] && ok "Auth config written to .env"
# Auto-detect Docker: only set host default on a freshly generated .env.
maybe_write_docker_api_host
chmod 600 .env 2>/dev/null || true

# ── [9/9] Done ──────────────────────────────────────────────
step "[9/9] Installation complete! / 安装完成！"
echo -e "\n  ${GREEN}══ OfficeClaw is ready! 智能体咖啡已就绪！══${NC}\n  Project: $PROJECT_DIR"
START_CMD="cd $PROJECT_DIR && pnpm start"; [[ "$MEMORY_MODE" == true ]] && START_CMD+=" --memory"
echo -e "  Start: $START_CMD\n  Open:  $(default_frontend_url)\n"
if [[ "$AUTO_START" == true ]]; then
    echo -e "${CYAN}Starting service (--start)...${NC}"; echo ""
    if [[ "$MEMORY_MODE" == true ]]; then exec pnpm start --memory; else exec pnpm start; fi
fi
