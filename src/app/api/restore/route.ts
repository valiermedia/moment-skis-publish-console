import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { config } from "@/lib/config";
import { revertOnBranch } from "@/lib/git";
import { recordAudit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restore this version = git revert on live back down to the chosen commit's tree,
 * via the App token. Reversible. Confirmed in the UI, logged here.
 */
export async function POST(req: Request) {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  let body: { sha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sha = (body.sha || "").trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    return NextResponse.json({ error: "A valid commit sha is required" }, { status: 400 });
  }

  try {
    const res = await revertOnBranch(
      config.liveBranch,
      { mode: "revert-sha", sha },
      `Restore live to ${sha.slice(0, 7)} (via Publish Console, by ${login})`,
      authorFor(login)
    );
    recordAudit({
      userLogin: login,
      action: "restore",
      target: config.liveBranch,
      detail: `reverted live down to ${sha.slice(0, 7)}`,
      resultSha: res.sha,
      at: nowISO(),
    });
    return NextResponse.json({ ok: true, sha: res.sha, changed: res.merged });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not restore that version", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
