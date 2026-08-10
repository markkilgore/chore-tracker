# Product guide

## First household

An empty installation opens a first-run screen. Create the real household there. The demo-seed action is disabled when `APP_ENV=production`.

Household members can be children, adults, or other members. Administrative capability is stored separately from member type, so an adult is not automatically an administrator and a chore assignee is never assumed to be a child.

The Family page can remove a member who was added accidentally and has never been used. Members referenced by responsibilities, weekly chores, completions, or issued charts are retained to protect household history; reassign or end their work rather than silently deleting those records.

## Chore Library and standing schedules

A **chore definition** is reusable, such as `Make bed` or `Feed dog`. Create it once even when several people perform it.

A **standing responsibility** combines that definition with:

- Applicable weekdays.
- An optional routine such as Morning or Evening.
- An effective start date.
- A fixed, rotating, or open allocation rule.

For two children making their beds, create one `Make bed` definition and two fixed responsibilities. For a household `Feed dog` rotation, create one definition and one rotating responsibility.

Stopping a standing responsibility affects future ungenerated weeks. Existing generated weeks remain unchanged. To replace a schedule safely, stop the old responsibility and create its replacement; this preserves historical weeks.

## Weekly board

Opening a week generates it once from the standing schedule. From that point, the generated week is authoritative.

Use the card menu to:

- Reassign an occurrence or make it open.
- Move it to another day in the same week.
- Move its chore earlier or later in that week.
- Skip or restore it for that week.

Use **One-off chore** for work that belongs only to the selected week. Creating a new standing responsibility offers an explicit option to add its matching dates to an already-generated selected week.

The board has one lane per member and one Household lane. Household chores exist once; reassignment moves the same occurrence rather than creating a copy.

## Completions and corrections

Select **Recording as** before making parent-operated changes. Completing a chore records both the planned assignee and the person who actually completed it. Those may differ for an assigned chore. Open chores enforce their eligible-member list.

Click a checked control again to undo it. Corrections void the prior completion rather than deleting history, leaving an audit trail in the database.

## Kid Today

Open a child's Today view from the Family page or member summary. It shows only today's assigned work and open household chores for which that child is eligible. Controls are intentionally large, routine-grouped, and navigation-light.

V1 trusts the selected member. A PIN or account system is a future security layer, not part of current identity enforcement.

## Printable charts

The parent board can issue a personalized chart for each child. Issuing a chart stores an immutable snapshot and cell manifest; PDF bytes are regenerated on demand.

The PDF is US Letter portrait and contains:

- Member name and Sunday-starting week.
- Physical checkboxes for applicable dates.
- Theme styling.
- A chart ID, checksum, QR code, and page markers.
- Stable occurrence identifiers and deterministic checkbox coordinates in the retained manifest.

Editing the live week after issuing a chart does not alter that chart. Issue a new chart to reflect the new schedule.

Sunny, Space, Ocean, Italy, Cats, and Sharks themes share the same chart layout and stable checkbox geometry. A theme changes presentation without changing schedule or scan metadata.

## Deliberately post-MVP

Full authentication, internet exposure, shared chores requiring several confirmations, weekly quota chores, rewards/allowance, paper scanning, notifications, and native iOS/iPad clients remain future work. The current API and domain boundaries leave room for them without making V1 operate like a larger service.
