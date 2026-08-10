# Production deployment on the NUC

Tidy Week follows the established Kate/Henry Docker conventions on this box:

- Pull-only production checkout under `/srv`.
- Development checkout under the user's development directory.
- Docker Compose with a host-path SQLite volume.
- Reserved loopback/LAN port, `restart: unless-stopped`, 30-second graceful shutdown, and health checks.
- Clean `main` branch, fast-forward deployment, pre-deploy backup, health verification, and automatic code rollback.
- Daily persistent systemd backup timer.

Tidy Week adds SHA-tagged immutable images so rollback does not depend on rebuilding old source.

## Host service conventions

The repository configurations inspected on this NUC use the following ports:

| Service | Host exposure | Purpose |
|---|---|---|
| Henry | `127.0.0.1:3000`, fronted by Caddy/TLS | Microphone access requires a secure browser context. |
| Kate | reserved LAN IP on `8787` | Direct trusted-LAN application. |
| Tidy Week | `127.0.0.1:8788` by default | Change to the reserved LAN IP for direct family-device access. |
| Tidy Week development | `127.0.0.1:3010` | Active development checkout only. |
| CB dashboard | `8850` | Separate read-only dashboard. |

Tidy Week does not currently need Caddy or a local certificate because it does not request microphone/camera access. Do not copy Henry's TLS complexity unless a future browser feature requires it.

The Codex sandbox could read these configurations but could not access the Docker socket or privileged systemd state. Confirm actual live ports and containers from a normal host terminal before first deployment.

## Prerequisites

Verify:

```bash
docker version
docker compose version
docker ps
git --version
sqlite3 --version
```

If Docker access is denied, follow the same host setup used by the other services:

```bash
sudo usermod -aG docker "$USER"
```

Log out and back in, then rerun `docker ps`. Docker-group membership is root-equivalent.

## Git and production checkout

The development checkout must first be a normal Git repository with a remote. Commit and push a tested `main` branch.

Create a separate production checkout:

```bash
sudo install -d -o "$(id -u)" -g "$(id -g)" /srv/tidy-week
git clone git@github.com:OWNER/REPOSITORY.git /srv/tidy-week
cd /srv/tidy-week
git switch main
```

Replace the example remote. `/srv/tidy-week` is pull-only production: do not edit tracked files there. Development continues in the development checkout.

## Production configuration

```bash
cd /srv/tidy-week
cp ops/production.env.example .env
chmod 600 .env
```

Review at least:

```dotenv
TIDY_BIND_ADDRESS=127.0.0.1
TIDY_HOST_PORT=8788
TIDY_DATA_DIR=/srv/tidy-week/data
TIDY_ASSETS_DIR=/srv/tidy-week/assets
TIDY_BACKUP_DIR=/srv/tidy-week/backups
TIDY_BACKUP_RETENTION=14
TIDY_DATA_GID=1000
APP_ORIGIN=http://127.0.0.1:8788
```

Set `TIDY_DATA_GID` to the production user's numeric group from `id -g`.

For direct access from family devices, reserve the NUC IP in DHCP, set `TIDY_BIND_ADDRESS` to that exact IP, and set `APP_ORIGIN` to the corresponding URL. The on-disk Henry configuration currently references `10.0.0.252`, but verify the address with `ip -4 address` rather than assuming it is unchanged.

Keep loopback binding if another local reverse proxy will provide access. Avoid `0.0.0.0` unless exposure on every host interface is intentional. Do not configure router port forwarding.

## First deployment

Make scripts executable if the Git transport did not preserve modes:

```bash
chmod +x ops/*.sh ops/*/*.sh
```

Run setup as the production user:

```bash
./ops/setup.sh
```

Setup verifies Linux, Git cleanliness, Docker, Compose, the port/path configuration, and the configured bind address. It creates group-accessible data/assets directories for container UID 1001, builds an image that runs tests/typecheck/build, starts Compose, and waits for SQLite readiness.

Open the configured URL and create the real household. Production refuses the demo-seed action.

Install daily backups:

```bash
./ops/install-backup-timer.sh
```

## Deploy an update

From `/srv/tidy-week`, deploy `origin/main`:

```bash
./ops/deploy/deploy.sh
```

Or pin an explicit tested commit that is a fast-forward from production:

```bash
./ops/deploy/deploy.sh <full-git-sha>
```

The script refuses dirty/off-main/non-fast-forward deployment, creates a consistent database backup, fast-forwards the checkout, builds `tidy-week:<sha>`, starts it, and checks health. If build/start/health fails, it resets the clean production checkout and restarts the prior tagged image. Database state is never automatically rolled back during code rollback.

## Roll back code

```bash
./ops/deploy/rollback.sh
```

Rollback takes another database snapshot, switches the clean checkout and Compose image to the recorded previous SHA, and verifies health. If the old image is unhealthy, it returns to the current release. Restore data separately only when a migration or user action requires it.

Database migrations should remain backward-compatible with at least the previous application release. Make destructive schema changes in phases; an image rollback does not reverse an already-applied migration.

## Persistence and restart behavior

- Checkout/config: `/srv/tidy-week`
- Database: `/srv/tidy-week/data/app.sqlite`
- Future uploads: `/srv/tidy-week/assets`
- Local backups: `/srv/tidy-week/backups`
- Release metadata: `/srv/tidy-week/.deploy/{current-sha,previous-sha}`
- Compose project: `tidy-week`
- Container image: `tidy-week:<git-sha>`

The source checkout is not mounted into production. `restart: unless-stopped` allows Docker to recover the container after host restart; a separate application systemd unit is unnecessary.
