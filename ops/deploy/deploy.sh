#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common.sh
source "${SCRIPT_DIR}/../common.sh"

require_command git
require_command docker
require_command curl
require_command sqlite3
load_environment

cd "${REPO_DIR}"
[[ "${REPO_DIR}" == /srv/* ]] || fail "Deploy only from the pull-only production checkout under /srv."
[[ -z "$(git status --porcelain)" ]] || fail "Production checkout is dirty."
[[ "$(git branch --show-current)" == "main" ]] || fail "Production checkout must be on main."

previous_commit="$(git rev-parse HEAD)"
requested_ref="${1:-origin/main}"
git fetch origin --prune
target_commit="$(git rev-parse "${requested_ref}^{commit}")"
git merge-base --is-ancestor "${previous_commit}" "${target_commit}" \
  || fail "Target ${target_commit} is not a fast-forward from ${previous_commit}. Use rollback.sh for an older release."

log "Current commit: ${previous_commit}"
log "Target commit:  ${target_commit}"

if [[ -f "${TIDY_DATA_DIR}/app.sqlite" ]]; then
  "${REPO_DIR}/ops/backup/backup.sh"
else
  log "No production database exists yet; skipping pre-deploy backup."
fi

if [[ "${previous_commit}" != "${target_commit}" ]]; then
  git merge --ff-only "${target_commit}"
else
  log "Checkout already matches target; rebuilding the tested image."
fi

rollback_failed_deploy() {
  trap - ERR
  log "Deployment failed. Restoring code and image ${previous_commit}."
  git reset --hard "${previous_commit}"
  APP_IMAGE_TAG="${previous_commit}"
  export APP_IMAGE_TAG
  if docker image inspect "tidy-week:${previous_commit}" >/dev/null 2>&1 \
    && compose up -d --remove-orphans app \
    && wait_for_health; then
    fail "Deployment failed; automatic code rollback succeeded. Data was not restored."
  fi
  fail "Deployment and automatic code rollback both failed. Data was not restored."
}
trap rollback_failed_deploy ERR

APP_IMAGE_TAG="${target_commit}"
export APP_IMAGE_TAG
log "Building tested image tidy-week:${target_commit}."
docker build --pull --target production -t "tidy-week:${target_commit}" "${REPO_DIR}"
compose up -d --remove-orphans app
wait_for_health

install -d -m 700 "${STATE_DIR}"
printf '%s\n' "${previous_commit}" > "${STATE_DIR}/previous-sha"
printf '%s\n' "${target_commit}" > "${STATE_DIR}/current-sha"
trap - ERR
log "Deployment succeeded at ${target_commit}."
