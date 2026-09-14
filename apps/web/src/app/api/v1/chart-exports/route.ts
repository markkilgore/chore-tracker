import { chartExportSchema } from "@chore-tracker/contracts";
import { createChartExport, getWeekSnapshot, listMembers, withImmediateTransaction, getSqlite } from "@chore-tracker/database";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.family === true) {
      const { weeklyPlanId } = z.object({ weeklyPlanId: z.string().uuid() }).parse(body);
      const ids = withImmediateTransaction(getSqlite(), () => {
        const week = getWeekSnapshot(weeklyPlanId);
        return listMembers(week.householdId).map((member) => createChartExport(weeklyPlanId, member.id));
      });
      return NextResponse.json({ previewUrl: `/print-family?charts=${ids.join(",")}` }, { status: 201 });
    }
    const input = chartExportSchema.parse(body);
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
