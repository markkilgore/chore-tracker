import { updateChoreSchema } from "@chore-tracker/contracts";
import { updateChore } from "@chore-tracker/database";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../../lib/http";

export async function PATCH(request: NextRequest, context: { params: Promise<{ choreId: string }> }) {
  try {
    const { choreId } = await context.params;
    updateChore(choreId, updateChoreSchema.parse(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
