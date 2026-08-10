import { oneOffSchema } from "@chore-tracker/contracts";
import { addOneOff } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../../../lib/http";

export async function POST(request: NextRequest, context: { params: Promise<{ planId: string }> }) {
  try {
    const { planId } = await context.params;
    const input = oneOffSchema.parse(await request.json());
    return NextResponse.json(addOneOff(planId, {
      ...input,
      dueDate: input.dueDate as ISODate,
      memberId: input.memberId ?? null,
      routineId: input.routineId ?? null
    }));
  } catch (error) {
    return apiError(error);
  }
}
