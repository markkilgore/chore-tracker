#!/usr/bin/env bash

set -Eeuo pipefail

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${OPS_DIR}/.." && pwd)"
PROD_COMPOSE_FILE="${REPO_DIR}/ops/compose/compose.prod.yml"
ENV_FILE="${TIDY_ENV_FILE:-${REPO_DIR}/.env}"
STATE_DIR="${TIDY_STATE_DIR:-${REPO_DIR}/.deploy}"

log() {
  printf '[tidy-week] %s\n' "$*"
}

fail() {
  printf '[tidy-week] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

load_environment() {
  [[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}. Copy ops/production.env.example to .env and review it."
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a

  : "${TIDY_BIND_ADDRESS:=127.0.0.1}"
  : "${TIDY_HOST_PORT:=8788}"
  : "${TIDY_DATA_DIR:=/srv/tidy-week/data}"
  : "${TIDY_ASSETS_DIR:=/srv/tidy-week/assets}"
  : "${TIDY_BACKUP_DIR:=/srv/tidy-week/backups}"
  : "${TIDY_BACKUP_RETENTION:=14}"
  : "${TIDY_DATA_GID:=1000}"
  : "${APP_IMAGE_TAG:=bootstrap}"

  if [[ -f "${STATE_DIR}/current-sha" ]]; then
    APP_IMAGE_TAG="$(<"${STATE_DIR}/current-sha")"
  fi
  export TIDY_BIND_ADDRESS TIDY_HOST_PORT TIDY_DATA_DIR TIDY_ASSETS_DIR
  export TIDY_BACKUP_DIR TIDY_BACKUP_RETENTION TIDY_DATA_GID APP_IMAGE_TAG
}

compose() {
  docker compose \
    --project-name tidy-week \
    --project-directory "${REPO_DIR}" \
    --file "${PROD_COMPOSE_FILE}" \
    --env-file "${ENV_FILE}" \
    "$@"
}

health_url() {
  local host="${TIDY_BIND_ADDRESS}"
  [[ "${host}" == "0.0.0.0" ]] && host="127.0.0.1"
  printf 'http://%s:%s/api/health/ready' "${host}" "${TIDY_HOST_PORT}"
}

wait_for_health() {
  local attempts="${1:-${TIDY_HEALTH_ATTEMPTS:-30}}"
  local delay="${2:-${TIDY_HEALTH_DELAY_SECONDS:-2}}"
  local url
  url="$(health_url)"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 3 "${url}" >/dev/null; then
      log "Health check passed: ${url}"
      return 0
    fi
    sleep "${delay}"
  done

  log "Health check failed after $((attempts * delay)) seconds."
  compose logs --no-color --tail=100 app >&2 || true
  return 1
}
