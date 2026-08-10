#!/usr/bin/env bash

set -Eeuo pipefail

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${OPS_DIR}/common.sh"

require_command git
require_command docker
require_command curl
require_command sqlite3
require_command ip
require_command sudo
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is unavailable."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable. Add this user to the docker group or start Docker."
load_environment

[[ "$(uname -s)" == "Linux" ]] || fail "Production setup is intended for Linux."
[[ "${REPO_DIR}" == /srv/* ]] || fail "Production must use a dedicated checkout under /srv, not a development checkout: ${REPO_DIR}"
[[ -z "$(git -C "${REPO_DIR}" status --porcelain)" ]] || fail "Production checkout is dirty."
[[ "$(git -C "${REPO_DIR}" branch --show-current)" == "main" ]] || fail "Production checkout must be on main."

for directory in "${TIDY_DATA_DIR}" "${TIDY_ASSETS_DIR}" "${TIDY_BACKUP_DIR}"; do
  [[ "${directory}" == /* ]] || fail "Production paths must be absolute: ${directory}"
  [[ "${directory}" != *"/.local/"* ]] || fail "Production paths may not point at development data: ${directory}"
done
[[ "${TIDY_DATA_DIR}" != "${TIDY_ASSETS_DIR}" ]] || fail "Data and asset directories must differ."
[[ "${TIDY_BACKUP_RETENTION}" =~ ^[1-9][0-9]*$ ]] || fail "TIDY_BACKUP_RETENTION must be a positive integer."
[[ "${TIDY_HOST_PORT}" =~ ^[0-9]+$ ]] || fail "TIDY_HOST_PORT must be numeric."
if [[ "${TIDY_BIND_ADDRESS}" != "127.0.0.1" && "${TIDY_BIND_ADDRESS}" != "0.0.0.0" ]]; then
  ip -4 address show | grep -Fq "inet ${TIDY_BIND_ADDRESS}/" \
    || fail "TIDY_BIND_ADDRESS is not assigned to this host: ${TIDY_BIND_ADDRESS}"
fi

sudo install -d -o 1001 -g "${TIDY_DATA_GID}" -m 2770 "${TIDY_DATA_DIR}" "${TIDY_ASSETS_DIR}"
install -d -m 700 "${TIDY_BACKUP_DIR}" "${STATE_DIR}"
chmod 600 "${ENV_FILE}"

APP_IMAGE_TAG="$(git -C "${REPO_DIR}" rev-parse HEAD)"
export APP_IMAGE_TAG
log "Building tested production image ${APP_IMAGE_TAG}."
docker build --pull --target production -t "tidy-week:${APP_IMAGE_TAG}" "${REPO_DIR}"
compose up -d --remove-orphans app
wait_for_health
printf '%s\n' "${APP_IMAGE_TAG}" > "${STATE_DIR}/current-sha"

log "Initial setup complete: $(health_url)"
