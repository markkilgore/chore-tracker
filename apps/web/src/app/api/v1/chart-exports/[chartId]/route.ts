import { getChartExport } from "@chore-tracker/database";
import { NextResponse } from "next/server";
import { apiError } from "../../../../../lib/http";

export async function GET(_request: Request, context: { params: Promise<{ chartId: string }> }) {
  try {
    const { chartId } = await context.params;
    return NextResponse.json(getChartExport(chartId));
  } catch (error) {
    return apiError(error);
  }
}
