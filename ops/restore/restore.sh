#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common.sh
source "${SCRIPT_DIR}/../common.sh"

require_command docker
require_command curl
require_command sqlite3
require_command gzip
load_environment

snapshot="${1:-}"
confirmation="${2:-}"
[[ -n "${snapshot}" && "${confirmation}" == "RESTORE" ]] \
  || fail "Usage: $0 /path/to/TIMESTAMP-snapshot RESTORE"
[[ -f "${snapshot}/app.sqlite.gz" ]] || fail "Backup database is missing: ${snapshot}/app.sqlite.gz"

temporary="$(mktemp -d "${TIDY_BACKUP_DIR}/restore.XXXXXX")"
cleanup() { rm -rf "${temporary}"; }
trap cleanup EXIT
gzip -dc "${snapshot}/app.sqlite.gz" > "${temporary}/selected.sqlite"
integrity="$(sqlite3 "${temporary}/selected.sqlite" 'PRAGMA integrity_check;')"
[[ "${integrity}" == "ok" ]] || fail "Selected backup failed integrity check: ${integrity}"

current="${TIDY_DATA_DIR}/app.sqlite"
if [[ -f "${current}" ]]; then
  sqlite3 "${current}" ".timeout 10000" ".backup '${temporary}/pre-restore.sqlite'"
fi

log "Stopping Tidy Week before restoring data."
compose stop app
rm -f "${current}-wal" "${current}-shm"
install -o 1001 -g "${TIDY_DATA_GID}" -m 0660 "${temporary}/selected.sqlite" "${current}"
if [[ -f "${snapshot}/assets.tar.gz" ]]; then
  tar -C "${TIDY_ASSETS_DIR}" -xzf "${snapshot}/assets.tar.gz"
fi

compose up -d app
if wait_for_health; then
  log "Restore completed. Verify the Git SHA recorded in ${snapshot}/manifest.txt."
  exit 0
fi

if [[ -f "${temporary}/pre-restore.sqlite" ]]; then
  log "Restored snapshot was unhealthy; recovering the pre-restore database."
  compose stop app
  rm -f "${current}-wal" "${current}-shm"
  install -o 1001 -g "${TIDY_DATA_GID}" -m 0660 "${temporary}/pre-restore.sqlite" "${current}"
  compose up -d app
  wait_for_health && fail "Selected backup was unhealthy; the pre-restore database was recovered."
fi
fail "Restore failed and automatic recovery did not restore health. Inspect Compose logs."
