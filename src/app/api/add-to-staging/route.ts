import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { parsePicks } from "@/lib/picks";
import { config } from "@/lib/config";
import { mergeAndPush, previewMerge } from "@/lib/git";
import { recordAudit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add an update to staging: merge the branch UP into staging (applying the user's
 * per-file picks if it conflicted). Goes through the App token; Shopify follows.
 *
 * The console deliberately does NOT advance the person's branch afterward (no auto
 * re-level) and does NOT touch anyone else's theme (no auto catch-up). Advancing a
 * branch past what its Shopify theme actually holds let a stale Shopify snapshot
 * silently delete other people's work on the next push, so branches now move only
 * when their owner deliberately Syncs. Plain 3-way git at add time already preserves
 * everyone's additions — we rest on that instead of re-implementing it.
 */
export async function POST(req: Request) {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  let body: { branch?: string; picks?: unknown; ackRemovals?: boolean };
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
    // Guard: a clean merge can still DELETE/REVERT work already on staging (stale-branch
    // overwrite). Refuse unless the operator has explicitly acknowledged it.
    const preview = await previewMerge(branch, config.stagingBranch);
    if (preview.removals.length > 0 && body.ackRemovals !== true) {
      return NextResponse.json(
        { error: "This update would remove work already on staging. Confirm to proceed.", needsConfirm: true, removals: preview.removals },
        { status: 409 }
      );
    }

    // merge branch UP into staging (no re-level down, no catch-up of other themes)
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

    return NextResponse.json({
      ok: true,
      stagingSha: up.sha,
      addedToStaging: up.merged || up.alreadyUpToDate,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not add to staging", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
