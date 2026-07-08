import { themes, config } from "./config";
import { themeStatuses, mergeAndPush } from "./git";
import { recordAudit } from "./db";
import { authorFor, nowISO } from "./guard";

export interface CatchUpResult {
  branch: string;
  caughtUp: boolean;
  note?: string;
}

/**
 * Fast-forward every IDLE theme (behind staging, with ZERO commits of its own) up
 * to staging.
 *
 * "Idle" is the whole safety story: because such a branch has no work staging
 * lacks, catching it up is a pure fast-forward — never a merge, never a conflict,
 * so it cannot alter or discard anyone's in-flight work. It only moves a branch
 * pointer on GitHub forward to a commit it was always going to reach.
 *
 * Themes that DO have their own commits (ahead > 0) are deliberately left alone —
 * moving those would require a real merge, which stays the owner's call (the Sync
 * button + conflict resolver). Nobody is ever locked out: a human can still take a
 * behind/diverged theme all the way to staging and live from the console.
 *
 * Best-effort: a failure on one theme is logged and skipped, never thrown, so the
 * caller's primary action (add-to-staging / publish) still succeeds. `exclude`
 * skips branches already handled this request (e.g. the one just re-leveled).
 */
export async function catchUpIdleThemes(
  actorLogin: string,
  exclude: string[] = []
): Promise<CatchUpResult[]> {
  const skip = new Set(
    [config.liveBranch, config.stagingBranch, ...exclude].map((b) => b.toLowerCase())
  );
  const branches = Object.keys(themes().branches).filter((b) => !skip.has(b.toLowerCase()));
  if (branches.length === 0) return [];

  const statuses = await themeStatuses(branches);
  const results: CatchUpResult[] = [];
  for (const st of statuses) {
    // Only idle-but-behind themes: staging is ahead AND the branch has no own work.
    if (!st.exists || st.behind === 0 || st.ahead > 0) continue;
    try {
      const res = await mergeAndPush(
        config.stagingBranch,
        st.branch,
        {},
        `Catch up "${st.branch}" to staging (via Publish Console)`,
        authorFor(actorLogin),
        false // fast-forward only — an idle branch never needs a merge commit
      );
      recordAudit({
        userLogin: actorLogin,
        action: "catchup-theme",
        target: st.branch,
        detail: `fast-forwarded ${st.behind} commit(s) from staging`,
        resultSha: res.sha,
        at: nowISO(),
      });
      results.push({ branch: st.branch, caughtUp: !res.alreadyUpToDate });
    } catch (e) {
      recordAudit({
        userLogin: actorLogin,
        action: "catchup-theme-failed",
        target: st.branch,
        detail: (e as Error).message,
        at: nowISO(),
      });
      results.push({ branch: st.branch, caughtUp: false, note: (e as Error).message });
    }
  }
  return results;
}
