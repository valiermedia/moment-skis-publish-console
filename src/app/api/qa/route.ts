import { NextResponse } from "next/server";
import { requireAuthorized, nowISO } from "@/lib/guard";
import { stagingAhead } from "@/lib/git";
import { recordQaSignoff, recordAudit } from "@/lib/db";
import { stagingPreviewUrl } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QA Review sign-off. Records that the current user signed off the current staging
 * SHA. Kept deliberately simple — the preview URL for the staging theme is returned
 * so the client can open it.
 */
export async function POST() {
  const gate = await requireAuthorized();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  try {
    const { sha } = await stagingAhead();
    const at = nowISO();
    recordQaSignoff(sha, login, at);
    recordAudit({
      userLogin: login,
      action: "qa-signoff",
      target: "staging",
      detail: `signed off staging ${sha.slice(0, 7)}`,
      resultSha: sha,
      at,
    });
    return NextResponse.json({ ok: true, stagingSha: sha, previewUrl: stagingPreviewUrl(), signedAt: at });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not record QA sign-off", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
