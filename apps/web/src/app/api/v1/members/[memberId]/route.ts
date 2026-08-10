import { updateMemberSchema } from "@chore-tracker/contracts";
import { removeMember, updateMember } from "@chore-tracker/database";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../../lib/http";

export async function PATCH(request: NextRequest, context: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await context.params;
    updateMember(memberId, updateMemberSchema.parse(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await context.params;
    removeMember(memberId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
