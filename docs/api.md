# API reference

The API is JSON under `/api/v1`. V1 is trusted-LAN software: routes validate input and household relationships, but they do not authenticate a network identity.

## Errors and revisions

Validation and domain errors return a JSON object such as:

```json
{ "error": "One-off date is outside this week" }
```

Week-changing requests carry `expectedRevision`. If another session changed the plan first, the API returns HTTP 409 and the client refreshes before retrying.

## Read model

### `GET /api/v1/dashboard?date=YYYY-MM-DD`

Returns the household, active members, chores, routines, standing responsibilities, the materialized week containing `date`, and latest per-member chart statuses (`charts`, including `stale`). If no household exists, it returns `null`.

### `GET /api/v1/chart-exports/:chartId`

Returns the immutable chart snapshot, checksum, and checkbox manifest.

## Setup and library

### `POST /api/v1/setup`

The `action` discriminator supports:

- `household`: name and IANA timezone.
- `member`: name, `CHILD/ADULT/OTHER`, theme, and administrative capability.
- `chore`: title, description, and `INDIVIDUAL/HOUSEHOLD` kind.
- `responsibility`: chore, routine, start date, weekdays, interval, and allocation rule.
- `seed`: deterministic development data; rejected in production.

### `PATCH /api/v1/chores/:choreId`

Updates future-facing chore-definition fields. Existing occurrences retain their display snapshots.

### `PATCH /api/v1/members/:memberId`

Updates member name, type, administrative flag, or theme.

### `DELETE /api/v1/members/:memberId`

Removes an accidentally added, unused member. The request is rejected when responsibilities, occurrences, completions, weekly changes, or chart exports reference the member, preserving historical identity.

### `PATCH /api/v1/responsibilities/:templateId`

Actions:

- `end` with `activeThrough`: stops the schedule beginning the following date and reconciles existing upcoming weeks.
- `reassign` with `memberId` and `effectiveFrom`: creates an effective-dated fixed-assignee replacement and reconciles existing upcoming weeks. Completion history and manual exceptions remain unchanged. Prefer the preview-based schedules endpoint for new clients.

### `DELETE /api/v1/responsibilities/:templateId`

Deletes a responsibility created in error and removes its unused generated occurrences. The request is rejected when completions, replacements, or successor templates depend on it. Affected weekly-plan revisions are incremented. Existing chart exports remain immutable snapshots; clients should issue a replacement chart after correcting a printed week.

## Family schedule batches

### `POST /api/v1/schedules`

Send `{ change, preview: true, requestId }` to review, then `{ change, preview: false, requestId, token }` with the returned token to commit. `requestId` is a UUID retained across retries of the same save. A changed payload must use a new request ID.

`change` contains:

- `action`: `create`, `edit`, or `stop`.
- `effectiveFrom`: real ISO calendar date.
- `templateIds`: empty for create, one for edit, one or more for stop.
- `entries`: empty for stop; otherwise one or more schedule drafts.

Each draft contains `choreDefinitionId` or a new `title` (with optional `description`), nullable `routineId`, `mode` (`each`, `rotation`, `open`), ordered `memberIds`, `weekdays`, `intervalWeeks`, `rotationCadence` (`occurrence`, `week`), and nullable `activeThrough`. Optional `anchorDate` preserves the phase when copying an alternating-week schedule. New titles reuse active library chores with the same case-insensitive name.

Preview returns `added`, `updated`, `removed`, `keptCompleted`, `keptExceptions`, `duplicatesSkipped`, affected `weeks` and `charts`, a two-week `examples` list, and `token`. Counts describe already-generated weeks. Preview creates no lasting records. All commit mutations happen together; a stale preview returns 409. Retrying a successful request returns its original result without repeating changes.

## Weekly editing

### `POST /api/v1/weeks/:planId/one-offs`

Creates a one-off occurrence inside the plan's week with optional assignee and routine.

### `PATCH /api/v1/occurrences/:occurrenceId`

Actions:

- `cancel` / `restore`
- `move` with another date in the same week
- `reassign` with a member ID or `null` for open
- `reorder` with a week-specific sort value

Each action records a weekly-plan change and increments the revision.

## Completions

### `POST /api/v1/occurrences/:occurrenceId/completion`

Records `completedByMemberId` and optional `recordedByMemberId`. Open chores enforce their eligible-member list; assigned chores allow a different actual completer.

### `DELETE /api/v1/occurrences/:occurrenceId/completion`

Voids the active completion instead of deleting history.

## Charts

### `POST /api/v1/chart-exports`

Issues an immutable chart for `weeklyPlanId` and `memberId`, optionally overriding the member theme. Returns preview and PDF URLs. Alternatively send `{ weeklyPlanId, family: true }` to issue all active members’ charts atomically and receive one combined `previewUrl`.

### `GET /api/v1/chart-exports/:chartId/pdf`

Regenerates and downloads the deterministic PDF. Response headers include the chart ID and checksum.

## Health

- `GET /api/health/live`: process liveness only.
- `GET /api/health/ready`: opens SQLite and runs `PRAGMA quick_check`; used by Compose and deployment scripts.
