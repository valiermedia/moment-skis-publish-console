import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { config } from "@/lib/config";
import { revertOnBranch } from "@/lib/git";
import { recordAudit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Undo last publish = git revert of the most recent commit on live via the App
 * token. Reversible (you can publish again). Confirmed in the UI, logged here.
 */
export async function POST() {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  try {
    const res = await revertOnBranch(
      config.liveBranch,
      { mode: "undo-last" },
      `Undo last publish (via Publish Console, by ${login})`,
      authorFor(login)
    );
    recordAudit({
      userLogin: login,
      action: "undo-publish",
      target: config.liveBranch,
      detail: "reverted most recent commit on live",
      resultSha: res.sha,
      at: nowISO(),
    });
    return NextResponse.json({ ok: true, sha: res.sha, changed: res.merged });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not undo the last publish", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
