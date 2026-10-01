#!/usr/bin/env bash
# Cloud-agent install script for the athene-cmms monorepo.
#
# Goals:
#   * Make new Cursor cloud-agent VMs immediately able to run build / tsc /
#     vite commands without any manual `npm install`.
#   * Pin a stable Node.js LTS version (matches .nvmrc) so behaviour is
#     reproducible across agents.
#   * Be idempotent and cheap on warm runs: `npm ci` only re-runs when the
#     lockfile actually changed since the last successful install.
#
# This script runs from the repository root (Cursor invokes the `install`
# command from there per the environment.json contract).

set -euo pipefail

log() { printf '[cursor-install] %s\n' "$*"; }

REPO_ROOT="$(pwd)"
STAMP_DIR="${REPO_ROOT}/node_modules/.cache/cursor-install"
STAMP_FILE="${STAMP_DIR}/package-lock.sha256"

# 1. Activate Node.js via nvm if available, otherwise rely on the base image.
if [ -z "${NVM_DIR:-}" ] && [ -d "${HOME}/.nvm" ]; then
  export NVM_DIR="${HOME}/.nvm"
fi

if [ -n "${NVM_DIR:-}" ] && [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
  if [ -f "${REPO_ROOT}/.nvmrc" ]; then
    NODE_REQ="$(tr -d ' \t\r\n' < "${REPO_ROOT}/.nvmrc")"
    log "ensuring Node ${NODE_REQ} via nvm"
    nvm install "${NODE_REQ}" >/dev/null
    nvm use "${NODE_REQ}" >/dev/null
    nvm alias default "${NODE_REQ}" >/dev/null || true
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  log "ERROR: node is not on PATH after environment setup" >&2
  exit 1
fi

log "node $(node -v) / npm $(npm -v)"

# 2. Decide whether we need to (re)install dependencies.
LOCK_HASH=""
if [ -f "${REPO_ROOT}/package-lock.json" ]; then
  LOCK_HASH="$(sha256sum "${REPO_ROOT}/package-lock.json" | awk '{print $1}')"
fi

needs_install=1
if [ -d "${REPO_ROOT}/node_modules" ] \
   && [ -d "${REPO_ROOT}/node_modules/typescript" ] \
   && [ -f "${STAMP_FILE}" ] \
   && [ -n "${LOCK_HASH}" ] \
   && [ "$(cat "${STAMP_FILE}")" = "${LOCK_HASH}" ]; then
  needs_install=0
fi

if [ "${needs_install}" -eq 0 ]; then
  log "dependencies already in sync with package-lock.json (skipping npm ci)"
else
  if [ -f "${REPO_ROOT}/package-lock.json" ]; then
    log "running 'npm ci' to install workspace dependencies"
    if npm ci --no-audit --no-fund --prefer-offline; then
      :
    else
      log "'npm ci' failed; falling back to 'npm install' (lockfile drift?)"
      npm install --no-audit --no-fund
    fi
  else
    log "no package-lock.json found; running 'npm install'"
    npm install --no-audit --no-fund
  fi

  mkdir -p "${STAMP_DIR}"
  if [ -n "${LOCK_HASH}" ]; then
    printf '%s' "${LOCK_HASH}" > "${STAMP_FILE}"
  fi
fi

# 3. Sanity check: the failure mode this script exists to prevent.
if [ ! -x "${REPO_ROOT}/node_modules/.bin/tsc" ]; then
  log "ERROR: node_modules/.bin/tsc is missing after install" >&2
  exit 1
fi

log "install complete"
