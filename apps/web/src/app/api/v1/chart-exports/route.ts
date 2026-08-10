import { chartExportSchema } from "@chore-tracker/contracts";
import { createChartExport } from "@chore-tracker/database";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  try {
    const input = chartExportSchema.parse(await request.json());
    const chartId = createChartExport(input.weeklyPlanId, input.memberId, input.themeKey);
    return NextResponse.json({
      chartId,
      previewUrl: `/print/${chartId}`,
      pdfUrl: `/api/v1/chart-exports/${chartId}/pdf`
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
