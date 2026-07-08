import { NextResponse } from "next/server";
import { requireAuthorized, nowISO, authorFor } from "@/lib/guard";
import { config } from "@/lib/config";
import { revertOnBranch, listVersions } from "@/lib/git";
import { recordAudit, getLiveVersion, setLiveVersion } from "@/lib/db";

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
    // Roll the live-version pointer back to the version before the current one.
    let rolledBackTo: string | null = null;
    const versions = await listVersions();
    const cur = getLiveVersion();
    const idx = versions.findIndex((v) => v.version === cur);
    if (idx >= 0 && versions[idx + 1]) rolledBackTo = versions[idx + 1].version;
    else if (idx === -1 && versions[0]) rolledBackTo = versions[0].version;
    if (rolledBackTo) setLiveVersion(rolledBackTo, login, nowISO());

    recordAudit({
      userLogin: login,
      action: "undo-publish",
      target: config.liveBranch,
      detail: `undid last publish${rolledBackTo ? `, live now ${rolledBackTo}` : ""}`,
      resultSha: res.sha,
      at: nowISO(),
    });
    return NextResponse.json({ ok: true, sha: res.sha, changed: res.merged, version: rolledBackTo });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not undo the last publish", detail: (e as Error).message },
      { status: 409 }
    );
  }
}
