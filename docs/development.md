# Development

Development can run directly on the NUC or on a Mac. It never needs a copy of production data.

## Prerequisites

- Node.js 22 or newer; the NUC currently has Node.js 24.
- npm.
- Git.
- Docker Engine with Compose, or Docker Desktop on macOS, when using containers.
- Playwright's Chromium build for local PDF generation.

## Native Node workflow

```bash
npm install
npm run db:migrate
npm run db:seed
npx playwright install chromium
npm run dev
```

Open `http://127.0.0.1:3010`. The development port is 3010 because Henry's production service owns port 3000 on this NUC.

Configuration defaults are sufficient. Copy `.env.example` to `.env.development.local` only for intentional overrides; never point `DATABASE_PATH` at `/srv/tidy-week`.

The ignored development database is `.local/dev/app.sqlite`. The application also applies outstanding migrations when it first opens the database.

## Docker workflow

```bash
docker compose -p chore-dev -f ops/compose/compose.dev.yml up --build
```

The development Compose project:

- Publishes only `127.0.0.1:3010`.
- Bind-mounts the active source checkout for hot reload.
- Uses `.local/dev` for data.
- Uses a development-only `chore_dev_node_modules` volume.
- Shares no port, path, volume, environment file, image, or Compose project with production.

If Docker reports permission denied, verify `docker ps` in a normal terminal. On this NUC, the established service convention is membership in the `docker` group followed by a logout/login. Docker-group access is root-equivalent and should be limited to trusted host users.

## macOS setup

1. Install Git and Docker Desktop, or Node.js 22+ for native development.
2. Clone the Git repository.
3. Run the native or Docker workflow above.
4. Use seed data; do not copy the NUC's production SQLite file.

The database is portable, but native dependencies such as `better-sqlite3` must be installed on the target machine through `npm install`, not copied from another checkout.

## Seed and clean-room data

`npm run db:seed` is idempotent. It creates:

- Kate, Henry, and an adult administrator.
- Individual daily and weekly work.
- A rotating household chore.
- An eligible-member open chore.
- Previous, current, and next weeks.
- Completion history and child themes.

To start over without destroying the existing demo file, stop the app and move the directory aside:

```bash
mv .local/dev ".local/dev.saved-$(date +%Y%m%d-%H%M%S)"
npm run db:migrate
```

Then use first-run setup or run the seed again.

## Database commands

```bash
npm run db:migrate
npm run db:seed
npm run db:check
npm run db:backup -- /tmp/tidy-week.sqlite
```

Do not copy a live WAL-mode database with `cp`. Use `db:backup` or SQLite's `.backup` API so the main file and WAL are captured consistently.

## Tests and build

```bash
npm test
npm run typecheck
npm run build
make compose-check
make compose-check-prod
```

The suite covers calendar boundaries, DST-local dates, recurrence, out-of-order rotation generation, week materialization, explicit current-week application, overrides, optimistic revisions, open eligibility, actual-versus-planned completers, correction history, chart manifests, print HTML, SQLite health, migrations, documentation links, and development/production isolation.

The production Docker build runs tests, type checking, and the Next.js build inside the builder stage before producing an image.

## Generated and local-only files

The root `.gitignore` excludes npm/Next outputs, TypeScript caches, local databases, environment files, production data directories, logs, test reports, editor settings, and common OS metadata. `.env.example` remains tracked; real `.env*` files do not.
