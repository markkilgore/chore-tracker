#!/usr/bin/env bash

set -Eeuo pipefail

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${OPS_DIR}/common.sh"

require_command sudo
load_environment

service_template="${REPO_DIR}/ops/systemd/tidy-week-backup.service"
timer_template="${REPO_DIR}/ops/systemd/tidy-week-backup.timer"
[[ -f "${service_template}" ]] || fail "Missing ${service_template}"
[[ -f "${timer_template}" ]] || fail "Missing ${timer_template}"

temporary="$(mktemp)"
cleanup() { rm -f "${temporary}"; }
trap cleanup EXIT

sed \
  -e "s|__TIDY_USER__|$(id -un)|g" \
  -e "s|__TIDY_GROUP__|$(id -gn)|g" \
  -e "s|__TIDY_REPO__|${REPO_DIR}|g" \
  "${service_template}" > "${temporary}"

sudo install -m 644 "${temporary}" /etc/systemd/system/tidy-week-backup.service
sudo install -m 644 "${timer_template}" /etc/systemd/system/tidy-week-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now tidy-week-backup.timer

log "Installed daily backup timer."
sudo systemctl list-timers tidy-week-backup.timer --no-pager
