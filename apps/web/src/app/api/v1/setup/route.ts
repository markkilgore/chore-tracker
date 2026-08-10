import {
  createChore,
  createHousehold,
  createMember,
  createResponsibility,
  applyResponsibilityToWeek,
  getFirstHousehold,
  seedDemo
} from "@chore-tracker/database";
import { createChoreSchema, createMemberSchema, createResponsibilitySchema } from "@chore-tracker/contracts";
import type { AllocationRule, ISODate } from "@chore-tracker/domain";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "../../../../lib/http";

const householdSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "seed") {
      if ((process.env.APP_ENV || "development") === "production") throw new Error("Demo seed is disabled in production");
      return NextResponse.json({ householdId: seedDemo() });
    }
    if (body.action === "household") {
      if (getFirstHousehold()) throw new Error("This installation already has a household");
      const input = householdSchema.parse(body);
      return NextResponse.json(createHousehold(input.name, input.timezone), { status: 201 });
    }
    const household = getFirstHousehold();
    if (!household) throw new Error("Create a household first");
    if (body.action === "member") {
      const input = createMemberSchema.parse(body);
      return NextResponse.json({ id: createMember(household.id, input) }, { status: 201 });
    }
    if (body.action === "chore") {
      const input = createChoreSchema.parse(body);
      return NextResponse.json({ id: createChore(household.id, input) }, { status: 201 });
    }
    if (body.action === "responsibility") {
      const input = createResponsibilitySchema.parse(body);
      const templateId = createResponsibility(household.id, {
          ...input,
          activeFrom: input.activeFrom as ISODate,
          allocation: input.allocation as AllocationRule
      });
      const week = input.applyToPlanId && input.expectedRevision !== undefined
        ? applyResponsibilityToWeek(templateId, input.applyToPlanId, input.expectedRevision)
        : undefined;
      return NextResponse.json({ id: templateId, week }, { status: 201 });
    }
    throw new Error("Unknown setup action");
  } catch (error) {
    return apiError(error);
  }
}
