import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, dateInTimeZone } from "@chore-tracker/domain";
import {
  addOneOff,
  applyResponsibilityToWeek,
  completeOccurrence,
  createMember,
  createChartExport,
  createResponsibility,
  deleteResponsibility,
  getChartExport,
  getDashboard,
  materializeWeek,
  reassignResponsibility,
  removeMember,
  seedDemo,
  updateOccurrence,
  voidCompletion
} from "./service";
import { migrateDatabase, openDatabase, type SqliteDatabase } from "./db";

describe("SQLite application model", () => {
  let directory: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "chore-tracker-test-"));
    db = openDatabase(path.join(directory, "test.sqlite"));
    migrateDatabase(db);
    seedDemo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("materializes a week idempotently", () => {
    const dashboard = getDashboard(undefined, db)!;
    const first = materializeWeek(dashboard.household.id, dashboard.week.weekStartDate, db);
    const second = materializeWeek(dashboard.household.id, dashboard.week.weekStartDate, db);
    expect(second.id).toBe(first.id);
    expect(second.occurrences.map((item) => item.id)).toEqual(first.occurrences.map((item) => item.id));
  });

  it("tracks one-off edits by weekly revision", () => {
    const dashboard = getDashboard(undefined, db)!;
    const result = addOneOff(dashboard.week.id, {
      choreDefinitionId: dashboard.chores[0].id,
      dueDate: addDays(dashboard.week.weekStartDate, 3),
      memberId: dashboard.members[0].id,
      expectedRevision: dashboard.week.revision
    }, db);
    expect(result.revision).toBe(dashboard.week.revision + 1);
    const oneOff = result.occurrences.find((item) => item.origin === "ONE_OFF")!;
    const cancelled = updateOccurrence(oneOff.id, { action: "cancel", expectedRevision: result.revision }, db);
    expect(cancelled.occurrences.find((item) => item.id === oneOff.id)?.status).toBe("CANCELLED");
  });

  it("applies a new standing responsibility to an already-generated week only when explicit", () => {
    const dashboard = getDashboard(undefined, db)!;
    const templateId = createResponsibility(dashboard.household.id, {
      choreDefinitionId: dashboard.chores[0].id,
      routineId: dashboard.routines[0].id,
      activeFrom: dashboard.week.weekStartDate,
      weekdays: [3],
      intervalWeeks: 1,
      allocation: { kind: "fixed", memberId: dashboard.members[0].id }
    }, db);
    expect(materializeWeek(dashboard.household.id, dashboard.week.weekStartDate, db).occurrences
      .some((item) => item.sourceTemplateId === templateId)).toBe(false);
    const applied = applyResponsibilityToWeek(templateId, dashboard.week.id, dashboard.week.revision, db);
    expect(applied.revision).toBe(dashboard.week.revision + 1);
    expect(applied.occurrences.find((item) => item.sourceTemplateId === templateId)?.origin).toBe("OVERRIDE");
  });

  it("reassigns a standing responsibility and its uncompleted generated chores forward", () => {
    const dashboard = getDashboard(undefined, db)!;
    const [firstMember, secondMember] = dashboard.members;
    const templateId = createResponsibility(dashboard.household.id, {
      choreDefinitionId: dashboard.chores[0].id,
      routineId: dashboard.routines[0].id,
      activeFrom: dashboard.week.weekStartDate,
      weekdays: [0, 1],
      intervalWeeks: 1,
      allocation: { kind: "open", eligibleMemberIds: [firstMember.id, secondMember.id] }
    }, db);
    const applied = applyResponsibilityToWeek(templateId, dashboard.week.id, dashboard.week.revision, db);
    const generated = applied.occurrences.filter((item) => item.sourceTemplateId === templateId);
    completeOccurrence(generated[0].id, firstMember.id, firstMember.id, db);

    const result = reassignResponsibility(templateId, secondMember.id, dashboard.week.weekStartDate, db);
    const corrected = getDashboard(undefined, db)!;
    const responsibility = corrected.responsibilities.find((item) => item.id === templateId)!;
    const occurrences = corrected.week.occurrences.filter((item) => item.sourceTemplateId === templateId);

    expect(result).toEqual({ updatedOccurrenceCount: 1, updatedPlanCount: 1 });
    expect(responsibility.allocationKind).toBe("fixed");
    expect(responsibility.participantIds).toEqual([secondMember.id]);
    expect(occurrences.find((item) => item.id === generated[0].id)?.assigneeId).toBeNull();
    expect(occurrences.find((item) => item.id === generated[1].id)?.assigneeId).toBe(secondMember.id);
    expect(corrected.week.revision).toBe(applied.revision + 1);
  });

  it("deletes an erroneous responsibility and its unused generated chores", () => {
    const dashboard = getDashboard(undefined, db)!;
    const templateId = createResponsibility(dashboard.household.id, {
      choreDefinitionId: dashboard.chores[0].id,
      routineId: dashboard.routines[0].id,
      activeFrom: dashboard.week.weekStartDate,
      weekdays: [3],
      intervalWeeks: 1,
      allocation: { kind: "fixed", memberId: dashboard.members[0].id }
    }, db);
    const applied = applyResponsibilityToWeek(templateId, dashboard.week.id, dashboard.week.revision, db);

    expect(deleteResponsibility(templateId, db)).toEqual({ deletedOccurrenceCount: 1, updatedPlanCount: 1 });
    expect(db.prepare("SELECT id FROM responsibility_templates WHERE id = ?").get(templateId)).toBeUndefined();
    expect(db.prepare("SELECT id FROM chore_occurrences WHERE source_template_id = ?").all(templateId)).toHaveLength(0);
    expect(getDashboard(undefined, db)!.week.revision).toBe(applied.revision + 1);
  });

  it("protects completed or printed responsibility history from deletion", () => {
    const dashboard = getDashboard(undefined, db)!;
    const completedTemplateId = createResponsibility(dashboard.household.id, {
      choreDefinitionId: dashboard.chores[0].id,
      activeFrom: dashboard.week.weekStartDate,
      weekdays: [4],
      intervalWeeks: 1,
      allocation: { kind: "fixed", memberId: dashboard.members[0].id }
    }, db);
    const applied = applyResponsibilityToWeek(completedTemplateId, dashboard.week.id, dashboard.week.revision, db);
    const occurrence = applied.occurrences.find((item) => item.sourceTemplateId === completedTemplateId)!;
    completeOccurrence(occurrence.id, dashboard.members[0].id, dashboard.members[0].id, db);
    expect(() => deleteResponsibility(completedTemplateId, db)).toThrow(/completion history/);

    const printedTemplateId = createResponsibility(dashboard.household.id, {
      choreDefinitionId: dashboard.chores[1].id,
      activeFrom: dashboard.week.weekStartDate,
      weekdays: [5],
      intervalWeeks: 1,
      allocation: { kind: "fixed", memberId: dashboard.members[1].id }
    }, db);
    const current = getDashboard(undefined, db)!;
    applyResponsibilityToWeek(printedTemplateId, current.week.id, current.week.revision, db);
    const afterApply = getDashboard(undefined, db)!;
    createChartExport(afterApply.week.id, dashboard.members[1].id, undefined, db);
    expect(() => deleteResponsibility(printedTemplateId, db)).toThrow(/chart was already issued/);
  });

  it("keeps completion corrections instead of deleting history", () => {
    const dashboard = getDashboard(undefined, db)!;
    const occurrence = dashboard.week.occurrences.find((item) => item.status === "SCHEDULED" && !item.completionId)!;
    completeOccurrence(occurrence.id, dashboard.members[0].id, dashboard.members.at(-1)!.id, db);
    voidCompletion(occurrence.id, dashboard.members.at(-1)!.id, db);
    completeOccurrence(occurrence.id, dashboard.members[1].id, dashboard.members.at(-1)!.id, db);
    const rows = db.prepare("SELECT * FROM completions WHERE occurrence_id = ? ORDER BY completed_at").all(occurrence.id) as Array<{ voided_at: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.voided_at === null)).toHaveLength(1);
  });

  it("records a different actual completer while enforcing open-chore eligibility", () => {
    const dashboard = getDashboard(undefined, db)!;
    const assigned = dashboard.week.occurrences.find((item) => item.assigneeId && !item.completionId)!;
    const helper = dashboard.members.find((member) => member.id !== assigned.assigneeId)!;
    expect(() => completeOccurrence(assigned.id, helper.id, helper.id, db)).not.toThrow();

    const open = dashboard.week.occurrences.find((item) => item.assigneeId === null)!;
    const ineligible = dashboard.members.find((member) => !open.eligibleMemberIds.includes(member.id))!;
    expect(() => completeOccurrence(open.id, ineligible.id, ineligible.id, db)).toThrow(/not available/);
  });

  it("creates an immutable chart manifest with stable occurrence ids", () => {
    const dashboard = getDashboard(undefined, db)!;
    const child = dashboard.members.find((member) => member.kind === "CHILD")!;
    const chartId = createChartExport(dashboard.week.id, child.id, undefined, db);
    const chart = getChartExport(chartId, db);
    expect(chart.snapshot.chartId).toBe(chartId);
    expect(chart.checksum).toHaveLength(16);
    expect(chart.snapshot.rows.flatMap((row) => row.cells).some((cell) => cell.occurrenceId)).toBe(true);
  });

  it("removes an accidentally added member with no chore references", () => {
    const dashboard = getDashboard(undefined, db)!;
    const extraId = createMember(dashboard.household.id, {
      displayName: "Extra person",
      kind: "OTHER",
      canAdminister: false,
      themeKey: "cats"
    }, db);

    removeMember(extraId, db);

    expect(db.prepare("SELECT id FROM household_members WHERE id = ?").get(extraId)).toBeUndefined();
    expect(db.prepare("SELECT member_id FROM member_profiles WHERE member_id = ?").get(extraId)).toBeUndefined();
  });

  it("preserves members that already have assignments or history", () => {
    const dashboard = getDashboard(undefined, db)!;
    const assignedMember = dashboard.members.find((member) =>
      dashboard.responsibilities.some((responsibility) => responsibility.participantIds.includes(member.id))
    )!;

    expect(() => removeMember(assignedMember.id, db)).toThrow(/assignments or history/);
    expect(db.prepare("SELECT id FROM household_members WHERE id = ?").get(assignedMember.id)).toBeDefined();
  });

  it("uses WAL, foreign keys, and a healthy database", () => {
    expect(String((db.pragma("journal_mode") as Array<{ journal_mode: string }>)[0].journal_mode).toLowerCase()).toBe("wal");
    expect((db.pragma("foreign_keys") as Array<{ foreign_keys: number }>)[0].foreign_keys).toBe(1);
    expect((db.pragma("quick_check") as Array<{ quick_check: string }>)[0].quick_check).toBe("ok");
  });
});
