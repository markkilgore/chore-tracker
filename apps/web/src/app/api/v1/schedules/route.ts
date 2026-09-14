import { scheduleRequestSchema } from "@chore-tracker/contracts";
import { getFirstHousehold, reviewScheduleChange, commitScheduleChange } from "@chore-tracker/database";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  try {
    const input = scheduleRequestSchema.parse(await request.json());
    const household = getFirstHousehold();
    if (!household) throw new Error("Create your household first");
    return NextResponse.json(input.preview
      ? reviewScheduleChange(household.id, input.change)
      : commitScheduleChange(household.id, input.change, input.token, input.requestId));
  } catch (error) { return apiError(error); }
}
