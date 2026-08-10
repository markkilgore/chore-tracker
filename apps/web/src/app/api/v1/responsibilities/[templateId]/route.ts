import { responsibilityActionSchema } from "@chore-tracker/contracts";
import { deleteResponsibility, endResponsibility, reassignResponsibility } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../../lib/http";

export async function PATCH(request: NextRequest, context: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await context.params;
    const input = responsibilityActionSchema.parse(await request.json());
    if (input.action === "end") {
      endResponsibility(templateId, input.activeThrough as ISODate);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(reassignResponsibility(templateId, input.memberId, input.effectiveFrom as ISODate));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await context.params;
    return NextResponse.json(deleteResponsibility(templateId));
  } catch (error) {
    return apiError(error);
  }
}
