# Backup and restore

## Durable state

Back up:

- `/srv/tidy-week/data/app.sqlite`: household, schedules, occurrences, completion history, and chart manifests.
- `/srv/tidy-week/assets`: future uploaded avatars/assets.
- `/srv/tidy-week/.env`: protected configuration.
- `/srv/tidy-week/.deploy/current-sha`: deployed code/image version.

Do not back up generated PDF bytes, Next.js output, npm packages, or Docker images as primary recovery data. They are rebuilt from Git.

## Snapshot format

Each local snapshot is a timestamped directory:

```text
/srv/tidy-week/backups/20260810T080000Z/
  app.sqlite.gz
  assets.tar.gz
  manifest.txt
```

The backup script uses SQLite's online `.backup`, runs `PRAGMA integrity_check` on the snapshot, compresses it, records the Git SHA, and only then publishes the completed directory. It retains the newest `TIDY_BACKUP_RETENTION` local snapshots, default 14.

Never use plain `cp` on the live database; WAL state may not be captured consistently.

## Install the daily timer

From the pull-only production checkout:

```bash
./ops/install-backup-timer.sh
```

The systemd timer is persistent, so a missed run occurs after the NUC returns. It adds up to 15 minutes of randomized delay.

Verify:

```bash
systemctl list-timers tidy-week-backup.timer
sudo systemctl start tidy-week-backup.service
sudo journalctl -u tidy-week-backup.service --since today
ls -lh /srv/tidy-week/backups
```

## Manual and pre-deploy backups

```bash
./ops/backup/backup.sh
```

Deployment and code rollback also invoke this command automatically when a production database exists.

## Off-box copy

Local snapshots protect against application and operator mistakes but not disk or host loss. Configure `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` in `.env` to copy each completed snapshot to a NAS, external disk, or another machine. The script applies 7 daily, 4 weekly, and 12 monthly Restic retention.

Protect a copy of `.env` and the Restic password separately. Do not commit either one.

## Restore a selected snapshot

Read its version first:

```bash
cat /srv/tidy-week/backups/TIMESTAMP/manifest.txt
```

Ideally deploy the recorded Git SHA before restoring an older schema. Then run the destructive restore explicitly:

```bash
sudo /srv/tidy-week/ops/restore/restore.sh \
  /srv/tidy-week/backups/TIMESTAMP RESTORE
```

Restore performs these safeguards:

1. Decompress and integrity-check the selected database before stopping the app.
2. Preserve the current database in a temporary consistent snapshot.
3. Stop the application and remove only its exact stale `-wal`/`-shm` companions.
4. Install the selected database with the production UID/GID.
5. Restore retained assets when present.
6. Start the application and wait for readiness.
7. Recover the preserved pre-restore database automatically if the selected snapshot is unhealthy.

After success, verify the household/member counts in the UI, completion history, and one PDF export.

## Replacement-machine recovery

1. Install Git, Docker Engine/Compose, SQLite, and Restic if used.
2. Clone the repository to `/srv/tidy-week` and check out the SHA from `manifest.txt`.
3. Restore `.env` and run `./ops/setup.sh` to create paths/build the image.
4. Stop the empty app.
5. Copy the chosen snapshot to the host and run the restore command.
6. Reinstall the backup timer.
7. Verify readiness, UI data, a completion mutation, and PDF generation.

Practice recovery into a disposable directory/project periodically. A backup is not trustworthy until the restore procedure has been exercised.
