import { NextResponse } from "next/server";
import { requireAuthorized } from "@/lib/guard";
import { buildConsoleState } from "@/lib/console-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  try {
    const state = await buildConsoleState(gate.user.login);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to read state", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
