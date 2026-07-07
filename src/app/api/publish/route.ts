import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { parsePicks } from "@/lib/picks";
import { config } from "@/lib/config";
import { mergeAndPush } from "@/lib/git";
import { recordAudit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publish to live = merge staging INTO live via the App token. Shopify auto-publishes
 * because the live branch is connected to the published theme. There is NO theme
 * publish API call anywhere — going live is only ever this git merge.
 *
 * Every live change: confirmed in the UI, reversible (git revert), and logged here.
 */
export async function POST(req: Request) {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  let body: { picks?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional — staging→live is usually clean */
  }
  const picks = parsePicks(body.picks);

  try {
    const res = await mergeAndPush(
      config.stagingBranch,
      config.liveBranch,
      picks,
      `Publish staging to live (via Publish Console, by ${login})`,
      authorFor(login)
    );
    recordAudit({
      userLogin: login,
      action: "publish-to-live",
      target: config.liveBranch,
      detail: `merged ${config.stagingBranch} into ${config.liveBranch}`,
      resultSha: res.sha,
      at: nowISO(),
    });
    return NextResponse.json({ ok: true, sha: res.sha, alreadyUpToDate: res.alreadyUpToDate });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not publish to live", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
