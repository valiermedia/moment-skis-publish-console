import fs from "node:fs";
import path from "node:path";
import simpleGit, { SimpleGit } from "simple-git";
import { config } from "./config";
import { authedRemoteUrl } from "./octokit";

/**
 * All git operations run against a maintained server-side clone at config.clonePath.
 * Conflict detection and resolution use a *throwaway worktree* per operation so the
 * clone's own working tree is never left dirty and concurrent reads stay safe.
 *
 * Writes (merges, reverts) are pushed to GitHub through the App installation token
 * (ephemeral, never persisted to .git/config). Humans never push to staging/live.
 */

export interface DiffLine {
  t: string;
  d?: boolean;
}
export interface FileConflict {
  id: string;
  file: string;
  ours: DiffLine[];
  theirs: DiffLine[];
}
export interface MergePreview {
  clean: boolean;
  conflicts: FileConflict[];
}
export interface BranchAhead {
  branch: string;
  author: string;
  authorLogin: string;
  lastCommitISO: string;
  ahead: number;
  subject: string;
}

const LINE_CAP = 60; // max lines shown per side in a conflict block

// ---- serialize all clone-mutating work (small team; keep it simple + safe) ----
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // keep the chain alive regardless of individual outcome
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function git(dir: string): SimpleGit {
  return simpleGit({ baseDir: dir, maxConcurrentProcesses: 1 });
}

/** Ensure the clone exists and origin/* refs are current. Returns a SimpleGit at the clone. */
async function ensureRepo(): Promise<SimpleGit> {
  const dir = config.clonePath;
  const authed = await authedRemoteUrl();
  const plain = `https://github.com/${config.owner}/${config.repo}.git`;

  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const g = simpleGit({ maxConcurrentProcesses: 1 });
    await g.clone(authed, dir, ["--no-single-branch"]);
    // strip the token out of persisted config immediately
    await git(dir).remote(["set-url", "origin", plain]);
  }

  const g = git(dir);
  await g.fetch(authed, [
    "+refs/heads/*:refs/remotes/origin/*",
    "--prune",
  ]);
  return g;
}

function remoteRef(branch: string): string {
  return `origin/${branch}`;
}

/** List branches that are ahead of staging (candidates to add to staging). */
export async function branchesAheadOfStaging(): Promise<BranchAhead[]> {
  return withLock(async () => {
    const g = await ensureRepo();
    const staging = config.stagingBranch;
    const live = config.liveBranch;

    // enumerate remote branches
    const raw = await g.raw(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]);
    const branches = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^origin\//, ""))
      .filter((b) => b && b !== "HEAD" && b !== staging && b !== live);

    const out: BranchAhead[] = [];
    for (const branch of branches) {
      const ahead = Number(
        (await g.raw(["rev-list", "--count", `${remoteRef(staging)}..${remoteRef(branch)}`])).trim()
      );
      if (ahead <= 0) continue;
      const meta = (
        await g.raw(["log", "-1", "--format=%an%x1f%ae%x1f%aI%x1f%s", remoteRef(branch)])
      ).trim();
      const [author, email, iso, subject] = meta.split("\x1f");
      const authorLogin = email?.includes("@") ? email.split("@")[0] : author;
      out.push({ branch, author, authorLogin, lastCommitISO: iso, ahead, subject });
    }
    // newest first
    out.sort((a, b) => (a.lastCommitISO < b.lastCommitISO ? 1 : -1));
    return out;
  });
}

/** Commits on staging not yet on live. */
export async function stagingAhead(): Promise<{ ahead: number; sha: string; commits: { sha: string; subject: string; author: string; iso: string }[] }> {
  return withLock(async () => {
    const g = await ensureRepo();
    const sha = (await g.raw(["rev-parse", remoteRef(config.stagingBranch)])).trim();
    const ahead = Number(
      (await g.raw(["rev-list", "--count", `${remoteRef(config.liveBranch)}..${remoteRef(config.stagingBranch)}`])).trim()
    );
    const log = (
      await g.raw([
        "log",
        `${remoteRef(config.liveBranch)}..${remoteRef(config.stagingBranch)}`,
        "--format=%H%x1f%s%x1f%an%x1f%aI",
      ])
    ).trim();
    const commits = log
      ? log.split("\n").map((l) => {
          const [sha, subject, author, iso] = l.split("\x1f");
          return { sha, subject, author, iso };
        })
      : [];
    return { ahead, sha, commits };
  });
}

/** Live head sha + recent publish history (merges into live). */
export async function liveState(): Promise<{ sha: string; recent: { sha: string; subject: string; author: string; iso: string }[] }> {
  return withLock(async () => {
    const g = await ensureRepo();
    const sha = (await g.raw(["rev-parse", remoteRef(config.liveBranch)])).trim();
    const log = (
      await g.raw(["log", remoteRef(config.liveBranch), "-n", "15", "--format=%H%x1f%s%x1f%an%x1f%aI"])
    ).trim();
    const recent = log
      ? log.split("\n").map((l) => {
          const [sha, subject, author, iso] = l.split("\x1f");
          return { sha, subject, author, iso };
        })
      : [];
    return { sha, recent };
  });
}

// ---- worktree helpers -------------------------------------------------------

function newWorktreeDir(): string {
  const id = `${Date.now()}-${process.pid}-${Math.floor(Math.random() * 1e6)}`;
  return path.join(config.clonePath, "..", "worktrees", id);
}

async function addWorktree(g: SimpleGit, dir: string, startRef: string): Promise<SimpleGit> {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  // detached worktree at the given ref; we do merges here then push explicit refs.
  await g.raw(["worktree", "add", "--detach", dir, startRef]);
  return git(dir);
}

async function removeWorktree(g: SimpleGit, dir: string): Promise<void> {
  try {
    await g.raw(["worktree", "remove", "--force", dir]);
  } catch {
    // fall back to manual cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      await g.raw(["worktree", "prune"]);
    } catch {
      /* ignore */
    }
  }
}

/** Parse a conflicted file's markers into ours/theirs display columns. */
function parseConflictFile(content: string): { ours: DiffLine[]; theirs: DiffLine[] } {
  const lines = content.split("\n");
  const oursRaw: string[] = [];
  const theirsRaw: string[] = [];
  let mode: "none" | "ours" | "theirs" = "none";
  for (const ln of lines) {
    if (ln.startsWith("<<<<<<<")) {
      mode = "ours";
      continue;
    }
    if (ln.startsWith("|||||||")) {
      // base section of a diff3 conflict — skip
      mode = "none";
      continue;
    }
    if (ln.startsWith("=======")) {
      mode = "theirs";
      continue;
    }
    if (ln.startsWith(">>>>>>>")) {
      mode = "none";
      continue;
    }
    if (mode === "ours") oursRaw.push(ln);
    else if (mode === "theirs") theirsRaw.push(ln);
    // lines outside conflict regions are identical on both sides; we focus the
    // resolver on the conflicting regions only (matches the mockup's small diffs).
  }
  const oursSet = new Set(oursRaw);
  const theirsSet = new Set(theirsRaw);
  const cap = (arr: string[]) => (arr.length > LINE_CAP ? [...arr.slice(0, LINE_CAP), "… (truncated)"] : arr);
  const ours: DiffLine[] = cap(oursRaw).map((t) => ({ t, d: !theirsSet.has(t) }));
  const theirs: DiffLine[] = cap(theirsRaw).map((t) => ({ t, d: !oursSet.has(t) }));
  return { ours, theirs };
}

/**
 * Preview merging `source` into `target` (does NOT push). Returns clean flag and,
 * on conflict, the per-file two-column data the UI renders.
 */
export async function previewMerge(source: string, target: string): Promise<MergePreview> {
  return withLock(async () => {
    const g = await ensureRepo();
    const dir = newWorktreeDir();
    const wt = await addWorktree(g, dir, remoteRef(target));
    try {
      try {
        await wt.raw(["merge", "--no-commit", "--no-ff", remoteRef(source)]);
        // no throw => clean (either merged or already up to date)
        return { clean: true, conflicts: [] };
      } catch {
        // conflicts (or nothing to merge). Inspect.
        const status = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
        const files = status ? status.split("\n").map((s) => s.trim()).filter(Boolean) : [];
        const conflicts: FileConflict[] = files.map((file, i) => {
          const abs = path.join(dir, file);
          let content = "";
          try {
            content = fs.readFileSync(abs, "utf8");
          } catch {
            content = "";
          }
          const { ours, theirs } = parseConflictFile(content);
          return { id: `c${i + 1}`, file, ours, theirs };
        });
        return { clean: files.length === 0, conflicts };
      }
    } finally {
      try {
        await wt.raw(["merge", "--abort"]);
      } catch {
        /* ignore */
      }
      await removeWorktree(g, dir);
    }
  });
}

export interface MergeResult {
  merged: boolean;
  fastForward: boolean;
  sha: string;
  alreadyUpToDate: boolean;
}

/**
 * Merge `source` into `target` and push `target`. If the merge conflicts,
 * `picks` (file → "ours" | "theirs") resolves each conflicted file whole. Any
 * conflicted file without a pick aborts the whole operation (we never guess).
 *
 * "ours" = target's current content, "theirs" = incoming source.
 */
export async function mergeAndPush(
  source: string,
  target: string,
  picks: Record<string, "ours" | "theirs">,
  message: string
): Promise<MergeResult> {
  return withLock(async () => {
    const g = await ensureRepo();
    const dir = newWorktreeDir();
    // Work on an actual branch so the push ref is clean.
    await g.raw(["worktree", "add", "-B", `_deploy_${target}`, dir, remoteRef(target)]);
    const wt = git(dir);
    const authed = await authedRemoteUrl();
    try {
      const beforeSha = (await wt.raw(["rev-parse", "HEAD"])).trim();
      let conflicted = false;
      try {
        await wt.raw(["merge", "--no-ff", "-m", message, remoteRef(source)]);
      } catch {
        conflicted = true;
      }

      if (conflicted) {
        const status = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
        const files = status ? status.split("\n").map((s) => s.trim()).filter(Boolean) : [];
        for (const file of files) {
          const side = picks[file];
          if (side !== "ours" && side !== "theirs") {
            await wt.raw(["merge", "--abort"]);
            throw new Error(`Unresolved conflict in ${file}: no version chosen. Aborted; nothing was changed.`);
          }
          await wt.raw(["checkout", `--${side}`, "--", file]);
          await wt.raw(["add", "--", file]);
        }
        // any still-unmerged? bail.
        const remain = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
        if (remain) {
          await wt.raw(["merge", "--abort"]);
          throw new Error(`Could not fully resolve conflicts (${remain.replace(/\n/g, ", ")}). Aborted.`);
        }
        await wt.raw(["commit", "--no-edit", "-m", message]);
      }

      const afterSha = (await wt.raw(["rev-parse", "HEAD"])).trim();
      const alreadyUpToDate = afterSha === beforeSha;
      if (!alreadyUpToDate) {
        await wt.raw(["push", authed, `HEAD:refs/heads/${target}`]);
        // update our local mirror of the remote ref
        await g.raw(["fetch", authed, `+refs/heads/${target}:refs/remotes/origin/${target}`]);
      }
      return { merged: !alreadyUpToDate, fastForward: false, sha: afterSha, alreadyUpToDate };
    } finally {
      await removeWorktree(g, dir);
      try {
        await g.branch(["-D", `_deploy_${target}`]);
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * Revert one or more commits on `target` (used for Undo last publish / Restore).
 * `mode`:
 *   - "undo-last": revert the single most recent merge/commit on target
 *   - "to-sha": revert everything on target back down to (but not including) `sha`
 * Pushes target. Reversible by definition (it's a forward commit).
 */
export async function revertOnBranch(
  target: string,
  opts: { mode: "undo-last" } | { mode: "revert-sha"; sha: string },
  message: string
): Promise<MergeResult> {
  return withLock(async () => {
    const g = await ensureRepo();
    const dir = newWorktreeDir();
    await g.raw(["worktree", "add", "-B", `_deploy_${target}`, dir, remoteRef(target)]);
    const wt = git(dir);
    const authed = await authedRemoteUrl();
    try {
      const beforeSha = (await wt.raw(["rev-parse", "HEAD"])).trim();
      try {
        if (opts.mode === "undo-last") {
          // -m 1 handles merge commits (revert against first parent = mainline).
          const head = beforeSha;
          const isMerge = (await wt.raw(["rev-list", "--parents", "-n", "1", head])).trim().split(/\s+/).length > 2;
          const args = ["revert", "--no-edit"];
          if (isMerge) args.push("-m", "1");
          args.push(head);
          await wt.raw(args);
          // give the undo commit a clear message
          await wt.raw(["commit", "--amend", "-m", message]);
        } else {
          // revert each commit from HEAD down to (exclusive) target sha, newest first.
          const list = (await wt.raw(["rev-list", `${opts.sha}..HEAD`])).trim();
          const shas = list ? list.split("\n").map((s) => s.trim()).filter(Boolean) : [];
          if (shas.length === 0) {
            // nothing to revert — live is already at that version
            return { merged: false, fastForward: false, sha: beforeSha, alreadyUpToDate: true };
          }
          for (const sha of shas) {
            const isMerge = (await wt.raw(["rev-list", "--parents", "-n", "1", sha])).trim().split(/\s+/).length > 2;
            const args = ["revert", "--no-edit", "--no-commit"];
            if (isMerge) args.push("-m", "1");
            args.push(sha);
            await wt.raw(args);
          }
          await wt.raw(["commit", "--no-edit", "-m", message]);
        }
      } catch (e) {
        // A revert can conflict (e.g. reverting an old change later code depends on).
        // Abort so nothing partial is committed or pushed, and surface it.
        try {
          await wt.raw(["revert", "--abort"]);
        } catch {
          /* ignore */
        }
        throw new Error(
          `This version can't be automatically restored — a later change depends on it. Nothing was changed. (${(e as Error).message})`
        );
      }
      const afterSha = (await wt.raw(["rev-parse", "HEAD"])).trim();
      const changed = afterSha !== beforeSha;
      if (changed) {
        await wt.raw(["push", authed, `HEAD:refs/heads/${target}`]);
        await g.raw(["fetch", authed, `+refs/heads/${target}:refs/remotes/origin/${target}`]);
      }
      return { merged: changed, fastForward: false, sha: afterSha, alreadyUpToDate: !changed };
    } finally {
      await removeWorktree(g, dir);
      try {
        await g.branch(["-D", `_deploy_${target}`]);
      } catch {
        /* ignore */
      }
    }
  });
}
