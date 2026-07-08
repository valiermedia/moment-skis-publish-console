import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { parsePicks } from "@/lib/picks";
import { config } from "@/lib/config";
import { mergeAndPush } from "@/lib/git";
import { recordAudit } from "@/lib/db";
import { catchUpIdleThemes } from "@/lib/theme-catchup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add an update to staging: (1) merge the branch UP into staging (applying the
 * user's per-file picks if it conflicted), then (2) merge staging back DOWN into
 * the branch to re-level it. Both go through the App token. Shopify follows.
 */
export async function POST(req: Request) {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  let body: { branch?: string; picks?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const branch = (body.branch || "").trim();
  if (!branch || branch === config.stagingBranch || branch === config.liveBranch) {
    return NextResponse.json({ error: "A valid person/feature branch is required" }, { status: 400 });
  }
  const picks = parsePicks(body.picks);

  try {
    // 1) merge branch UP into staging
    const up = await mergeAndPush(
      branch,
      config.stagingBranch,
      picks,
      `Add "${branch}" to staging (via Publish Console, by ${login})`,
      authorFor(login)
    );
    recordAudit({
      userLogin: login,
      action: "add-to-staging",
      target: config.stagingBranch,
      detail: `merged ${branch} up`,
      resultSha: up.sha,
      at: nowISO(),
    });

    // 2) re-level: merge staging back DOWN into the branch (normally a fast-forward)
    let releveled = true;
    let relevelNote: string | null = null;
    try {
      const down = await mergeAndPush(
        config.stagingBranch,
        branch,
        {},
        `Re-level "${branch}" to staging (via Publish Console)`,
        authorFor(login),
        false // fast-forward the person-branch up to staging (no phantom commit)
      );
      recordAudit({
        userLogin: login,
        action: "relevel-branch",
        target: branch,
        detail: `merged staging down`,
        resultSha: down.sha,
        at: nowISO(),
      });
    } catch (e) {
      // Staging IS updated; only the re-level down hit a snag. Surface, don't fail hard.
      releveled = false;
      relevelNote = (e as Error).message;
      recordAudit({
        userLogin: login,
        action: "relevel-branch-failed",
        target: branch,
        detail: relevelNote,
        at: nowISO(),
      });
    }

    // 3) staging just moved — bring every OTHER idle theme (behind, no own work)
    //    up to staging with a safe fast-forward, so nobody has to remember to sync.
    //    Themes with their own commits are left for their owner. Best-effort.
    const caughtUp = (await catchUpIdleThemes(login, [branch]))
      .filter((r) => r.caughtUp)
      .map((r) => r.branch);

    return NextResponse.json({
      ok: true,
      stagingSha: up.sha,
      addedToStaging: up.merged || up.alreadyUpToDate,
      releveled,
      relevelNote,
      caughtUp,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not add to staging", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
