import { completionSchema } from "@chore-tracker/contracts";
import { completeOccurrence, voidCompletion } from "@chore-tracker/database";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../../../lib/http";

export async function POST(request: NextRequest, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    const { occurrenceId } = await context.params;
    const input = completionSchema.parse(await request.json());
    const completionId = completeOccurrence(
      occurrenceId,
      input.completedByMemberId,
      input.recordedByMemberId ?? null
    );
    return NextResponse.json({ completionId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    const { occurrenceId } = await context.params;
    const memberId = request.nextUrl.searchParams.get("memberId");
    voidCompletion(occurrenceId, memberId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
