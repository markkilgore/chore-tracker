#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common.sh
source "${SCRIPT_DIR}/../common.sh"

require_command sqlite3
require_command gzip
require_command tar
load_environment

[[ "${TIDY_BACKUP_RETENTION}" =~ ^[1-9][0-9]*$ ]] \
  || fail "TIDY_BACKUP_RETENTION must be a positive integer."
database="${TIDY_DATA_DIR}/app.sqlite"
[[ -f "${database}" ]] || fail "Production database not found: ${database}"

mkdir -p "${TIDY_BACKUP_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary="${TIDY_BACKUP_DIR}/.${timestamp}.incomplete"
snapshot="${TIDY_BACKUP_DIR}/${timestamp}"
cleanup() { rm -rf "${temporary}"; }
trap cleanup EXIT
mkdir -m 700 "${temporary}"

log "Creating consistent SQLite snapshot."
sqlite3 "${database}" ".timeout 10000" ".backup '${temporary}/app.sqlite'"
integrity="$(sqlite3 "${temporary}/app.sqlite" 'PRAGMA integrity_check;')"
[[ "${integrity}" == "ok" ]] || fail "Backup integrity check failed: ${integrity}"
gzip "${temporary}/app.sqlite"

if [[ -d "${TIDY_ASSETS_DIR}" ]]; then
  tar -C "${TIDY_ASSETS_DIR}" -czf "${temporary}/assets.tar.gz" .
fi

deployed_sha="$(git -C "${REPO_DIR}" rev-parse HEAD)"
[[ -f "${STATE_DIR}/current-sha" ]] && deployed_sha="$(<"${STATE_DIR}/current-sha")"
cat > "${temporary}/manifest.txt" <<EOF
created_at=${timestamp}
git_sha=${deployed_sha}
database=app.sqlite.gz
assets=assets.tar.gz
EOF
chmod -R go-rwx "${temporary}"
mv "${temporary}" "${snapshot}"
trap - EXIT

mapfile -t snapshots < <(find "${TIDY_BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' -printf '%f\n' | sort -r)
if ((${#snapshots[@]} > TIDY_BACKUP_RETENTION)); then
  for expired in "${snapshots[@]:TIDY_BACKUP_RETENTION}"; do
    rm -rf -- "${TIDY_BACKUP_DIR:?}/${expired}"
  done
fi

if [[ -n "${RESTIC_REPOSITORY:-}" ]]; then
  require_command restic
  restic backup "${snapshot}"
  restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
fi

log "Backup created: ${snapshot}"
