import { NextResponse } from "next/server";
import { requireAuthorized } from "@/lib/guard";
import { buildConsoleState } from "@/lib/console-state";
import { forceNextFetch } from "@/lib/git";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  try {
    // Manual Refresh passes ?force=1 to pull fresh refs from GitHub now.
    if (new URL(req.url).searchParams.get("force") === "1") forceNextFetch();
    const state = await buildConsoleState(gate.user.login);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to read state", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
