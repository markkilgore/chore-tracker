export type ISODate = `${number}-${number}-${number}`;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type MemberKind = "CHILD" | "ADULT" | "OTHER";
export type ChoreKind = "INDIVIDUAL" | "HOUSEHOLD";
export type OccurrenceOrigin = "RECURRING" | "ONE_OFF" | "OVERRIDE";
export type OccurrenceStatus = "SCHEDULED" | "CANCELLED";

export interface WeeklyDaysRule {
  kind: "weekly_days";
  anchorDate: ISODate;
  intervalWeeks: number;
  weekdays: readonly Weekday[];
}

export type RecurrenceRule = WeeklyDaysRule;

export type AllocationRule =
  | { kind: "fixed"; memberId: string }
  | { kind: "rotation"; participantIds: string[]; offset: number; cadence?: "occurrence" | "week" }
  | { kind: "open"; eligibleMemberIds?: string[] };

export interface ResponsibilityTemplate {
  id: string;
  choreDefinitionId: string;
  choreTitle: string;
  choreDescription?: string | null;
  choreKind: ChoreKind;
  routineId?: string | null;
  routineName?: string | null;
  sortOrder: number;
  activeFrom: ISODate;
  activeThrough?: ISODate | null;
  recurrence: RecurrenceRule;
  allocation: AllocationRule;
}

export interface GeneratedOccurrence {
  sourceInstanceKey: string;
  sourceTemplateId: string;
  choreDefinitionId: string;
  choreTitle: string;
  choreDescription?: string | null;
  choreKind: ChoreKind;
  dueDate: ISODate;
  routineId?: string | null;
  routineName?: string | null;
  sortOrder: number;
  plannedAssigneeId: string | null;
  eligibleMemberIds: string[];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertISODate(value: string): asserts value is ISODate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ISO date: ${value}`);
}

export function addDays(value: ISODate, amount: number): ISODate {
  assertISODate(value);
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10) as ISODate;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  assertISODate(from);
  assertISODate(to);
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function weekday(value: ISODate): Weekday {
  assertISODate(value);
  return new Date(`${value}T00:00:00Z`).getUTCDay() as Weekday;
}

export function startOfWeek(value: ISODate, startsOn: Weekday = 0): ISODate {
  const delta = (weekday(value) - startsOn + 7) % 7;
  return addDays(value, -delta);
}

export function dateInTimeZone(now: Date, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const result = `${part("year")}-${part("month")}-${part("day")}`;
  assertISODate(result);
  return result;
}

export function datesForRuleInWeek(rule: RecurrenceRule, weekStart: ISODate): ISODate[] {
  if (rule.intervalWeeks < 1 || !Number.isInteger(rule.intervalWeeks)) {
    throw new Error("intervalWeeks must be a positive integer");
  }
  const anchorWeek = startOfWeek(rule.anchorDate, 0);
  const targetWeek = startOfWeek(weekStart, 0);
  const weekOffset = Math.floor(daysBetween(anchorWeek, targetWeek) / 7);
  if (weekOffset < 0 || weekOffset % rule.intervalWeeks !== 0) return [];

  const wanted = new Set(rule.weekdays);
  return Array.from({ length: 7 }, (_, index) => addDays(targetWeek, index))
    .filter((date) => wanted.has(weekday(date)))
    .filter((date) => date >= rule.anchorDate);
}

export function rotationIndexForDate(rule: RecurrenceRule, dueDate: ISODate, participantCount: number, offset = 0): number {
  if (participantCount < 1) throw new Error("A rotation needs at least one participant");
  let sequence = 0;
  let cursor = startOfWeek(rule.anchorDate, 0);
  const targetWeek = startOfWeek(dueDate, 0);
  while (cursor <= targetWeek) {
    for (const date of datesForRuleInWeek(rule, cursor)) {
      if (date === dueDate) return ((sequence + offset) % participantCount + participantCount) % participantCount;
      if (date < dueDate) sequence += 1;
    }
    cursor = addDays(cursor, 7);
  }
  throw new Error(`${dueDate} is not an occurrence date for the recurrence rule`);
}

export function generateWeekOccurrences(
  templates: ResponsibilityTemplate[],
  requestedWeekStart: ISODate
): GeneratedOccurrence[] {
  const weekStart = startOfWeek(requestedWeekStart, 0);
  const generated: GeneratedOccurrence[] = [];

  for (const template of templates) {
    for (const dueDate of datesForRuleInWeek(template.recurrence, weekStart)) {
      if (dueDate < template.activeFrom) continue;
      if (template.activeThrough && dueDate > template.activeThrough) continue;

      let plannedAssigneeId: string | null = null;
      let eligibleMemberIds: string[] = [];
      if (template.allocation.kind === "fixed") {
        plannedAssigneeId = template.allocation.memberId;
        eligibleMemberIds = [template.allocation.memberId];
      } else if (template.allocation.kind === "rotation") {
        const participants = template.allocation.participantIds;
        if (participants.length === 0) throw new Error(`Rotation ${template.id} has no participants`);
        plannedAssigneeId = participants[
          template.allocation.cadence === "week"
            ? ((Math.floor(daysBetween(startOfWeek(template.recurrence.anchorDate), startOfWeek(dueDate)) / 7 / template.recurrence.intervalWeeks) + template.allocation.offset) % participants.length + participants.length) % participants.length
            : rotationIndexForDate(template.recurrence, dueDate, participants.length, template.allocation.offset)
        ];
        eligibleMemberIds = [...participants];
      } else {
        eligibleMemberIds = [...(template.allocation.eligibleMemberIds ?? [])];
      }

      generated.push({
        sourceInstanceKey: `${template.id}:${dueDate}`,
        sourceTemplateId: template.id,
        choreDefinitionId: template.choreDefinitionId,
        choreTitle: template.choreTitle,
        choreDescription: template.choreDescription,
        choreKind: template.choreKind,
        dueDate,
        routineId: template.routineId,
        routineName: template.routineName,
        sortOrder: template.sortOrder,
        plannedAssigneeId,
        eligibleMemberIds
      });
    }
  }

  return generated.sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate) || a.sortOrder - b.sortOrder || a.choreTitle.localeCompare(b.choreTitle)
  );
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function weekDates(weekStart: ISODate): ISODate[] {
  const normalized = startOfWeek(weekStart, 0);
  return Array.from({ length: 7 }, (_, index) => addDays(normalized, index));
}

export function formatWeekRange(weekStart: ISODate): string {
  const end = addDays(startOfWeek(weekStart, 0), 6);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${formatter.format(new Date(`${weekStart}T12:00:00Z`))} – ${formatter.format(new Date(`${end}T12:00:00Z`))}`;
}

export * from "./species";
