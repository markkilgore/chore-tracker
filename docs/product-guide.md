# Product guide

## First household

An empty installation opens a first-run screen. Create the real household there. The demo-seed action is disabled when `APP_ENV=production`.

Household members can be children, adults, or other members. Administrative capability is stored separately from member type, so an adult is not automatically an administrator and a chore assignee is never assumed to be a child.

The Family page can remove a member who was added accidentally and has never been used. Members referenced by responsibilities, weekly chores, completions, or issued charts are retained to protect household history; reassign or end their work rather than silently deleting those records.

## Add chores and family schedules

Use **Add chore** on the board or **Chores & schedules**. Choose one or several existing chores, or enter a new name and optional note. Choose people and how they share the work:

- **Each person does this:** everyone selected gets their own chore and checkbox. “Make bed” for two children takes one save.
- **Take turns:** one person is assigned each chore day, or for the whole scheduled week. Move people earlier in the ordered list to choose who starts. The review shows upcoming turns.
- **Anyone can do it:** one household chore is available to the selected people.

Choose **Every day**, **Weekdays**, **Weekends**, or individual days. Frequency includes every week and every other week. Add a routine and optional end date. Start today, next week, or on a chosen date.

**Review changes** shows the people and recurrence, counts of upcoming additions/updates/removals in existing weeks, retained completed chores and manual exceptions, matching assignments skipped, and charts needing reprinting. The optional two-week preview shows the recurring pattern; manual exceptions take precedence. **Save changes** applies the entire batch together. Retrying a saved request does not create it again. A change in another session requires a fresh review.

## Edit, stop, and copy schedules

**Edit schedule** changes people, days, frequency, routine, and end date from the chosen effective date. Earlier dates retain the old schedule even if their weeks are opened later. An edit creates a historical version internally; parents do not need to stop and recreate it. For a replacement schedule, the change date must be on or after that version’s start.

**Stop…** removes upcoming unfinished work from the effective date, including weeks already opened. Both edits and stops preserve chores with completion history and explicit manual exceptions (moves, skips/restores, reassignments, and ordering). Existing paper charts stay immutable. Kept exceptions may remain after a schedule ends; manage those individually on the board.

**Copy schedule from…** copies selected individual chores to another person. Review each chore and adjust recipients, days, frequency, or routine before saving. Exact matching assignments are skipped. Alternating-week copies keep their source schedule's week pattern. Shared chores and rotations are managed on the family schedule rather than copied as personal work.

Schedules are grouped by routine and can be filtered by person or routine. Ended versions are hidden unless **Show ended schedules** is selected. In **Family**, use **Manage chores** to see and edit a person's routines or add/copy chores for them. Chore names and notes remain editable under the collapsed library section; existing weekly display snapshots retain their text.

## Weekly board and Today list

Opening a week creates it from the schedules effective on its dates. Explicit schedule changes also update upcoming work in already-opened weeks. Visiting a week alone never erases manual changes.

Use the card menu for **Just this occurrence** actions: reassign, move within the week, reorder, or skip/restore. **Edit this and future occurrences…** opens the recurring editor with that date selected. Historical occurrences lead to the latest replacement schedule. Use **One-time chore** for an existing chore that belongs on a single day.

The board has one lane per person and one Household lane. **Today / list** provides a compact routine-grouped view with a person filter and large completion controls; it is the default on phones when opening the current week. The weekly grid remains available.

First-run setup detects the browser timezone and guides parents through **Add family → Choose chores → Review week**. Demo data remains development-only.

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

Editing the live week after issuing a chart does not alter that chart. The board flags the latest issued charts when their plan revision is older than the live week. Issue updated charts to clear the notice.

**Print family charts** issues charts for all active family members in one action, then provides one preview with **Print family charts / Save as PDF**. Individual child charts remain available. Printing opens through an explicit link so browser popup blocking does not discard the preview.

Sunny, Space, Ocean, Italy, Cats, Sharks, and Sharks & Dinos themes share the same chart layout and stable checkbox geometry. Cats and Sharks & Dinos add low-ink storybook header artwork while preserving the standardized grid. The demo household starts Kate with Cats and Henry with Sharks & Dinos; an existing household can select either theme from the Family page.

## Deliberately post-MVP

Full authentication, internet exposure, shared chores requiring several confirmations, weekly quota chores, rewards/allowance, paper scanning, notifications, and native iOS/iPad clients remain future work. The current API and domain boundaries leave room for them without making V1 operate like a larger service.
