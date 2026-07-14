import { config, personFor, themes, themeIdForBranch } from "./config";
import {
  branchesAheadOfStaging,
  previewMerge,
  stagingAhead,
  liveState as gitLiveState,
  listVersions,
  versionForBranch,
  computeNextVersions,
  themeStatuses,
  type FileConflict,
  type FileRemoval,
  type Version,
} from "./git";
import { qaSignoffsFor, recentAudit, getLiveVersion, type QaSignoff, type AuditEntry } from "./db";
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
  removals: FileRemoval[];
  previewUrl: string | null;
  version: string | null;
  behindLive: boolean;
}

export interface VersionView extends Version {
  when: string;
}

export interface ThemeCard {
  branch: string;
  authorLogin: string;
  authorName: string;
  authorColor: string;
  previewUrl: string | null;
  version: string | null;
  ahead: number; // own work not yet on staging
  behind: number; // staging changes this theme hasn't pulled down
  exists: boolean; // branch present on the remote
  isCurrentUser: boolean;
}

export interface ConsoleState {
  user: { login: string; name: string; color: string };
  repo: { owner: string; repo: string; liveBranch: string; stagingBranch: string };
  store: { publicDomain: string; devEmail: string };
  updates: Update[];
  themes: ThemeCard[];
  staging: {
    sha: string;
    ahead: number;
    commits: { sha: string; subject: string; author: string; iso: string; when: string }[];
    previewUrl: string | null;
    qa: { signedOff: boolean; signoffs: QaSignoff[] };
    publishClean: boolean;
    publishConflicts: FileConflict[];
    publishRemovals: FileRemoval[];
    currentVersion: string | null;
    nextVersions: { current: string; major: string; minor: string; patch: string };
  };
  live: {
    sha: string;
    versions: VersionView[];
    currentVersion: string | null;
    shopify: ThemeInfo | null;
    lastPublish: { version: string; description: string; author: string; iso: string; when: string } | null;
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

  const stagingVersion = await versionForBranch(config.stagingBranch);
  const liveVersionByAncestry = await versionForBranch(config.liveBranch);

  const updates: Update[] = [];
  for (const b of ahead) {
    const preview = await previewMerge(b.branch, config.stagingBranch);
    const person = personForBranch(b.branch, b.authorLogin);
    const themeId = themeIdForBranch(b.branch);
    const version = await versionForBranch(b.branch);
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
      removals: preview.removals,
      previewUrl: themeId ? themePreviewUrl(themeId) : null,
      version,
      behindLive: Boolean(stagingVersion && version !== stagingVersion),
    });
  }

  // Named theme cards: every configured branch except live/staging, shown whether
  // or not it has pending updates — so a theme that's merely behind (clean but
  // stale) still surfaces with a Sync button.
  const themeBranches = Object.keys(themes().branches).filter(
    (b) => b !== config.liveBranch && b !== config.stagingBranch
  );
  const statuses = await themeStatuses(themeBranches);
  const statusByBranch = new Map(statuses.map((s) => [s.branch, s]));
  const themeCards: ThemeCard[] = themeBranches.map((branch) => {
    const st = statusByBranch.get(branch);
    const person = personForBranch(branch, branch);
    const themeId = themeIdForBranch(branch);
    return {
      branch,
      authorLogin: person.login,
      authorName: person.name,
      authorColor: person.color,
      previewUrl: themeId ? themePreviewUrl(themeId) : null,
      version: st?.version ?? null,
      ahead: st?.ahead ?? 0,
      behind: st?.behind ?? 0,
      exists: st?.exists ?? false,
      isCurrentUser: branch.toLowerCase() === currentLogin.toLowerCase(),
    };
  });

  const staging = await stagingAhead();
  const live = await gitLiveState();
  const shopify = await readLiveTheme();

  // Preview publish (staging → live) so the UI knows if it's a one-click merge.
  // Only meaningful when staging is actually ahead of live.
  const publishPreview =
    staging.ahead > 0
      ? await previewMerge(config.stagingBranch, config.liveBranch)
      : { clean: true, conflicts: [] as FileConflict[], removals: [] as FileRemoval[] };

  const signoffs = qaSignoffsFor(staging.sha);
  const cur = personFor(currentLogin);

  const versions = await listVersions();
  const nextVersions = await computeNextVersions();
  // Current live version: the DB pointer wins (survives undo/restore), else ancestry.
  const currentLiveVersion = getLiveVersion() || liveVersionByAncestry || versions[0]?.version || null;
  const latest = versions.find((v) => v.version === currentLiveVersion) || versions[0] || null;
  const lastPublish = latest
    ? { version: latest.version, description: latest.description, author: latest.author, iso: latest.at, when: relativeTime(latest.at) }
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
    themes: themeCards,
    staging: {
      sha: staging.sha,
      ahead: staging.ahead,
      commits: staging.commits.map((c) => ({ ...c, when: relativeTime(c.iso) })),
      previewUrl: stagingPreviewUrl(),
      qa: { signedOff: signoffs.length > 0, signoffs },
      publishClean: publishPreview.clean,
      publishConflicts: publishPreview.conflicts,
      publishRemovals: publishPreview.removals,
      currentVersion: stagingVersion,
      nextVersions,
    },
    live: {
      sha: live.sha,
      versions: versions.map((v) => ({ ...v, when: relativeTime(v.at) })),
      currentVersion: currentLiveVersion,
      shopify,
      lastPublish,
    },
    audit: recentAudit(30),
  };
}
