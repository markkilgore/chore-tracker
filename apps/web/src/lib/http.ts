import { NextResponse } from "next/server";

export function apiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = error instanceof Error && error.name === "RevisionConflict" ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}
