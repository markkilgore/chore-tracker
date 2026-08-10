# Tidy Week

Tidy Week is a self-hosted family chore tracker. The web application is the source of truth, and personalized weekly PDF charts are a first-class product surface.

## What works today

- Children, parents, and other adults share one household-member model.
- Reusable chore definitions are separate from recurring responsibilities.
- Responsibilities can be fixed, deterministically rotated, or left open to eligible members.
- Sunday–Saturday weeks are generated from standing schedules and then edited independently.
- One-off chores, week-only cancellation, moving, reassignment, ordering, completion, undo, and correction are supported.
- The parent board, Chore Library, Family profiles, and touch-friendly Kid Today view are implemented.
- Sunny, Space, Ocean, Italy, Cats, and Sharks themes work on digital and printable surfaces.
- Issued charts have immutable snapshots, QR codes, checksums, and occurrence-linked checkbox manifests.
- SQLite persistence, deterministic seed data, health checks, production containers, deployment rollback, and consistent backups are included.

V1 is intended for a trusted home LAN. Attribution is recorded, but there is no security-grade authentication. Do not expose it directly to the public internet.

## Quick start

Requirements: Node.js 22 or newer and npm. Docker is optional for development.

```bash
npm install
npm run db:migrate
npm run db:seed
npx playwright install chromium
npm run dev
```

Open `http://127.0.0.1:3010`. Port 3010 is intentional: port 3000 is already reserved by another service on the NUC.

The seed command is idempotent and creates two children, an adult, individual chores, rotating and open household chores, adjacent weeks, and completion history. Omit it to use the first-run household setup instead.

## Everyday commands

```bash
npm test                 # domain, SQLite, print, and isolation tests
npm run typecheck        # strict TypeScript validation
npm run build            # production Next.js build
npm run db:check         # SQLite integrity check
npm run db:backup -- /tmp/tidy-week.sqlite
```

## Documentation

- [Product guide](docs/product-guide.md): how the parent, kid, and print workflows behave.
- [Architecture](docs/architecture.md): boundaries, data model, scheduling, SQLite, and PDFs.
- [API reference](docs/api.md): V1 routes and concurrency behavior.
- [Development](docs/development.md): native, Docker, Mac, seed, database, and test workflows.
- [Production deployment](docs/deployment.md): NUC setup, host conventions, deploy, and rollback.
- [Operations](docs/operations.md): status, logs, health, disk use, and troubleshooting.
- [Backup and restore](docs/backup-restore.md): timer installation, retention, recovery, and rebuild.

## Repository layout

```text
apps/web/             Next.js UI, REST API, and PDF endpoint
packages/domain/      Framework-neutral recurrence and allocation logic
packages/contracts/   Shared Zod API contracts
packages/database/    SQLite schema, migrations, repositories, and services
ops/                  Compose, setup, deploy, rollback, backup, and restore
docs/                 Product and operator documentation
```

Development uses the ignored `.local/dev/app.sqlite`. Production uses a separate pull-only checkout, image, port, environment file, and `/srv/tidy-week` persistence. Production never mounts the development working tree.
