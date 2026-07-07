import { NextResponse } from "next/server";
import { requireAuthorized, nowISO } from "@/lib/guard";
import { parsePicks } from "@/lib/picks";
import { config } from "@/lib/config";
import { mergeAndPush } from "@/lib/git";
import { recordAudit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sync a branch from staging: merge staging DOWN into the branch so a stale theme
 * catches up before editing. Same resolver on conflict.
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
    return NextResponse.json({ error: "A valid branch is required" }, { status: 400 });
  }
  const picks = parsePicks(body.picks);

  try {
    const res = await mergeAndPush(
      config.stagingBranch,
      branch,
      picks,
      `Sync "${branch}" from staging (via Publish Console, by ${login})`
    );
    recordAudit({
      userLogin: login,
      action: "sync-from-staging",
      target: branch,
      detail: `merged staging down`,
      resultSha: res.sha,
      at: nowISO(),
    });
    return NextResponse.json({ ok: true, sha: res.sha, alreadyUpToDate: res.alreadyUpToDate });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not sync from staging", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
