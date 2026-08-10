import { getSqlite } from "@chore-tracker/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSqlite();
    const check = db.pragma("quick_check") as Array<{ quick_check: string }>;
    if (check[0]?.quick_check !== "ok") throw new Error("Database integrity check failed");
    return NextResponse.json({ status: "ready", database: "ok" });
  } catch (error) {
    return NextResponse.json({ status: "not-ready", error: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
