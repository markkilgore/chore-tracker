import type { ScheduleChange, ScheduleDraft } from "@chore-tracker/contracts";
import { createHash, randomUUID } from "node:crypto";
import {
  addDays,
  dateInTimeZone,
  daysBetween,
  generateWeekOccurrences,
  startOfWeek,
  weekDates,
  type AllocationRule,
  type ChoreKind,
  type ISODate,
  type MemberKind,
  type RecurrenceRule,
  type ResponsibilityTemplate
} from "@chore-tracker/domain";
import { getSqlite, type SqliteDatabase, withImmediateTransaction } from "./db";

const now = () => new Date().toISOString();
const id = () => randomUUID();

export interface Household {
  id: string;
  name: string;
  timezone: string;
  weekStartsOn: number;
}

export interface Member {
  id: string;
  displayName: string;
  kind: MemberKind;
  canAdminister: boolean;
  themeKey: string;
  kidViewEnabled: boolean;
}

export interface ChoreDefinition {
  id: string;
  title: string;
  description: string | null;
  kind: ChoreKind;
}

export interface Routine {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ResponsibilitySummary {
  id: string;
  choreTitle: string;
  choreDefinitionId: string;
  routineName: string | null;
  routineId: string | null;
  anchorDate: ISODate;
  rotationCadence: "occurrence" | "week";
  disabled: boolean;
  supersedesTemplateId: string | null;
  allocationKind: "fixed" | "rotation" | "open";
  participantIds: string[];
  weekdays: number[];
  intervalWeeks: number;
  activeFrom: ISODate;
  activeThrough: ISODate | null;
}

export interface WeekOccurrence {
  id: string;
  choreDefinitionId: string;
  sourceTemplateId: string | null;
  origin: "RECURRING" | "ONE_OFF" | "OVERRIDE";
  dueDate: ISODate;
  status: "SCHEDULED" | "CANCELLED";
  choreTitle: string;
  choreDescription: string | null;
  choreKind: ChoreKind;
  routineId: string | null;
  routineName: string | null;
  sortOrder: number;
  assigneeId: string | null;
  eligibleMemberIds: string[];
  completionId: string | null;
  completedByMemberId: string | null;
  completedAt: string | null;
}

export interface WeekSnapshot {
  id: string;
  householdId: string;
  weekStartDate: ISODate;
  revision: number;
  dates: ISODate[];
  occurrences: WeekOccurrence[];
}

export interface DashboardSnapshot {
  household: Household;
  members: Member[];
  chores: ChoreDefinition[];
  routines: Routine[];
  responsibilities: ResponsibilitySummary[];
  week: WeekSnapshot;
  charts: { id: string; memberId: string; stale: boolean }[];
}

export interface ChartCell {
  date: ISODate;
  occurrenceId: string | null;
  completed: boolean;
}

export interface ChartRow {
  key: string;
  title: string;
  routineName: string | null;
  cells: ChartCell[];
}

export interface ChartSnapshot {
  chartId: string;
  householdName: string;
  memberId: string;
  memberName: string;
  weekStartDate: ISODate;
  themeKey: string;
  planRevision: number;
  rows: ChartRow[];
}

type Row = Record<string, unknown>;

function mapHousehold(row: Row): Household {
  return {
    id: String(row.id),
    name: String(row.name),
    timezone: String(row.timezone),
    weekStartsOn: Number(row.week_starts_on)
  };
}

export function getFirstHousehold(db = getSqlite()): Household | null {
  const row = db.prepare("SELECT * FROM households ORDER BY created_at LIMIT 1").get() as Row | undefined;
  return row ? mapHousehold(row) : null;
}

export function listMembers(householdId: string, db = getSqlite()): Member[] {
  return (db.prepare(`
    SELECT m.id, m.display_name, m.kind, m.can_administer,
           COALESCE(p.theme_key, 'sunny') AS theme_key,
           COALESCE(p.kid_view_enabled, 0) AS kid_view_enabled
    FROM household_members m
    LEFT JOIN member_profiles p ON p.member_id = m.id
    WHERE m.household_id = ? AND m.active = 1
    ORDER BY CASE m.kind WHEN 'CHILD' THEN 0 ELSE 1 END, m.display_name
  `).all(householdId) as Row[]).map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    kind: row.kind as MemberKind,
    canAdminister: Boolean(row.can_administer),
    themeKey: String(row.theme_key),
    kidViewEnabled: Boolean(row.kid_view_enabled)
  }));
}

export function listChores(householdId: string, db = getSqlite()): ChoreDefinition[] {
  return (db.prepare(`
    SELECT id, title, description, kind FROM chore_definitions
    WHERE household_id = ? AND active = 1 ORDER BY title COLLATE NOCASE
  `).all(householdId) as Row[]).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    kind: row.kind as ChoreKind
  }));
}

export function listRoutines(householdId: string, db = getSqlite()): Routine[] {
  return (db.prepare(`SELECT id, name, sort_order FROM routines WHERE household_id = ? ORDER BY sort_order, name`).all(householdId) as Row[])
    .map((row) => ({ id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order) }));
}

export function listResponsibilities(householdId: string, db = getSqlite()): ResponsibilitySummary[] {
  const rows = db.prepare(`
    SELECT t.*, c.title AS chore_title, r.name AS routine_name,
           (SELECT GROUP_CONCAT(member_id) FROM (SELECT member_id FROM responsibility_participants WHERE template_id = t.id ORDER BY position)) AS participant_ids
    FROM responsibility_templates t
    JOIN chore_definitions c ON c.id = t.chore_definition_id
    LEFT JOIN routines r ON r.id = t.routine_id
    WHERE t.household_id = ?
    ORDER BY CASE WHEN t.active_through IS NULL THEN 0 ELSE 1 END, t.sort_order, c.title
  `).all(householdId) as Row[];
  return rows.map((row) => {
    const recurrence = JSON.parse(String(row.recurrence_json)) as RecurrenceRule;
    return {
      id: String(row.id),
      choreTitle: String(row.chore_title),
      choreDefinitionId: String(row.chore_definition_id),
      routineId: row.routine_id == null ? null : String(row.routine_id),
      anchorDate: recurrence.anchorDate,
      rotationCadence: row.rotation_cadence as "occurrence" | "week",
      disabled: Boolean(row.disabled),
      supersedesTemplateId: row.supersedes_template_id == null ? null : String(row.supersedes_template_id),
      routineName: row.routine_name == null ? null : String(row.routine_name),
      allocationKind: row.allocation_kind as ResponsibilitySummary["allocationKind"],
      participantIds: row.participant_ids == null ? [] : String(row.participant_ids).split(","),
      weekdays: [...recurrence.weekdays],
      intervalWeeks: recurrence.intervalWeeks,
      activeFrom: String(row.active_from) as ISODate,
      activeThrough: row.active_through == null ? null : String(row.active_through) as ISODate
    };
  });
}

export function loadTemplates(householdId: string, weekStart: ISODate, db: SqliteDatabase): ResponsibilityTemplate[] {
  const weekEnd = addDays(weekStart, 6);
  const rows = db.prepare(`
    SELECT t.*, c.title AS chore_title, c.description AS chore_description, c.kind AS chore_kind,
           r.name AS routine_name
    FROM responsibility_templates t
    JOIN chore_definitions c ON c.id = t.chore_definition_id
    LEFT JOIN routines r ON r.id = t.routine_id
    WHERE t.household_id = ? AND t.disabled = 0 AND t.active_from <= ?
      AND (t.active_through IS NULL OR t.active_through >= ?)
    ORDER BY t.sort_order, c.title
  `).all(householdId, weekEnd, weekStart) as Row[];

  const participantStatement = db.prepare(`
    SELECT member_id FROM responsibility_participants WHERE template_id = ? ORDER BY position
  `);

  return rows.map((row) => {
    const participants = (participantStatement.all(row.id) as Row[]).map((participant) => String(participant.member_id));
    const allocationKind = String(row.allocation_kind);
    let allocation: AllocationRule;
    if (allocationKind === "fixed") allocation = { kind: "fixed", memberId: participants[0] };
    else if (allocationKind === "rotation") allocation = {
      kind: "rotation",
      participantIds: participants,
      offset: Number(row.rotation_offset),
      cadence: row.rotation_cadence as "occurrence" | "week"
    };
    else allocation = { kind: "open", eligibleMemberIds: participants };

    return {
      id: String(row.id),
      choreDefinitionId: String(row.chore_definition_id),
      choreTitle: String(row.chore_title),
      choreDescription: row.chore_description == null ? null : String(row.chore_description),
      choreKind: row.chore_kind as ChoreKind,
      routineId: row.routine_id == null ? null : String(row.routine_id),
      routineName: row.routine_name == null ? null : String(row.routine_name),
      sortOrder: Number(row.sort_order),
      activeFrom: String(row.active_from) as ISODate,
      activeThrough: row.active_through == null ? null : String(row.active_through) as ISODate,
      recurrence: JSON.parse(String(row.recurrence_json)) as RecurrenceRule,
      allocation
    };
  });
}

export function materializeWeek(householdId: string, requestedDate: ISODate, db = getSqlite()): WeekSnapshot {
  const weekStart = startOfWeek(requestedDate, 0);
  let planId: string;

  withImmediateTransaction(db, () => {
    const existing = db.prepare(`SELECT id FROM weekly_plans WHERE household_id = ? AND week_start_date = ?`)
      .get(householdId, weekStart) as Row | undefined;
    if (existing) {
      planId = String(existing.id);
      return;
    }

    planId = id();
    const timestamp = now();
    db.prepare(`
      INSERT INTO weekly_plans(id, household_id, week_start_date, revision, generated_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(planId, householdId, weekStart, timestamp, timestamp);

    const templates = loadTemplates(householdId, weekStart, db);
    const generated = generateWeekOccurrences(templates, weekStart);
    const insertOccurrence = db.prepare(`
      INSERT INTO chore_occurrences(
        id, weekly_plan_id, chore_definition_id, source_template_id, source_instance_key, origin,
        due_date, status, chore_title_snapshot, chore_description_snapshot, chore_kind_snapshot,
        routine_id, routine_name_snapshot, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, 'RECURRING', ?, 'SCHEDULED', ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAssignee = db.prepare(`INSERT INTO occurrence_assignees(occurrence_id, member_id) VALUES (?, ?)`);
    const insertEligible = db.prepare(`INSERT OR IGNORE INTO occurrence_eligible_members(occurrence_id, member_id) VALUES (?, ?)`);
    for (const occurrence of generated) {
      const occurrenceId = id();
      insertOccurrence.run(
        occurrenceId,
        planId,
        occurrence.choreDefinitionId,
        occurrence.sourceTemplateId,
        occurrence.sourceInstanceKey,
        occurrence.dueDate,
        occurrence.choreTitle,
        occurrence.choreDescription ?? null,
        occurrence.choreKind,
        occurrence.routineId ?? null,
        occurrence.routineName ?? null,
        occurrence.sortOrder,
        timestamp
      );
      if (occurrence.plannedAssigneeId) insertAssignee.run(occurrenceId, occurrence.plannedAssigneeId);
      for (const memberId of occurrence.eligibleMemberIds) insertEligible.run(occurrenceId, memberId);
    }
  });

  return getWeekSnapshot(planId!, db);
}

export function getWeekSnapshot(planId: string, db = getSqlite()): WeekSnapshot {
  const plan = db.prepare(`SELECT * FROM weekly_plans WHERE id = ?`).get(planId) as Row | undefined;
  if (!plan) throw new Error("Weekly plan not found");
  const occurrences = (db.prepare(`
    SELECT o.*, a.member_id AS assignee_id,
           (SELECT GROUP_CONCAT(e.member_id) FROM occurrence_eligible_members e WHERE e.occurrence_id = o.id) AS eligible_member_ids,
           c.id AS completion_id, c.completed_by_member_id, c.completed_at
    FROM chore_occurrences o
    LEFT JOIN occurrence_assignees a ON a.occurrence_id = o.id
    LEFT JOIN completions c ON c.occurrence_id = o.id AND c.voided_at IS NULL
    WHERE o.weekly_plan_id = ?
    ORDER BY o.due_date, o.sort_order, o.chore_title_snapshot
  `).all(planId) as Row[]).map((row): WeekOccurrence => ({
    id: String(row.id),
    choreDefinitionId: String(row.chore_definition_id),
    sourceTemplateId: row.source_template_id == null ? null : String(row.source_template_id),
    origin: row.origin as WeekOccurrence["origin"],
    dueDate: String(row.due_date) as ISODate,
    status: row.status as WeekOccurrence["status"],
    choreTitle: String(row.chore_title_snapshot),
    choreDescription: row.chore_description_snapshot == null ? null : String(row.chore_description_snapshot),
    choreKind: row.chore_kind_snapshot as ChoreKind,
    routineId: row.routine_id == null ? null : String(row.routine_id),
    routineName: row.routine_name_snapshot == null ? null : String(row.routine_name_snapshot),
    sortOrder: Number(row.sort_order),
    assigneeId: row.assignee_id == null ? null : String(row.assignee_id),
    eligibleMemberIds: row.eligible_member_ids == null || String(row.eligible_member_ids) === ""
      ? []
      : String(row.eligible_member_ids).split(","),
    completionId: row.completion_id == null ? null : String(row.completion_id),
    completedByMemberId: row.completed_by_member_id == null ? null : String(row.completed_by_member_id),
    completedAt: row.completed_at == null ? null : String(row.completed_at)
  }));
  const weekStart = String(plan.week_start_date) as ISODate;
  return {
    id: String(plan.id),
    householdId: String(plan.household_id),
    weekStartDate: weekStart,
    revision: Number(plan.revision),
    dates: weekDates(weekStart),
    occurrences
  };
}

export function getDashboard(requestedDate?: ISODate, db = getSqlite()): DashboardSnapshot | null {
  const household = getFirstHousehold(db);
  if (!household) return null;
  const date = requestedDate ?? dateInTimeZone(new Date(), household.timezone);
  return {
    household,
    members: listMembers(household.id, db),
    chores: listChores(household.id, db),
    routines: listRoutines(household.id, db),
    responsibilities: listResponsibilities(household.id, db),
    week: materializeWeek(household.id, date, db),
    charts: listLatestCharts(materializeWeek(household.id, date, db).id, db)
  };
}

export function createHousehold(name: string, timezone: string, db = getSqlite()): Household {
  const household: Household = { id: id(), name: name.trim(), timezone, weekStartsOn: 0 };
  new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  db.prepare(`INSERT INTO households(id, name, timezone, week_starts_on, created_at) VALUES (?, ?, ?, 0, ?)`)
    .run(household.id, household.name, household.timezone, now());
  for (const [index, routine] of ["Morning", "After school", "Evening", "Weekly"].entries()) {
    db.prepare(`INSERT INTO routines(id, household_id, name, sort_order) VALUES (?, ?, ?, ?)`)
      .run(id(), household.id, routine, index);
  }
  return household;
}

export function createMember(
  householdId: string,
  input: { displayName: string; kind: MemberKind; canAdminister: boolean; themeKey: string },
  db = getSqlite()
): string {
  const memberId = id();
  withImmediateTransaction(db, () => {
    db.prepare(`
      INSERT INTO household_members(id, household_id, display_name, kind, can_administer, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(memberId, householdId, input.displayName.trim(), input.kind, Number(input.canAdminister), now());
    db.prepare(`
      INSERT INTO member_profiles(member_id, theme_key, kid_view_enabled) VALUES (?, ?, ?)
    `).run(memberId, input.themeKey, Number(input.kind === "CHILD"));
  });
  return memberId;
}

export function updateMember(
  memberId: string,
  input: { displayName?: string; kind?: MemberKind; canAdminister?: boolean; themeKey?: string },
  db = getSqlite()
): void {
  withImmediateTransaction(db, () => {
    const member = db.prepare(`SELECT id FROM household_members WHERE id = ?`).get(memberId);
    if (!member) throw new Error("Household member not found");
    if (input.displayName !== undefined) db.prepare(`UPDATE household_members SET display_name = ? WHERE id = ?`).run(input.displayName.trim(), memberId);
    if (input.kind !== undefined) db.prepare(`UPDATE household_members SET kind = ? WHERE id = ?`).run(input.kind, memberId);
    if (input.canAdminister !== undefined) db.prepare(`UPDATE household_members SET can_administer = ? WHERE id = ?`).run(Number(input.canAdminister), memberId);
    if (input.themeKey !== undefined) {
      db.prepare(`
        INSERT INTO member_profiles(member_id, theme_key, kid_view_enabled) VALUES (?, ?, 0)
        ON CONFLICT(member_id) DO UPDATE SET theme_key = excluded.theme_key
      `).run(memberId, input.themeKey);
    }
  });
}

export function removeMember(memberId: string, db = getSqlite()): void {
  withImmediateTransaction(db, () => {
    const member = db.prepare(`
      SELECT id, display_name FROM household_members WHERE id = ? AND active = 1
    `).get(memberId) as Row | undefined;
    if (!member) throw new Error("Household member not found");

    const references = [
      db.prepare(`SELECT 1 FROM responsibility_participants WHERE member_id = ? LIMIT 1`).get(memberId),
      db.prepare(`SELECT 1 FROM occurrence_assignees WHERE member_id = ? LIMIT 1`).get(memberId),
      db.prepare(`SELECT 1 FROM occurrence_eligible_members WHERE member_id = ? LIMIT 1`).get(memberId),
      db.prepare(`SELECT 1 FROM weekly_plan_changes WHERE recorded_by_member_id = ? LIMIT 1`).get(memberId),
      db.prepare(`
        SELECT 1 FROM completions
        WHERE completed_by_member_id = ? OR recorded_by_member_id = ? OR voided_by_member_id = ?
        LIMIT 1
      `).get(memberId, memberId, memberId),
      db.prepare(`SELECT 1 FROM chart_exports WHERE member_id = ? LIMIT 1`).get(memberId)
    ];
    if (references.some(Boolean)) {
      throw new Error(`${String(member.display_name)} has chore assignments or history, so Tidy Week must keep them. Only unused members can be removed.`);
    }

    db.prepare(`DELETE FROM household_members WHERE id = ?`).run(memberId);
  });
}

export function createChore(
  householdId: string,
  input: { title: string; description?: string; kind: ChoreKind },
  db = getSqlite()
): string {
  const choreId = id();
  db.prepare(`
    INSERT INTO chore_definitions(id, household_id, title, description, kind, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(choreId, householdId, input.title.trim(), input.description?.trim() || null, input.kind, now());
  return choreId;
}

export function updateChore(
  choreId: string,
  input: { title?: string; description?: string | null; kind?: ChoreKind; active?: boolean },
  db = getSqlite()
): void {
  const chore = db.prepare(`SELECT id FROM chore_definitions WHERE id = ?`).get(choreId);
  if (!chore) throw new Error("Chore definition not found");
  if (input.title !== undefined) db.prepare(`UPDATE chore_definitions SET title = ? WHERE id = ?`).run(input.title.trim(), choreId);
  if (input.description !== undefined) db.prepare(`UPDATE chore_definitions SET description = ? WHERE id = ?`).run(input.description?.trim() || null, choreId);
  if (input.kind !== undefined) db.prepare(`UPDATE chore_definitions SET kind = ? WHERE id = ?`).run(input.kind, choreId);
  if (input.active !== undefined) db.prepare(`UPDATE chore_definitions SET active = ? WHERE id = ?`).run(Number(input.active), choreId);
}

export function endResponsibility(templateId: string, activeThrough: ISODate, db = getSqlite()): void {
  const row = db.prepare("SELECT household_id FROM responsibility_templates WHERE id = ?").get(templateId) as Row | undefined;
  if (!row) throw new Error("Schedule not found");
  changeSchedules(String(row.household_id), { action: "stop", effectiveFrom: addDays(activeThrough, 1), templateIds: [templateId], entries: [] }, db);
}

export function reassignResponsibility(templateId: string, memberId: string, effectiveFrom: ISODate, db = getSqlite()) {
  const row = db.prepare("SELECT household_id FROM responsibility_templates WHERE id = ?").get(templateId) as Row | undefined;
  if (!row) throw new Error("Schedule not found");
  const householdId = String(row.household_id);
  const original = listResponsibilities(householdId, db).find((item) => item.id === templateId)!;
  const result = changeSchedules(householdId, {
    action: "edit", effectiveFrom, templateIds: [templateId], entries: [{
      choreDefinitionId: original.choreDefinitionId, routineId: original.routineId,
      weekdays: original.weekdays, intervalWeeks: original.intervalWeeks, anchorDate: original.anchorDate,
      rotationCadence: original.rotationCadence, activeThrough: original.activeThrough,
      mode: "each", memberIds: [memberId]
    }]
  }, db);
  return { updatedOccurrenceCount: result.updated, updatedPlanCount: result.weeks };
}

export function deleteResponsibility(
  templateId: string,
  db = getSqlite()
): { deletedOccurrenceCount: number; updatedPlanCount: number } {
  let deletedOccurrenceCount = 0;
  let updatedPlanCount = 0;
  withImmediateTransaction(db, () => {
    const template = db.prepare(`SELECT id FROM responsibility_templates WHERE id = ?`).get(templateId);
    if (!template) throw new Error("Responsibility not found");
    const hasCompletions = db.prepare(`
      SELECT 1 FROM completions c JOIN chore_occurrences o ON o.id = c.occurrence_id
      WHERE o.source_template_id = ? LIMIT 1
    `).get(templateId);
    if (hasCompletions) {
      throw new Error("This responsibility has completion history and cannot be deleted. End it instead.");
    }
    const hasReplacement = db.prepare(`
      SELECT 1 FROM chore_occurrences
      WHERE replaces_occurrence_id IN (SELECT id FROM chore_occurrences WHERE source_template_id = ?)
      LIMIT 1
    `).get(templateId);
    const hasSuccessor = db.prepare(`
      SELECT 1 FROM responsibility_templates WHERE supersedes_template_id = ? LIMIT 1
    `).get(templateId);
    if (hasReplacement || hasSuccessor) {
      throw new Error("This responsibility has replacement history and cannot be deleted. End it instead.");
    }

    const occurrences = db.prepare(`
      SELECT id, weekly_plan_id FROM chore_occurrences WHERE source_template_id = ?
    `).all(templateId) as Row[];
    const affectedPlans = new Set(occurrences.map((row) => String(row.weekly_plan_id)));
    for (const occurrence of occurrences) {
      db.prepare(`DELETE FROM weekly_plan_changes WHERE occurrence_id = ?`).run(occurrence.id);
      db.prepare(`DELETE FROM chore_occurrences WHERE id = ?`).run(occurrence.id);
    }
    db.prepare(`
      DELETE FROM weekly_plan_changes
      WHERE action = 'APPLY_NEW_RESPONSIBILITY' AND json_extract(after_json, '$.templateId') = ?
    `).run(templateId);
    db.prepare(`DELETE FROM responsibility_templates WHERE id = ?`).run(templateId);
    for (const planId of affectedPlans) {
      db.prepare(`UPDATE weekly_plans SET revision = revision + 1, updated_at = ? WHERE id = ?`)
        .run(now(), planId);
    }
    deletedOccurrenceCount = occurrences.length;
    updatedPlanCount = affectedPlans.size;
  });
  return { deletedOccurrenceCount, updatedPlanCount };
}

export function createResponsibility(
  householdId: string,
  input: {
    choreDefinitionId: string;
    routineId?: string | null;
    activeFrom: ISODate;
    weekdays: number[];
    intervalWeeks: number;
    allocation: AllocationRule;
  },
  db = getSqlite()
): string {
  const templateId = id();
  const recurrence: RecurrenceRule = {
    kind: "weekly_days",
    anchorDate: input.activeFrom,
    intervalWeeks: input.intervalWeeks,
    weekdays: [...new Set(input.weekdays)].sort() as unknown as RecurrenceRule["weekdays"]
  };
  const participants = input.allocation.kind === "fixed"
    ? [input.allocation.memberId]
    : input.allocation.kind === "rotation"
      ? input.allocation.participantIds
      : input.allocation.eligibleMemberIds ?? [];

  withImmediateTransaction(db, () => {
    const sortOrder = Number((db.prepare(`
      SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM responsibility_templates WHERE household_id = ?
    `).get(householdId) as Row).next_order);
    db.prepare(`
      INSERT INTO responsibility_templates(
        id, household_id, chore_definition_id, routine_id, recurrence_json, allocation_kind,
        rotation_offset, sort_order, active_from, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      householdId,
      input.choreDefinitionId,
      input.routineId ?? null,
      JSON.stringify(recurrence),
      input.allocation.kind,
      input.allocation.kind === "rotation" ? input.allocation.offset : 0,
      sortOrder,
      input.activeFrom,
      now()
    );
    const insert = db.prepare(`
      INSERT INTO responsibility_participants(template_id, member_id, position) VALUES (?, ?, ?)
    `);
    participants.forEach((memberId, position) => insert.run(templateId, memberId, position));
  });
  return templateId;
}

export function applyResponsibilityToWeek(
  templateId: string,
  planId: string,
  expectedRevision: number,
  db = getSqlite()
): WeekSnapshot {
  withImmediateTransaction(db, () => {
    assertRevision(planId, expectedRevision, db);
    const plan = db.prepare(`SELECT household_id, week_start_date FROM weekly_plans WHERE id = ?`).get(planId) as Row | undefined;
    if (!plan) throw new Error("Weekly plan not found");
    const template = loadTemplates(String(plan.household_id), String(plan.week_start_date) as ISODate, db)
      .find((item) => item.id === templateId);
    if (!template) throw new Error("The responsibility does not apply to this week");
    const generated = generateWeekOccurrences([template], String(plan.week_start_date) as ISODate);
    const insertOccurrence = db.prepare(`
      INSERT INTO chore_occurrences(
        id, weekly_plan_id, chore_definition_id, source_template_id, source_instance_key, origin,
        due_date, status, chore_title_snapshot, chore_description_snapshot, chore_kind_snapshot,
        routine_id, routine_name_snapshot, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, 'OVERRIDE', ?, 'SCHEDULED', ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const occurrence of generated) {
      const exists = db.prepare(`SELECT 1 FROM chore_occurrences WHERE weekly_plan_id = ? AND source_instance_key = ?`)
        .get(planId, occurrence.sourceInstanceKey);
      if (exists) continue;
      const occurrenceId = id();
      insertOccurrence.run(
        occurrenceId, planId, occurrence.choreDefinitionId, occurrence.sourceTemplateId,
        occurrence.sourceInstanceKey, occurrence.dueDate, occurrence.choreTitle,
        occurrence.choreDescription ?? null, occurrence.choreKind, occurrence.routineId ?? null,
        occurrence.routineName ?? null, occurrence.sortOrder, now()
      );
      if (occurrence.plannedAssigneeId) {
        db.prepare(`INSERT INTO occurrence_assignees(occurrence_id, member_id) VALUES (?, ?)`)
          .run(occurrenceId, occurrence.plannedAssigneeId);
      }
      for (const memberId of occurrence.eligibleMemberIds) {
        db.prepare(`INSERT INTO occurrence_eligible_members(occurrence_id, member_id) VALUES (?, ?)`)
          .run(occurrenceId, memberId);
      }
    }
    db.prepare(`
      INSERT INTO weekly_plan_changes(id, weekly_plan_id, action, after_json, created_at)
      VALUES (?, ?, 'APPLY_NEW_RESPONSIBILITY', ?, ?)
    `).run(id(), planId, JSON.stringify({ templateId, occurrenceCount: generated.length }), now());
    bumpRevision(planId, expectedRevision, db);
  });
  return getWeekSnapshot(planId, db);
}

function assertRevision(planId: string, expectedRevision: number, db: SqliteDatabase): number {
  const row = db.prepare(`SELECT revision FROM weekly_plans WHERE id = ?`).get(planId) as Row | undefined;
  if (!row) throw new Error("Weekly plan not found");
  if (Number(row.revision) !== expectedRevision) {
    const error = new Error("This week changed in another session. Refresh and try again.");
    error.name = "RevisionConflict";
    throw error;
  }
  return expectedRevision;
}

function bumpRevision(planId: string, expectedRevision: number, db: SqliteDatabase): void {
  const result = db.prepare(`
    UPDATE weekly_plans SET revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?
  `).run(now(), planId, expectedRevision);
  if (result.changes !== 1) throw new Error("Weekly plan revision conflict");
}

export function updateOccurrence(
  occurrenceId: string,
  input:
    | { action: "cancel" | "restore"; expectedRevision: number }
    | { action: "move"; dueDate: ISODate; expectedRevision: number }
    | { action: "reorder"; sortOrder: number; expectedRevision: number }
    | { action: "reassign"; memberId: string | null; expectedRevision: number },
  db = getSqlite()
): WeekSnapshot {
  let planId = "";
  withImmediateTransaction(db, () => {
    const row = db.prepare(`
      SELECT o.*, a.member_id AS assignee_id FROM chore_occurrences o
      LEFT JOIN occurrence_assignees a ON a.occurrence_id = o.id WHERE o.id = ?
    `).get(occurrenceId) as Row | undefined;
    if (!row) throw new Error("Chore occurrence not found");
    planId = String(row.weekly_plan_id);
    assertRevision(planId, input.expectedRevision, db);
    const before = JSON.stringify(row);
    if (input.action === "cancel" || input.action === "restore") {
      db.prepare(`UPDATE chore_occurrences SET status = ? WHERE id = ?`)
        .run(input.action === "cancel" ? "CANCELLED" : "SCHEDULED", occurrenceId);
    } else if (input.action === "move") {
      const plan = db.prepare(`SELECT week_start_date FROM weekly_plans WHERE id = ?`).get(planId) as Row;
      const start = String(plan.week_start_date);
      if (input.dueDate < start || input.dueDate > addDays(start as ISODate, 6)) {
        throw new Error("A weekly edit must stay inside the selected week");
      }
      db.prepare(`UPDATE chore_occurrences SET due_date = ? WHERE id = ?`).run(input.dueDate, occurrenceId);
    } else if (input.action === "reassign") {
      db.prepare(`DELETE FROM occurrence_assignees WHERE occurrence_id = ?`).run(occurrenceId);
      if (input.memberId) {
        db.prepare(`INSERT INTO occurrence_assignees(occurrence_id, member_id) VALUES (?, ?)`)
          .run(occurrenceId, input.memberId);
      }
    } else if (input.action === "reorder") {
      db.prepare(`UPDATE chore_occurrences SET sort_order = ? WHERE id = ?`).run(input.sortOrder, occurrenceId);
    }

    const after = db.prepare(`SELECT * FROM chore_occurrences WHERE id = ?`).get(occurrenceId);
    db.prepare(`
      INSERT INTO weekly_plan_changes(id, weekly_plan_id, occurrence_id, action, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id(), planId, occurrenceId, input.action.toUpperCase(), before, JSON.stringify(after), now());
    bumpRevision(planId, input.expectedRevision, db);
  });
  return getWeekSnapshot(planId, db);
}

export function addOneOff(
  planId: string,
  input: { choreDefinitionId: string; dueDate: ISODate; memberId: string | null; routineId?: string | null; expectedRevision: number },
  db = getSqlite()
): WeekSnapshot {
  withImmediateTransaction(db, () => {
    assertRevision(planId, input.expectedRevision, db);
    const plan = db.prepare(`SELECT week_start_date FROM weekly_plans WHERE id = ?`).get(planId) as Row;
    const start = String(plan.week_start_date) as ISODate;
    if (input.dueDate < start || input.dueDate > addDays(start, 6)) throw new Error("One-off date is outside this week");
    const chore = db.prepare(`SELECT * FROM chore_definitions WHERE id = ?`).get(input.choreDefinitionId) as Row | undefined;
    if (!chore) throw new Error("Chore definition not found");
    const routine = input.routineId
      ? db.prepare(`SELECT name FROM routines WHERE id = ?`).get(input.routineId) as Row | undefined
      : undefined;
    const occurrenceId = id();
    db.prepare(`
      INSERT INTO chore_occurrences(
        id, weekly_plan_id, chore_definition_id, source_instance_key, origin, due_date, status,
        chore_title_snapshot, chore_description_snapshot, chore_kind_snapshot, routine_id,
        routine_name_snapshot, sort_order, created_at
      ) VALUES (?, ?, ?, ?, 'ONE_OFF', ?, 'SCHEDULED', ?, ?, ?, ?, ?, 999, ?)
    `).run(
      occurrenceId,
      planId,
      input.choreDefinitionId,
      `one-off:${occurrenceId}`,
      input.dueDate,
      chore.title,
      chore.description ?? null,
      chore.kind,
      input.routineId ?? null,
      routine?.name ?? null,
      now()
    );
    if (input.memberId) {
      db.prepare(`INSERT INTO occurrence_assignees(occurrence_id, member_id) VALUES (?, ?)`)
        .run(occurrenceId, input.memberId);
    }
    db.prepare(`
      INSERT INTO weekly_plan_changes(id, weekly_plan_id, occurrence_id, action, after_json, created_at)
      VALUES (?, ?, ?, 'ADD_ONE_OFF', ?, ?)
    `).run(id(), planId, occurrenceId, JSON.stringify({ dueDate: input.dueDate, memberId: input.memberId }), now());
    bumpRevision(planId, input.expectedRevision, db);
  });
  return getWeekSnapshot(planId, db);
}

export function completeOccurrence(
  occurrenceId: string,
  completedByMemberId: string,
  recordedByMemberId: string | null = null,
  db = getSqlite()
): string {
  return withImmediateTransaction(db, () => {
    const occurrence = db.prepare(`
      SELECT o.status, p.household_id,
             (SELECT COUNT(*) FROM occurrence_assignees a WHERE a.occurrence_id = o.id) AS assignee_count,
             (SELECT COUNT(*) FROM occurrence_eligible_members e WHERE e.occurrence_id = o.id) AS eligible_count,
             (SELECT COUNT(*) FROM occurrence_eligible_members e WHERE e.occurrence_id = o.id AND e.member_id = ?) AS completer_is_eligible
      FROM chore_occurrences o JOIN weekly_plans p ON p.id = o.weekly_plan_id WHERE o.id = ?
    `).get(completedByMemberId, occurrenceId) as Row | undefined;
    if (!occurrence || occurrence.status !== "SCHEDULED") throw new Error("Only scheduled chores can be completed");
    const member = db.prepare(`SELECT household_id, active FROM household_members WHERE id = ?`).get(completedByMemberId) as Row | undefined;
    if (!member || !member.active || member.household_id !== occurrence.household_id) throw new Error("Completer is not an active household member");
    if (Number(occurrence.assignee_count) === 0 && Number(occurrence.eligible_count) > 0 && Number(occurrence.completer_is_eligible) === 0) {
      throw new Error("This household chore is not available to that member");
    }
    const existing = db.prepare(`SELECT id FROM completions WHERE occurrence_id = ? AND voided_at IS NULL`).get(occurrenceId) as Row | undefined;
    if (existing) return String(existing.id);
    const completionId = id();
    db.prepare(`
      INSERT INTO completions(id, occurrence_id, completed_by_member_id, recorded_by_member_id, completed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(completionId, occurrenceId, completedByMemberId, recordedByMemberId, now());
    return completionId;
  });
}

export function voidCompletion(occurrenceId: string, voidedByMemberId: string | null = null, db = getSqlite()): void {
  db.prepare(`
    UPDATE completions SET voided_at = ?, voided_by_member_id = ?
    WHERE occurrence_id = ? AND voided_at IS NULL
  `).run(now(), voidedByMemberId, occurrenceId);
}

export function createChartExport(planId: string, memberId: string, themeKey?: string, db = getSqlite()): string {
  const plan = getWeekSnapshot(planId, db);
  const householdRow = db.prepare(`SELECT name FROM households WHERE id = ?`).get(plan.householdId) as Row;
  const memberRow = db.prepare(`
    SELECT m.display_name, COALESCE(p.theme_key, 'sunny') AS theme_key
    FROM household_members m LEFT JOIN member_profiles p ON p.member_id = m.id WHERE m.id = ?
  `).get(memberId) as Row | undefined;
  if (!memberRow) throw new Error("Member not found");

  const occurrences = plan.occurrences.filter((occurrence) =>
    occurrence.status === "SCHEDULED" &&
    (occurrence.assigneeId === memberId || (occurrence.assigneeId === null &&
      (occurrence.eligibleMemberIds.length === 0 || occurrence.eligibleMemberIds.includes(memberId))))
  );
  const dates = weekDates(plan.weekStartDate);
  const grouped = new Map<string, WeekOccurrence[]>();
  for (const occurrence of occurrences) {
    // Consecutive schedule versions share a printed row when their displayed work
    // matches. Multiple occurrences on one day always get separate checkboxes.
    const base = JSON.stringify([occurrence.choreDefinitionId, occurrence.routineId, occurrence.choreTitle]);
    let slot = 0;
    while (grouped.get(`${base}:${slot}`)?.some((item) => item.dueDate === occurrence.dueDate)) slot++;
    const key = `${base}:${slot}`;
    grouped.set(key, [...(grouped.get(key) ?? []), occurrence]);
  }
  const rows: ChartRow[] = [...grouped.entries()].map(([key, items]) => ({
    key,
    title: items[0].choreTitle,
    routineName: items[0].routineName,
    cells: dates.map((date) => {
      const occurrence = items.find((item) => item.dueDate === date);
      return { date, occurrenceId: occurrence?.id ?? null, completed: Boolean(occurrence?.completionId) };
    })
  })).sort((a, b) => (a.routineName ?? "").localeCompare(b.routineName ?? "") || a.title.localeCompare(b.title));

  const chartId = id();
  const snapshot: ChartSnapshot = {
    chartId,
    householdName: String(householdRow.name),
    memberId,
    memberName: String(memberRow.display_name),
    weekStartDate: plan.weekStartDate,
    themeKey: themeKey ?? String(memberRow.theme_key),
    planRevision: plan.revision,
    rows
  };
  const cellManifest = rows.flatMap((row, rowIndex) => row.cells
    .map((cell, dayIndex) => cell.occurrenceId ? ({
      occurrenceId: cell.occurrenceId,
      page: Math.floor(rowIndex / 18) + 1,
      row: rowIndex % 18,
      column: dayIndex,
      box: { x: 3.265 + dayIndex * 0.711, y: 2.43 + (rowIndex % 18) * 0.42, width: 0.22, height: 0.22 }
    }) : null)
    .filter(Boolean));
  const serialized = JSON.stringify(snapshot);
  const checksum = createHash("sha256").update(serialized).digest("hex").slice(0, 16);
  db.prepare(`
    INSERT INTO chart_exports(
      id, household_id, weekly_plan_id, member_id, plan_revision, theme_key, theme_version,
      layout_version, content_snapshot_json, cell_manifest_json, checksum, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
  `).run(
    chartId,
    plan.householdId,
    planId,
    memberId,
    plan.revision,
    snapshot.themeKey,
    serialized,
    JSON.stringify(cellManifest),
    checksum,
    now()
  );
  return chartId;
}

export function getChartExport(chartId: string, db = getSqlite()): { snapshot: ChartSnapshot; checksum: string; manifest: unknown[] } {
  const row = db.prepare(`SELECT * FROM chart_exports WHERE id = ?`).get(chartId) as Row | undefined;
  if (!row) throw new Error("Chart export not found");
  return {
    snapshot: JSON.parse(String(row.content_snapshot_json)) as ChartSnapshot,
    checksum: String(row.checksum),
    manifest: JSON.parse(String(row.cell_manifest_json)) as unknown[]
  };
}

export function seedDemo(db = getSqlite()): string {
  const existing = getFirstHousehold(db);
  if (existing) return existing.id;
  const household = createHousehold("The Rivera Family", "America/Los_Angeles", db);
  const kate = createMember(household.id, { displayName: "Kate", kind: "CHILD", canAdminister: false, themeKey: "cats" }, db);
  const henry = createMember(household.id, { displayName: "Henry", kind: "CHILD", canAdminister: false, themeKey: "shark-dino" }, db);
  const dad = createMember(household.id, { displayName: "Dad", kind: "ADULT", canAdminister: true, themeKey: "sunny" }, db);
  const routines = listRoutines(household.id, db);
  const morning = routines.find((routine) => routine.name === "Morning")!.id;
  const evening = routines.find((routine) => routine.name === "Evening")!.id;
  const weekly = routines.find((routine) => routine.name === "Weekly")!.id;

  const makeBed = createChore(household.id, { title: "Make bed", kind: "INDIVIDUAL" }, db);
  const brushTeeth = createChore(household.id, { title: "Brush teeth", kind: "INDIVIDUAL" }, db);
  const feedDog = createChore(household.id, { title: "Feed dog", kind: "HOUSEHOLD" }, db);
  const setTable = createChore(household.id, { title: "Set the table", kind: "HOUSEHOLD" }, db);
  const cleanRoom = createChore(household.id, { title: "Clean room", kind: "INDIVIDUAL" }, db);
  const trash = createChore(household.id, { title: "Take trash cans out", kind: "HOUSEHOLD" }, db);
  const today = dateInTimeZone(new Date(), household.timezone);
  const activeFrom = startOfWeek(addDays(today, -28), 0);
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  for (const memberId of [kate, henry]) {
    createResponsibility(household.id, {
      choreDefinitionId: makeBed, routineId: morning, activeFrom, weekdays: allDays, intervalWeeks: 1,
      allocation: { kind: "fixed", memberId }
    }, db);
    createResponsibility(household.id, {
      choreDefinitionId: brushTeeth, routineId: evening, activeFrom, weekdays: allDays, intervalWeeks: 1,
      allocation: { kind: "fixed", memberId }
    }, db);
    createResponsibility(household.id, {
      choreDefinitionId: cleanRoom, routineId: weekly, activeFrom, weekdays: [6], intervalWeeks: 1,
      allocation: { kind: "fixed", memberId }
    }, db);
  }
  createResponsibility(household.id, {
    choreDefinitionId: feedDog, routineId: morning, activeFrom, weekdays: allDays, intervalWeeks: 1,
    allocation: { kind: "rotation", participantIds: [henry, dad, kate], offset: 0 }
  }, db);
  createResponsibility(household.id, {
    choreDefinitionId: setTable, routineId: evening, activeFrom, weekdays: [1, 2, 3, 4, 5], intervalWeeks: 1,
    allocation: { kind: "open", eligibleMemberIds: [kate, henry] }
  }, db);
  createResponsibility(household.id, {
    choreDefinitionId: trash, routineId: weekly, activeFrom, weekdays: [0], intervalWeeks: 1,
    allocation: { kind: "fixed", memberId: dad }
  }, db);

  materializeWeek(household.id, addDays(today, -7), db);
  const current = materializeWeek(household.id, today, db);
  materializeWeek(household.id, addDays(today, 7), db);
  for (const occurrence of current.occurrences.filter((item) => item.dueDate <= today).slice(0, 5)) {
    completeOccurrence(occurrence.id, occurrence.assigneeId ?? kate, dad, db);
  }
  return household.id;
}

export interface ScheduleImpact {
  token?: string;
  added: number;
  updated: number;
  removed: number;
  keptCompleted: number;
  keptExceptions: number;
  duplicatesSkipped: number;
  weeks: number;
  charts: number;
  templateIds: string[];
  examples: { date: string; title: string; person: string }[];
}

export function listLatestCharts(planId: string, db = getSqlite()) {
  return (db.prepare(`SELECT c.id, c.member_id, c.plan_revision, p.revision
    FROM chart_exports c JOIN weekly_plans p ON p.id = c.weekly_plan_id
    WHERE c.weekly_plan_id = ? AND c.rowid = (
      SELECT MAX(x.rowid) FROM chart_exports x WHERE x.weekly_plan_id = c.weekly_plan_id AND x.member_id = c.member_id
    )`).all(planId) as Row[]).map((row) => ({ id: String(row.id), memberId: String(row.member_id), stale: row.plan_revision !== row.revision }));
}

function scheduleFingerprint(householdId: string, change: ScheduleChange, db: SqliteDatabase): string {
  // Include completions and explicit changes as well as plan revisions. Preview and
  // commit run under the same write lock; a stale preview never overwrites new work.
  const tables = ["responsibility_templates", "responsibility_participants", "schedule_preserved_occurrences", "weekly_plans", "chore_occurrences", "occurrence_assignees", "occurrence_eligible_members", "weekly_plan_changes", "completions", "chart_exports", "household_members", "chore_definitions", "routines"];
  return createHash("sha256").update(JSON.stringify([householdId, change, ...tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())])).digest("hex");
}

export function reviewScheduleChange(householdId: string, change: ScheduleChange, db = getSqlite()): ScheduleImpact {
  return withImmediateTransaction(db, () => {
    const token = scheduleFingerprint(householdId, change, db);
    db.exec("SAVEPOINT schedule_preview");
    try { return { ...changeSchedules(householdId, change, db), token }; }
    finally { db.exec("ROLLBACK TO schedule_preview"); db.exec("RELEASE schedule_preview"); }
  });
}

export function commitScheduleChange(householdId: string, change: ScheduleChange, token: string | undefined, requestId: string, db = getSqlite()): ScheduleImpact {
  return withImmediateTransaction(db, () => {
    const hash = createHash("sha256").update(JSON.stringify(change)).digest("hex");
    const prior = db.prepare("SELECT * FROM schedule_requests WHERE request_id = ?").get(requestId) as Row | undefined;
    if (prior) {
      if (prior.household_id !== householdId || prior.payload_hash !== hash) throw new Error("This request was already used for another change");
      return JSON.parse(String(prior.result_json)) as ScheduleImpact;
    }
    if (!token || token !== scheduleFingerprint(householdId, change, db)) {
      const error = new Error("The family schedule changed. Review the changes again before saving.");
      error.name = "RevisionConflict";
      throw error;
    }
    const result = changeSchedules(householdId, change, db);
    db.prepare("INSERT INTO schedule_requests VALUES (?, ?, ?, ?)").run(requestId, householdId, hash, JSON.stringify(result));
    return result;
  });
}

export function changeSchedules(householdId: string, change: ScheduleChange, db = getSqlite()): ScheduleImpact {
  return withImmediateTransaction(db, () => {
    const effective = change.effectiveFrom as ISODate;
    const impact: ScheduleImpact = { added: 0, updated: 0, removed: 0, keptCompleted: 0, keptExceptions: 0, duplicatesSkipped: 0, weeks: 0, charts: 0, templateIds: [], examples: [] };
    const originals = [...new Set(change.templateIds)].map((templateId) => {
      const row = db.prepare("SELECT * FROM responsibility_templates WHERE id = ? AND household_id = ?").get(templateId, householdId) as Row | undefined;
      if (!row || row.disabled || row.active_through && String(row.active_through) < effective) throw new Error("This schedule has ended. Refresh and choose an active schedule.");
      if (row.supersedes_template_id && effective < String(row.active_from)) throw new Error(`Choose a change date on or after ${row.active_from}; earlier dates belong to the previous schedule.`);
      if (db.prepare("SELECT 1 FROM responsibility_templates WHERE supersedes_template_id = ?").get(templateId)) throw new Error("This schedule already has a replacement. Edit the latest schedule instead.");
      return row;
    });
    if (change.action === "edit" && (originals.length !== 1 || change.entries.some((entry) => entry.choreDefinitionId !== originals[0].chore_definition_id))) throw new Error("Edit one existing chore schedule at a time");
    const originalIds = originals.map((row) => String(row.id));
    // Each successor owns the preserved exceptions that substitute for its work.
    // This also lets an edit add another child without hiding their new checkbox
    // merely because the original child's chore was already completed.
    const preservedIds = new Set<string>();
    for (const originalId of originalIds) {
      for (const row of db.prepare("SELECT occurrence_id FROM schedule_preserved_occurrences WHERE template_id = ?").all(originalId) as Row[]) preservedIds.add(String(row.occurrence_id));
    }
    for (const original of originals) {
      if (effective <= String(original.active_from)) db.prepare("UPDATE responsibility_templates SET disabled = 1 WHERE id = ?").run(original.id);
      else db.prepare("UPDATE responsibility_templates SET active_through = ? WHERE id = ?").run(addDays(effective, -1), original.id);
    }

    const members = listMembers(householdId, db);
    const routines = listRoutines(householdId, db);
    for (const draft of change.entries) {
      if (!draft.memberIds.length || draft.memberIds.some((memberId) => !members.some((member) => member.id === memberId))) throw new Error("Choose active members of this household");
      if (draft.routineId && !routines.some((routine) => routine.id === draft.routineId)) throw new Error("Choose a routine from this household");
      if (draft.activeThrough && draft.activeThrough < effective) throw new Error("End date must be on or after the start date");
      let choreId = draft.choreDefinitionId;
      if (!choreId) {
        const existing = db.prepare("SELECT id FROM chore_definitions WHERE household_id = ? AND title = ? COLLATE NOCASE AND active = 1").get(householdId, draft.title?.trim()) as Row | undefined;
        choreId = existing ? String(existing.id) : createChore(householdId, { title: draft.title!, description: draft.description, kind: draft.mode === "each" ? "INDIVIDUAL" : "HOUSEHOLD" }, db);
      }
      if (!listChores(householdId, db).some((chore) => chore.id === choreId)) throw new Error("Choose an active chore from this household");
      const allocations: AllocationRule[] = draft.mode === "each" ? draft.memberIds.map((memberId) => ({ kind: "fixed", memberId }))
        : draft.mode === "rotation" ? [{ kind: "rotation", participantIds: draft.memberIds, offset: 0, cadence: draft.rotationCadence }]
        : [{ kind: "open", eligibleMemberIds: draft.memberIds }];
      for (const allocation of allocations) {
        const people = allocation.kind === "fixed" ? [allocation.memberId] : allocation.kind === "rotation" ? allocation.participantIds : allocation.eligibleMemberIds!;
        const duplicate = listResponsibilities(householdId, db).some((schedule) => !schedule.disabled && schedule.choreDefinitionId === choreId && schedule.routineId === draft.routineId
          && schedule.allocationKind === allocation.kind && JSON.stringify(allocation.kind === "open" ? [...schedule.participantIds].sort() : schedule.participantIds) === JSON.stringify(allocation.kind === "open" ? [...people].sort() : people)
          && schedule.activeFrom <= effective && (!schedule.activeThrough || draft.activeThrough !== null && schedule.activeThrough >= draft.activeThrough)
          && schedule.intervalWeeks === draft.intervalWeeks && JSON.stringify([...schedule.weekdays].sort()) === JSON.stringify([...new Set(draft.weekdays)].sort())
          && (allocation.kind !== "rotation" || schedule.rotationCadence === draft.rotationCadence)
          && (draft.intervalWeeks === 1 || daysBetween(startOfWeek(schedule.anchorDate), startOfWeek((draft.anchorDate ?? effective) as ISODate)) % (7 * draft.intervalWeeks) === 0));
        if (duplicate) { impact.duplicatesSkipped++; continue; }
        const templateId = createResponsibility(householdId, { choreDefinitionId: choreId, routineId: draft.routineId, activeFrom: effective, weekdays: draft.weekdays, intervalWeeks: draft.intervalWeeks, allocation }, db);
        const anchor = draft.anchorDate && draft.anchorDate <= effective ? draft.anchorDate : effective;
        db.prepare(`UPDATE responsibility_templates SET active_through = ?, supersedes_template_id = ?, rotation_cadence = ?, recurrence_json = ? WHERE id = ?`)
          .run(draft.activeThrough, originalIds[0] ?? null, draft.rotationCadence,
            JSON.stringify({ kind: "weekly_days", anchorDate: anchor, intervalWeeks: draft.intervalWeeks, weekdays: [...new Set(draft.weekdays)].sort() }), templateId);
        impact.templateIds.push(templateId);
      }
    }

    const affected = new Set<string>();
    const plans = db.prepare("SELECT * FROM weekly_plans WHERE household_id = ? AND week_start_date >= ? ORDER BY week_start_date").all(householdId, startOfWeek(effective)) as Row[];
    for (const plan of plans) {
      const planId = String(plan.id);
      const before = getWeekSnapshot(planId, db);
      const rows = db.prepare("SELECT * FROM chore_occurrences WHERE weekly_plan_id = ?").all(planId) as Row[];
      const candidates = rows.filter((row) => (originalIds.includes(String(row.source_template_id)) || preservedIds.has(String(row.id))) && (String(row.due_date) >= effective || String(row.source_instance_key).slice(-10) >= effective));
      const protectedDates = new Set<string>();
      const replacements = listResponsibilities(householdId, db).filter((schedule) => impact.templateIds.includes(schedule.id));
      const mutable: Row[] = [];
      for (const row of candidates) {
        const completed = db.prepare("SELECT 1 FROM completions WHERE occurrence_id = ?").get(row.id);
        const exception = db.prepare("SELECT 1 FROM weekly_plan_changes WHERE occurrence_id = ? AND action IN ('REASSIGN','MOVE','CANCEL','RESTORE','REORDER')").get(row.id);
        if (completed || exception) {
          const assignee = before.occurrences.find((item) => item.id === row.id)?.assigneeId;
          const replacement = replacements.find((schedule) => schedule.allocationKind === "fixed" && schedule.participantIds.includes(assignee ?? "")) ?? replacements[0];
          if (replacement) {
            protectedDates.add(`${replacement.id}:${String(row.source_instance_key).slice(-10)}`);
            db.prepare("INSERT OR IGNORE INTO schedule_preserved_occurrences VALUES (?, ?)").run(replacement.id, row.id);
          }
          if (completed) impact.keptCompleted++; else impact.keptExceptions++;
        } else if (row.status === "SCHEDULED") mutable.push(row);
      }
      const generated = generateWeekOccurrences(loadTemplates(householdId, before.weekStartDate, db).filter((template) => impact.templateIds.includes(template.id)), before.weekStartDate)
        .filter((occurrence) => occurrence.dueDate >= effective && !protectedDates.has(`${occurrence.sourceTemplateId}:${occurrence.dueDate}`));
      for (const occurrence of generated) {
        const oldIndex = mutable.findIndex((row) => row.due_date === occurrence.dueDate);
        const old = oldIndex < 0 ? undefined : mutable.splice(oldIndex, 1)[0];
        const occurrenceId = old ? String(old.id) : id();
        if (old) {
          db.prepare(`UPDATE chore_occurrences SET source_template_id = ?, source_instance_key = ?, routine_id = ?, routine_name_snapshot = ?, chore_title_snapshot = ?, chore_description_snapshot = ? WHERE id = ?`)
            .run(occurrence.sourceTemplateId, occurrence.sourceInstanceKey, occurrence.routineId ?? null, occurrence.routineName ?? null, occurrence.choreTitle, occurrence.choreDescription ?? null, occurrenceId);
          db.prepare("DELETE FROM occurrence_assignees WHERE occurrence_id = ?").run(occurrenceId);
          db.prepare("DELETE FROM occurrence_eligible_members WHERE occurrence_id = ?").run(occurrenceId);
          impact.updated++;
        } else {
          db.prepare(`INSERT INTO chore_occurrences(id, weekly_plan_id, chore_definition_id, source_template_id, source_instance_key, origin, due_date, status, chore_title_snapshot, chore_description_snapshot, chore_kind_snapshot, routine_id, routine_name_snapshot, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, 'RECURRING', ?, 'SCHEDULED', ?, ?, ?, ?, ?, ?, ?)`)
            .run(occurrenceId, planId, occurrence.choreDefinitionId, occurrence.sourceTemplateId, occurrence.sourceInstanceKey, occurrence.dueDate, occurrence.choreTitle, occurrence.choreDescription ?? null, occurrence.choreKind, occurrence.routineId ?? null, occurrence.routineName ?? null, occurrence.sortOrder, now());
          impact.added++;
        }
        if (occurrence.plannedAssigneeId) db.prepare("INSERT INTO occurrence_assignees VALUES (?, ?)").run(occurrenceId, occurrence.plannedAssigneeId);
        for (const memberId of occurrence.eligibleMemberIds) db.prepare("INSERT INTO occurrence_eligible_members VALUES (?, ?)").run(occurrenceId, memberId);
        affected.add(planId);
      }
      for (const row of mutable) {
        db.prepare("UPDATE chore_occurrences SET status = 'CANCELLED' WHERE id = ?").run(row.id);
        impact.removed++; affected.add(planId);
      }
      if (affected.has(planId)) {
        db.prepare("INSERT INTO weekly_plan_changes(id, weekly_plan_id, action, before_json, after_json, created_at) VALUES (?, ?, 'SCHEDULE_CHANGE', ?, ?, ?)")
          .run(id(), planId, JSON.stringify(before), JSON.stringify(change), now());
        bumpRevision(planId, before.revision, db);
        impact.charts += listLatestCharts(planId, db).filter((chart) => chart.stale).length;
      }
    }
    impact.weeks = affected.size;
    // Preview a fortnight even when those weeks have never been opened. No week is generated by previewing.
    for (let offset = 0; offset < 21; offset += 7) {
      const week = addDays(startOfWeek(effective), offset);
      const generated = generateWeekOccurrences(loadTemplates(householdId, week, db).filter((template) => impact.templateIds.includes(template.id)), week);
      impact.examples.push(...generated.filter((item) => item.dueDate >= effective && item.dueDate < addDays(effective, 14)).map((item) => ({ date: item.dueDate, title: item.choreTitle, person: members.find((member) => member.id === item.plannedAssigneeId)?.displayName ?? "Anyone selected" })));
    }
    return impact;
  });
}
