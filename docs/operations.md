# Operations

Run production commands from `/srv/tidy-week` as the production user.

## Status and logs

The `ops/tidy.sh` wrapper loads the production environment and current image tag before invoking Compose:

```bash
./ops/tidy.sh ps
./ops/tidy.sh logs --tail=100 app
./ops/tidy.sh logs -f app
./ops/tidy.sh restart app
```

Check application health:

```bash
curl --fail http://127.0.0.1:8788/api/health/live
curl --fail http://127.0.0.1:8788/api/health/ready
```

Use the configured LAN IP instead of loopback when applicable. Readiness opens SQLite and runs `PRAGMA quick_check`.

## Release state

```bash
cat .deploy/current-sha
cat .deploy/previous-sha
git log -1 --oneline
docker images 'tidy-week:*'
```

The Git commit, current image tag, and `.deploy/current-sha` should agree.

## Backups

```bash
./ops/backup/backup.sh
systemctl list-timers tidy-week-backup.timer
sudo journalctl -u tidy-week-backup.service --since today
```

See [Backup and restore](backup-restore.md) before deleting, moving, or restoring data.

## Disk use

```bash
du -sh /srv/tidy-week/data /srv/tidy-week/assets /srv/tidy-week/backups
docker system df
```

PDF bytes are transient; chart manifests remain in SQLite. Chromium and tagged images are the largest reproducible artifacts. Do not prune the current or previous Tidy Week image.

## Common problems

### Port already in use

Port 3000 is reserved for Henry, 8787 for Kate, and 3010 for Tidy Week development. Production defaults to 8788.

Inspect before changing configuration:

```bash
sudo ss -ltnp
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Use a distinct port rather than stopping another family service.

### Docker permission denied

Confirm that the login session has refreshed after joining the Docker group:

```bash
id
ls -l /var/run/docker.sock
docker info
```

The Codex sandbox may still be denied even when a normal host terminal works; validate from the host terminal used for operations.

### Dirty production checkout

Deployment deliberately refuses a dirty tree. Inspect it instead of resetting blindly:

```bash
git status --short
git diff
```

Production should never contain hand-edited tracked files. Commit changes in development, push them, and redeploy.

### Database permissions

The container runs as UID 1001. Setup creates setgid data/assets directories owned by UID 1001 and the configured `TIDY_DATA_GID`. If startup logs show `SQLITE_CANTOPEN` or read-only errors, compare:

```bash
id -g
grep TIDY_DATA_GID .env
ls -ld /srv/tidy-week/data /srv/tidy-week/assets
ls -l /srv/tidy-week/data
```

Rerun `./ops/setup.sh` after correcting the group rather than making the directories world-writable.

### PDF generation fails

Production installs `/usr/bin/chromium` and sets `PDF_CHROMIUM_PATH`. Check container logs and verify the binary:

```bash
./ops/tidy.sh exec app /usr/bin/chromium --version
./ops/tidy.sh logs --tail=100 app
```

Local native development requires `npx playwright install chromium`.

### Readiness is unhealthy

```bash
./ops/tidy.sh ps
./ops/tidy.sh logs --tail=200 app
sqlite3 /srv/tidy-week/data/app.sqlite 'PRAGMA quick_check;'
```

Do not run repair commands before taking a consistent backup. A failed integrity check is a restore event, not a reason to delete WAL files while the app is running.

## Host restart check

After planned host maintenance:

```bash
systemctl is-active docker
./ops/tidy.sh ps
curl --fail http://127.0.0.1:8788/api/health/ready
systemctl list-timers tidy-week-backup.timer
```
