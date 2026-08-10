#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common.sh
source "${SCRIPT_DIR}/../common.sh"

require_command git
require_command docker
require_command curl
load_environment

[[ -f "${STATE_DIR}/previous-sha" ]] || fail "No previous release is recorded."
[[ -z "$(git -C "${REPO_DIR}" status --porcelain)" ]] || fail "Production checkout is dirty."

current_commit="$(<"${STATE_DIR}/current-sha")"
previous_commit="$(<"${STATE_DIR}/previous-sha")"
docker image inspect "tidy-week:${previous_commit}" >/dev/null 2>&1 \
  || fail "Previous image is unavailable: tidy-week:${previous_commit}"

if [[ -f "${TIDY_DATA_DIR}/app.sqlite" ]]; then
  "${REPO_DIR}/ops/backup/backup.sh"
fi

log "Rolling application code back from ${current_commit} to ${previous_commit}."
git -C "${REPO_DIR}" reset --hard "${previous_commit}"
APP_IMAGE_TAG="${previous_commit}"
export APP_IMAGE_TAG
compose up -d --remove-orphans app

if wait_for_health; then
  printf '%s\n' "${current_commit}" > "${STATE_DIR}/previous-sha"
  printf '%s\n' "${previous_commit}" > "${STATE_DIR}/current-sha"
  log "Rollback succeeded. Database state was not changed."
  exit 0
fi

log "Previous image was unhealthy; returning to ${current_commit}."
git -C "${REPO_DIR}" reset --hard "${current_commit}"
APP_IMAGE_TAG="${current_commit}"
export APP_IMAGE_TAG
compose up -d --remove-orphans app
wait_for_health || fail "Neither current nor previous image is healthy. Inspect Compose logs."
fail "Rollback target was unhealthy; current release was recovered."
