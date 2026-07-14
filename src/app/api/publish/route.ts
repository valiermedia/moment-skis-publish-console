import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { parsePicks } from "@/lib/picks";
import { config } from "@/lib/config";
import { publishAsVersion, previewMerge, type VersionType } from "@/lib/git";
import { recordAudit, setLiveVersion } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: VersionType[] = ["major", "minor", "patch"];

/**
 * Publish to live = merge staging INTO live via the App token, stamped with a
 * version (annotated git tag on the published commit). Shopify auto-publishes
 * because the live branch is connected to the published theme. There is NO theme
 * publish API call anywhere — going live is only ever this git merge.
 *
 * Every live change: confirmed in the UI, reversible (git revert), logged here.
 */
export async function POST(req: Request) {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  let body: { type?: string; description?: string; picks?: unknown; ackRemovals?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* staging→live is usually clean; body optional except type */
  }
  const type = (body.type || "").toLowerCase() as VersionType;
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "A version type (major, minor, patch) is required" }, { status: 400 });
  }
  const description = (body.description || "").toString().slice(0, 500).trim();
  const picks = parsePicks(body.picks);

  try {
    // Guard: refuse a publish that would DELETE/REVERT content currently live, unless
    // the operator has explicitly acknowledged the destructive change.
    const preview = await previewMerge(config.stagingBranch, config.liveBranch);
    if (preview.removals.length > 0 && body.ackRemovals !== true) {
      return NextResponse.json(
        { error: "This publish would remove content currently live. Confirm to proceed.", needsConfirm: true, removals: preview.removals },
        { status: 409 }
      );
    }

    const res = await publishAsVersion({
      type,
      description,
      author: authorFor(login),
      picks,
      message: `Publish staging to live (via Publish Console, by ${login})`,
    });

    if (res.alreadyUpToDate) {
      return NextResponse.json({ ok: true, alreadyUpToDate: true });
    }

    setLiveVersion(res.version, login, nowISO());
    recordAudit({
      userLogin: login,
      action: "publish-to-live",
      target: config.liveBranch,
      detail: `${res.version} (${type})${description ? ": " + description : ""}`,
      resultSha: res.liveSha,
      at: nowISO(),
    });

    return NextResponse.json({ ok: true, version: res.version, sha: res.liveSha });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not publish to live", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
