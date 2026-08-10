import { occurrenceActionSchema } from "@chore-tracker/contracts";
import { updateOccurrence } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../../lib/http";

export async function PATCH(request: NextRequest, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    const { occurrenceId } = await context.params;
    const parsed = occurrenceActionSchema.parse(await request.json());
    const input = parsed.action === "move"
      ? { ...parsed, dueDate: parsed.dueDate as ISODate }
      : parsed.action === "reassign"
        ? { ...parsed, memberId: parsed.memberId ?? null }
        : parsed;
    return NextResponse.json(updateOccurrence(occurrenceId, input));
  } catch (error) {
    return apiError(error);
  }
}
