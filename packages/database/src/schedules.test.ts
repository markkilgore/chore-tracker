import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { migrateDatabase, openDatabase, withImmediateTransaction, type SqliteDatabase } from "./db";
import { createHousehold, createMember, createChore, createResponsibility, materializeWeek, changeSchedules, reviewScheduleChange, commitScheduleChange, listResponsibilities, listChores, updateOccurrence, completeOccurrence, createChartExport, getChartExport, listLatestCharts, applyResponsibilityToWeek, getWeekSnapshot } from "./service";
import type { ScheduleChange, ScheduleDraft } from "@chore-tracker/contracts";

let db: SqliteDatabase;
let household: string;
let kate: string;
let henry: string;
let chore: string;
const monday = "2026-09-14";
function draft(extra: Partial<ScheduleDraft> = {}): ScheduleDraft {
  return { choreDefinitionId: chore, routineId: null, mode: "each", memberIds: [kate], weekdays: [1, 2, 3, 4, 5], intervalWeeks: 1, rotationCadence: "occurrence", activeThrough: null, ...extra };
}
function create(entries = [draft()], effectiveFrom = monday): ScheduleChange {
  return { action: "create", effectiveFrom, templateIds: [], entries };
}
function edit(templateId: string, effectiveFrom = "2026-09-16", entries = [draft({ memberIds: [henry] })]): ScheduleChange {
  return { action: "edit", effectiveFrom, templateIds: [templateId], entries };
}

beforeEach(() => {
  db = openDatabase(":memory:"); migrateDatabase(db);
  household = createHousehold("Test family", "America/Los_Angeles", db).id;
  kate = createMember(household, { displayName: "Kate", kind: "CHILD", canAdminister: false, themeKey: "cats" }, db);
  henry = createMember(household, { displayName: "Henry", kind: "CHILD", canAdminister: false, themeKey: "ocean" }, db);
  chore = createChore(household, { title: "Make bed", kind: "INDIVIDUAL" }, db);
});
afterEach(() => db.close());

describe("family schedule changes", () => {
  it("previews without creating chores, schedules, or weeks, then commits atomically and retries once", () => {
    const change = create([draft({ choreDefinitionId: undefined, title: "Pack lunch", memberIds: [kate, henry] })]);
    const preview = reviewScheduleChange(household, change, db);
    expect(preview.examples).toHaveLength(20);
    expect(listResponsibilities(household, db)).toHaveLength(0);
    expect(listChores(household, db)).toHaveLength(1);
    expect(db.prepare("SELECT * FROM weekly_plans").all()).toHaveLength(0);
    const requestId = randomUUID();
    const result = commitScheduleChange(household, change, preview.token, requestId, db);
    expect(result.templateIds).toHaveLength(2);
    expect(commitScheduleChange(household, change, preview.token, requestId, db)).toEqual(result);
    expect(listResponsibilities(household, db)).toHaveLength(2);
    expect(listChores(household, db)).toHaveLength(2);
  });

  it("adds multi-person chores to every existing upcoming week and skips matching assignments", () => {
    const current = materializeWeek(household, "2026-09-13", db);
    const future = materializeWeek(household, "2026-09-27", db);
    const change = create([draft({ memberIds: [kate, henry] })]);
    const result = changeSchedules(household, change, db);
    expect(result.added).toBe(20);
    expect(result.weeks).toBe(2);
    expect(getWeekSnapshot(current.id, db).occurrences).toHaveLength(10);
    expect(getWeekSnapshot(future.id, db).occurrences).toHaveLength(10);
    expect(changeSchedules(household, change, db).duplicatesSkipped).toBe(2);
  });

  it("keeps the old assignee when earlier weeks are opened after a forward edit", () => {
    const original = changeSchedules(household, create(), db).templateIds[0];
    const result = changeSchedules(household, edit(original, "2026-09-28"), db);
    expect(materializeWeek(household, "2026-09-14", db).occurrences.every((item) => item.assigneeId === kate)).toBe(true);
    expect(materializeWeek(household, "2026-09-28", db).occurrences.every((item) => item.assigneeId === henry)).toBe(true);
    expect(listResponsibilities(household, db).find((item) => item.id === result.templateIds[0])?.supersedesTemplateId).toBe(original);
  });

  it("preserves completed, moved, skipped, and reassigned work through repeated edits without duplicates", () => {
    const original = changeSchedules(household, create(), db).templateIds[0];
    let week = materializeWeek(household, "2026-09-14", db);
    const [mon, tue, wed, thu] = week.occurrences;
    completeOccurrence(mon.id, kate, kate, db);
    week = getWeekSnapshot(week.id, db);
    week = updateOccurrence(tue.id, { action: "move", dueDate: "2026-09-19", expectedRevision: week.revision }, db);
    week = updateOccurrence(wed.id, { action: "cancel", expectedRevision: week.revision }, db);
    week = updateOccurrence(thu.id, { action: "reassign", memberId: henry, expectedRevision: week.revision }, db);
    const change = edit(original, monday);
    const preview = reviewScheduleChange(household, change, db);
    expect(preview.keptCompleted).toBe(1); expect(preview.keptExceptions).toBe(3); expect(preview.updated).toBe(1);
    const first = changeSchedules(household, change, db);
    changeSchedules(household, edit(first.templateIds[0], monday, [draft()]), db);
    const result = getWeekSnapshot(week.id, db);
    expect(result.occurrences).toHaveLength(5);
    expect(result.occurrences.find((item) => item.id === mon.id)?.assigneeId).toBe(kate);
    expect(result.occurrences.find((item) => item.id === tue.id)?.dueDate).toBe("2026-09-19");
    expect(result.occurrences.find((item) => item.id === wed.id)?.status).toBe("CANCELLED");
    expect(result.occurrences.find((item) => item.id === thu.id)?.assigneeId).toBe(henry);
  });

  it("edits days, routine, and end date and reconciles existing weeks", () => {
    const original = changeSchedules(household, create(), db).templateIds[0];
    const week = materializeWeek(household, monday, db);
    const next = materializeWeek(household, "2026-09-21", db);
    const routine = (db.prepare("SELECT id FROM routines LIMIT 1").get() as { id: string }).id;
    changeSchedules(household, edit(original, "2026-09-16", [draft({ weekdays: [3, 6], routineId: routine, activeThrough: "2026-09-19" })]), db);
    const active = getWeekSnapshot(week.id, db).occurrences.filter((item) => item.status === "SCHEDULED");
    expect(active.map((item) => item.dueDate)).toEqual([monday, "2026-09-15", "2026-09-16", "2026-09-19"]);
    expect(active.find((item) => item.dueDate === "2026-09-19")?.routineId).toBe(routine);
    expect(getWeekSnapshot(next.id, db).occurrences.filter((item) => item.status === "SCHEDULED")).toHaveLength(0);
  });

  it("stops schedules in existing weeks, retains paper snapshots, and marks charts stale", () => {
    const original = changeSchedules(household, create(), db).templateIds[0];
    const week = materializeWeek(household, monday, db);
    const chartId = createChartExport(week.id, kate, undefined, db);
    const chart = getChartExport(chartId, db);
    changeSchedules(household, { action: "stop", templateIds: [original], entries: [], effectiveFrom: "2026-09-16" }, db);
    expect(getWeekSnapshot(week.id, db).occurrences.filter((item) => item.status === "SCHEDULED")).toHaveLength(2);
    expect(getChartExport(chartId, db)).toEqual(chart);
    expect(listLatestCharts(week.id, db)[0].stale).toBe(true);
    createChartExport(week.id, kate, undefined, db);
    expect(listLatestCharts(week.id, db)).toHaveLength(1);
    expect(listLatestCharts(week.id, db)[0].stale).toBe(false);
  });

  it("supports stopping a schedule before it starts", () => {
    const original = changeSchedules(household, create(), db).templateIds[0];
    changeSchedules(household, { action: "stop", templateIds: [original], entries: [], effectiveFrom: "2026-09-01" }, db);
    expect(materializeWeek(household, monday, db).occurrences).toHaveLength(0);
  });

  it("rejects a stale preview after another session completes a chore", () => {
    const original = changeSchedules(household, create(), db).templateIds[0];
    const week = materializeWeek(household, monday, db);
    const change = edit(original);
    const preview = reviewScheduleChange(household, change, db);
    completeOccurrence(week.occurrences[0].id, kate, kate, db);
    expect(() => commitScheduleChange(household, change, preview.token, randomUUID(), db)).toThrow(/Review/);
    expect(listResponsibilities(household, db)).toHaveLength(1);
  });

  it("rolls back all batch changes on invalid membership and legacy create/apply failures", () => {
    expect(() => changeSchedules(household, create([draft({ title: "New chore", choreDefinitionId: undefined }), draft({ memberIds: [randomUUID()] })]), db)).toThrow(/active members/);
    expect(listResponsibilities(household, db)).toHaveLength(0);
    expect(listChores(household, db)).toHaveLength(1);
    const week = materializeWeek(household, monday, db);
    expect(() => withImmediateTransaction(db, () => {
      const template = createResponsibility(household, { choreDefinitionId: chore, activeFrom: monday, weekdays: [1], intervalWeeks: 1, allocation: { kind: "fixed", memberId: kate } }, db);
      applyResponsibilityToWeek(template, week.id, 99, db);
    })).toThrow(/another session/);
    expect(listResponsibilities(household, db)).toHaveLength(0);
  });

  it("rotates weekly and keeps alternating-week copies on the source phase", () => {
    changeSchedules(household, create([draft({ mode: "rotation", memberIds: [henry, kate], rotationCadence: "week" })]), db);
    expect(materializeWeek(household, monday, db).occurrences.every((item) => item.assigneeId === henry)).toBe(true);
    expect(materializeWeek(household, "2026-09-21", db).occurrences.every((item) => item.assigneeId === kate)).toBe(true);
    const extra = createChore(household, { title: "Wash sheets", kind: "INDIVIDUAL" }, db);
    changeSchedules(household, create([draft({ choreDefinitionId: extra, memberIds: [henry], intervalWeeks: 2, weekdays: [1], anchorDate: monday })], "2026-09-21"), db);
    expect(materializeWeek(household, "2026-09-21", db).occurrences.filter((item) => item.choreDefinitionId === extra)).toHaveLength(0);
    expect(materializeWeek(household, "2026-09-28", db).occurrences.filter((item) => item.choreDefinitionId === extra)).toHaveLength(1);
  });
});

it("prints one row across schedule versions and respects open-chore eligibility", () => {
  const original = changeSchedules(household, create(), db).templateIds[0];
  const week = materializeWeek(household, monday, db);
  changeSchedules(household, edit(original, "2026-09-16", [draft({ weekdays: [3, 4, 5, 6] })]), db);
  const chart = getChartExport(createChartExport(week.id, kate, undefined, db), db);
  expect(chart.snapshot.rows).toHaveLength(1);
  expect(chart.snapshot.rows[0].cells.filter((cell) => cell.occurrenceId)).toHaveLength(6);
  changeSchedules(household, create([draft({ choreDefinitionId: undefined, title: "Household help", mode: "open", memberIds: [kate] })]), db);
  expect(getChartExport(createChartExport(week.id, henry, undefined, db), db).snapshot.rows).toHaveLength(0);
});

it("prints a checkbox for each occurrence even when a manual move puts two on one day", () => {
  changeSchedules(household, create(), db);
  const week = materializeWeek(household, monday, db);
  updateOccurrence(week.occurrences[0].id, { action: "move", dueDate: "2026-09-15", expectedRevision: week.revision }, db);
  const chart = getChartExport(createChartExport(week.id, kate, undefined, db), db);
  expect(chart.manifest).toHaveLength(5);
  expect(chart.snapshot.rows).toHaveLength(2);
});

it("adding another child keeps the original completion without suppressing the new child's work", () => {
  const original = changeSchedules(household, create(), db).templateIds[0];
  const week = materializeWeek(household, monday, db);
  completeOccurrence(week.occurrences[0].id, kate, kate, db);
  const split = changeSchedules(household, edit(original, monday, [draft({ memberIds: [kate, henry] })]), db);
  let mondayItems = getWeekSnapshot(week.id, db).occurrences.filter((item) => item.dueDate === monday && item.status === "SCHEDULED");
  expect(mondayItems).toHaveLength(2);
  expect(mondayItems.some((item) => item.assigneeId === kate && item.completionId)).toBe(true);
  expect(mondayItems.some((item) => item.assigneeId === henry && !item.completionId)).toBe(true);
  const henrySchedule = listResponsibilities(household, db).find((item) => split.templateIds.includes(item.id) && item.participantIds.includes(henry))!;
  changeSchedules(household, edit(henrySchedule.id, monday, [draft({ memberIds: [henry], weekdays: [1, 3, 5] })]), db);
  mondayItems = getWeekSnapshot(week.id, db).occurrences.filter((item) => item.dueDate === monday && item.status === "SCHEDULED");
  expect(mondayItems).toHaveLength(2);
});

it("rejects moving a successor before its historical boundary", () => {
  const original = changeSchedules(household, create(), db).templateIds[0];
  const replacement = changeSchedules(household, edit(original, "2026-09-28"), db).templateIds[0];
  expect(() => changeSchedules(household, edit(replacement, monday), db)).toThrow(/previous schedule/);
  expect(materializeWeek(household, monday, db).occurrences).toHaveLength(5);
});
