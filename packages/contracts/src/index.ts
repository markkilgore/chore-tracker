import { assertISODate } from "@chore-tracker/domain";
import { z } from "zod";
import { THEME_KEYS } from "./themes";

export * from "./themes";

export const isoDateSchema = z.string().refine((value) => { try { assertISODate(value); return true; } catch { return false; } }, "Choose a valid date");
export const memberKindSchema = z.enum(["CHILD", "ADULT", "OTHER"]);
export const choreKindSchema = z.enum(["INDIVIDUAL", "HOUSEHOLD"]);
export const themeKeySchema = z.enum(THEME_KEYS);

export const createMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  kind: memberKindSchema,
  canAdminister: z.boolean().default(false),
  themeKey: themeKeySchema.default("sunny")
});

export const createChoreSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  kind: choreKindSchema
});

export const createResponsibilitySchema = z.object({
  choreDefinitionId: z.string().uuid(),
  routineId: z.string().uuid().nullable().optional(),
  activeFrom: isoDateSchema,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  intervalWeeks: z.number().int().min(1).max(52).default(1),
  allocation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), memberId: z.string().uuid() }),
    z.object({ kind: z.literal("rotation"), participantIds: z.array(z.string().uuid()).min(1), offset: z.number().int().default(0) }),
    z.object({ kind: z.literal("open"), eligibleMemberIds: z.array(z.string().uuid()).optional() })
  ]),
  applyToPlanId: z.string().uuid().optional(),
  expectedRevision: z.number().int().nonnegative().optional()
}).refine((input) => Boolean(input.applyToPlanId) === (input.expectedRevision !== undefined), "Applying to a week requires its current revision");

export const responsibilityActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("end"), activeThrough: isoDateSchema }),
  z.object({ action: z.literal("reassign"), memberId: z.string().uuid(), effectiveFrom: isoDateSchema })
]);

export const occurrenceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), expectedRevision: z.number().int().nonnegative() }),
  z.object({ action: z.literal("restore"), expectedRevision: z.number().int().nonnegative() }),
  z.object({ action: z.literal("move"), dueDate: isoDateSchema, expectedRevision: z.number().int().nonnegative() }),
  z.object({ action: z.literal("reorder"), sortOrder: z.number().int(), expectedRevision: z.number().int().nonnegative() }),
  z.object({ action: z.literal("reassign"), memberId: z.string().uuid().nullable(), expectedRevision: z.number().int().nonnegative() })
]);

export const updateMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  kind: memberKindSchema.optional(),
  canAdminister: z.boolean().optional(),
  themeKey: themeKeySchema.optional()
}).refine((input) => Object.keys(input).length > 0, "At least one field is required");

export const updateChoreSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  kind: choreKindSchema.optional(),
  active: z.boolean().optional()
}).refine((input) => Object.keys(input).length > 0, "At least one field is required");

export const oneOffSchema = z.object({
  choreDefinitionId: z.string().uuid(),
  dueDate: isoDateSchema,
  memberId: z.string().uuid().nullable(),
  routineId: z.string().uuid().nullable().optional(),
  expectedRevision: z.number().int().nonnegative()
});

export const completionSchema = z.object({
  completedByMemberId: z.string().uuid(),
  recordedByMemberId: z.string().uuid().nullable().optional()
});

export const chartExportSchema = z.object({
  weeklyPlanId: z.string().uuid(),
  memberId: z.string().uuid(),
  themeKey: themeKeySchema.optional()
});


export const scheduleDraftSchema = z.object({
  choreDefinitionId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  routineId: z.string().uuid().nullable(),
  mode: z.enum(["each", "rotation", "open"]),
  memberIds: z.array(z.string().uuid()).min(1).refine((ids) => new Set(ids).size === ids.length, "Choose each person once"),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  intervalWeeks: z.number().int().min(1).max(52),
  rotationCadence: z.enum(["occurrence", "week"]),
  activeThrough: isoDateSchema.nullable(),
  // Copying retains the source's alternating-week phase.
  anchorDate: isoDateSchema.optional()
}).refine((draft) => Boolean(draft.choreDefinitionId || draft.title), "Choose or name a chore");

export const scheduleChangeSchema = z.object({
  action: z.enum(["create", "edit", "stop"]),
  effectiveFrom: isoDateSchema,
  templateIds: z.array(z.string().uuid()).max(100),
  entries: z.array(scheduleDraftSchema).max(100)
}).superRefine((change, ctx) => {
  if ((change.action === "create" && change.templateIds.length > 0) || (change.action !== "create" && !change.templateIds.length))
    ctx.addIssue({ code: "custom", message: "Choose the schedules to change" });
  if (change.action === "stop" ? change.entries.length !== 0 : change.entries.length === 0)
    ctx.addIssue({ code: "custom", message: "Choose at least one chore" });
  if (change.action === "edit" && change.templateIds.length !== 1)
    ctx.addIssue({ code: "custom", message: "Edit one schedule at a time" });
  for (const entry of change.entries) if (entry.activeThrough && entry.activeThrough < change.effectiveFrom)
    ctx.addIssue({ code: "custom", message: "End date must be on or after the start date" });
});
export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;
export type ScheduleChange = z.infer<typeof scheduleChangeSchema>;
export const scheduleRequestSchema = z.object({
  change: scheduleChangeSchema,
  preview: z.boolean(),
  token: z.string().optional(),
  requestId: z.string().uuid()
});
