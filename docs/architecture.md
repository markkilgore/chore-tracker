# Architecture

## System boundary

Tidy Week is one deployable Next.js application with a versioned REST API and local SQLite database:

```text
React UI / future Expo client
             |
        /api/v1 contracts
             |
      application services
             |
 framework-neutral scheduling domain
             |
          SQLite
```

There is no separate API container or database server. This keeps a single-family installation easy to operate while preserving a client-independent API.

## Package responsibilities

- `packages/domain` owns date-only calendar operations, Sunday week boundaries, recurrence expansion, deterministic rotation, and allocation types. It imports neither React nor SQLite.
- `packages/contracts` owns Zod request validation, wire-level types, and the client-neutral theme catalog.
- `packages/database` owns migrations, WAL/foreign-key configuration, transactions, repositories, plan revisions, completions, and chart snapshots.
- `apps/web` owns the Next.js UI, route handlers, themes, print HTML, and Chromium PDF response.

The UI may use server-side services for initial rendering, but every interaction needed by a future native client also has a JSON API boundary.

## Core records

| Record | Source-of-truth responsibility |
|---|---|
| `households` | Name, timezone, locale/week convention. |
| `household_members` | General member identity, type, active state, and administrative capability. |
| `member_profiles` | Theme, avatar placeholder, child-oriented presentation preferences. |
| `chore_definitions` | Reusable description of work; never duplicated per assignee. |
| `routines` | Household-owned display grouping and ordering. |
| `responsibility_templates` | Effective-dated standing recurrence and allocation policy. |
| `responsibility_participants` | Fixed member, ordered rotation, or eligible open participants. |
| `weekly_plans` | One materialized plan per household and Sunday-starting week. |
| `chore_occurrences` | Effective dated work for a generated week, including display snapshots. |
| `occurrence_assignees` | Planned responsibility; absent for open work. |
| `weekly_plan_changes` | Append-only record of week-specific changes. |
| `completions` | Actual completer, recorder, timestamp, and void/correction history. |
| `chart_exports` | Immutable print input and checkbox manifest, not PDF bytes. |

## Scheduling source of truth

```text
standing responsibility
        -> generate week once
        -> edit/cancel/add dated occurrences
        -> record completions
        -> issue immutable chart snapshot
```

There is intentionally no second effective `weekly_overrides` overlay. After materialization, occurrences are the schedule for that week. Audit records explain how they changed, but do not compete with them to calculate current state.

Generation is transactional and idempotent. A source-instance key prevents the same template/date pair from generating twice. Viewing an existing week does not reconcile it against later template edits.

## Allocation semantics

- **Fixed:** one planned member. Another household member may still be recorded as the actual completer.
- **Rotation:** one occurrence and one deterministic assignee. The result depends on anchor date, recurrence sequence, participant order, and offset—not generation order.
- **Open:** no planned assignee. An eligible member becomes the actual completer.

Multi-member shared completion is not simulated with duplicate occurrences. It will require an explicit future completion policy.

## Dates and concurrency

Schedule dates are ISO `YYYY-MM-DD` values and are manipulated as calendar dates. Event timestamps are UTC. The household IANA timezone determines “today”; daylight-saving transitions do not shift stored due dates.

SQLite uses WAL mode, foreign keys, a five-second busy timeout, short `BEGIN IMMEDIATE` write transactions, and one production application instance. Weekly edits use an optimistic revision number and return HTTP 409 for a stale client.

## PDF and future scanning

Chart issuance stores labels, applicable cells, theme/layout versions, plan revision, checksum, and deterministic checkbox geometry. Playwright drives pinned Chromium to render explicit Letter-sized HTML/CSS.

The QR payload identifies the chart snapshot. Future scan processing can find corner markers, correct perspective, load the manifest, and map checkbox coordinates to occurrence IDs without trying to infer the schedule from text.

## Persistence and migration

The production database must remain on a local filesystem. WAL-mode SQLite on NFS, SMB, or similar shared storage is unsupported. PostgreSQL becomes relevant only if the service later needs multiple application replicas or sustained concurrent writes.

Migrations are checked into `packages/database` and applied when the application opens the database. Production deployment always creates a consistent pre-deploy backup before starting a new image. Migrations should be additive or otherwise compatible with the previous release so an application-image rollback remains safe; destructive changes require a phased migration.
