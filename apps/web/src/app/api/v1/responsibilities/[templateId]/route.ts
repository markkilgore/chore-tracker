import { endResponsibility } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isoDateSchema } from "@chore-tracker/contracts";
import { apiError } from "../../../../../lib/http";

const endSchema = z.object({ action: z.literal("end"), activeThrough: isoDateSchema });

export async function PATCH(request: NextRequest, context: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await context.params;
    const input = endSchema.parse(await request.json());
    endResponsibility(templateId, input.activeThrough as ISODate);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
