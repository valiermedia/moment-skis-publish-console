import { config, personFor, themes, themeIdForBranch } from "./config";
import {
  branchesAheadOfStaging,
  previewMerge,
  stagingAhead,
  liveState as gitLiveState,
  type FileConflict,
} from "./git";
import { qaSignoffsFor, recentAudit, type QaSignoff, type AuditEntry } from "./db";
import { readLiveTheme, stagingPreviewUrl, themePreviewUrl, type ThemeInfo } from "./shopify";

export interface Update {
  branch: string;
  authorLogin: string;
  authorName: string;
  authorColor: string;
  title: string;
  when: string;
  iso: string;
  ahead: number;
  clean: boolean;
  conflicts: FileConflict[];
  previewUrl: string | null;
}

export interface ConsoleState {
  user: { login: string; name: string; color: string };
  repo: { owner: string; repo: string; liveBranch: string; stagingBranch: string };
  store: { publicDomain: string; devEmail: string };
  updates: Update[];
  staging: {
    sha: string;
    ahead: number;
    commits: { sha: string; subject: string; author: string; iso: string; when: string }[];
    previewUrl: string | null;
    qa: { signedOff: boolean; signoffs: QaSignoff[] };
    publishClean: boolean;
    publishConflicts: FileConflict[];
  };
  live: {
    sha: string;
    recent: { sha: string; subject: string; author: string; iso: string; when: string }[];
    shopify: ThemeInfo | null;
    lastPublish: { subject: string; author: string; iso: string; when: string } | null;
  };
  audit: AuditEntry[];
}

export function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/** Resolve which person "owns" a branch: standing person-branch name wins, else commit author login. */
function personForBranch(branch: string, authorLogin: string) {
  const people = themes().people;
  const key = people[branch.toLowerCase()] ? branch.toLowerCase() : authorLogin.toLowerCase();
  return { login: key, ...personFor(key) };
}

export async function buildConsoleState(currentLogin: string): Promise<ConsoleState> {
  const ahead = await branchesAheadOfStaging();

  const updates: Update[] = [];
  for (const b of ahead) {
    const preview = await previewMerge(b.branch, config.stagingBranch);
    const person = personForBranch(b.branch, b.authorLogin);
    const themeId = themeIdForBranch(b.branch);
    updates.push({
      branch: b.branch,
      authorLogin: person.login,
      authorName: person.name,
      authorColor: person.color,
      title: b.subject || b.branch,
      when: relativeTime(b.lastCommitISO),
      iso: b.lastCommitISO,
      ahead: b.ahead,
      clean: preview.clean,
      conflicts: preview.conflicts,
      previewUrl: themeId ? themePreviewUrl(themeId) : null,
    });
  }

  const staging = await stagingAhead();
  const live = await gitLiveState();
  const shopify = await readLiveTheme();

  // Preview publish (staging → live) so the UI knows if it's a one-click merge.
  // Only meaningful when staging is actually ahead of live.
  const publishPreview =
    staging.ahead > 0
      ? await previewMerge(config.stagingBranch, config.liveBranch)
      : { clean: true, conflicts: [] as FileConflict[] };

  const signoffs = qaSignoffsFor(staging.sha);

  const cur = personFor(currentLogin);

  const lastPublish = live.recent[0]
    ? {
        subject: live.recent[0].subject,
        author: live.recent[0].author,
        iso: live.recent[0].iso,
        when: relativeTime(live.recent[0].iso),
      }
    : null;

  return {
    user: { login: currentLogin, name: cur.name, color: cur.color },
    repo: {
      owner: config.owner,
      repo: config.repo,
      liveBranch: config.liveBranch,
      stagingBranch: config.stagingBranch,
    },
    store: { publicDomain: config.storePublicDomain, devEmail: config.devEmail },
    updates,
    staging: {
      sha: staging.sha,
      ahead: staging.ahead,
      commits: staging.commits.map((c) => ({ ...c, when: relativeTime(c.iso) })),
      previewUrl: stagingPreviewUrl(),
      qa: { signedOff: signoffs.length > 0, signoffs },
      publishClean: publishPreview.clean,
      publishConflicts: publishPreview.conflicts,
    },
    live: {
      sha: live.sha,
      recent: live.recent.map((c) => ({ ...c, when: relativeTime(c.iso) })),
      shopify,
      lastPublish,
    },
    audit: recentAudit(30),
  };
}
