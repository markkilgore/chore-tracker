import { getDashboard } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") as ISODate | null;
    return NextResponse.json(getDashboard(date ?? undefined));
  } catch (error) {
    return apiError(error);
  }
}
