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
/**
 * A "clean" (conflict-free) merge can still be destructive: it may delete a file the
 * target currently has, or strip out content the target has (e.g. a stale branch
 * reverting someone else's work). These are surfaced so a human confirms before it ships.
 */
export interface FileRemoval {
  file: string;
  kind: "delete" | "revert"; // whole file removed, or net content loss
  linesRemoved: number;
  lastAuthor: string; // who last changed this file on the target
}
export interface MergePreview {
  clean: boolean;
  conflicts: FileConflict[];
  removals: FileRemoval[];
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

// Throttle network fetches: a single buildConsoleState calls ensureRepo ~4x, and
// browser reloads come in bursts. Fetching (and minting an App token) every time
// made each load take several seconds. We fetch at most once per FETCH_TTL_MS;
// within that window the local origin/* refs are reused. force=true bypasses it
// (used right before/after a write so we act on current refs).
let lastFetchAt = 0;
const FETCH_TTL_MS = 10_000;

/** Force the next ensureRepo() to fetch (used by the manual Refresh button). */
export function forceNextFetch(): void {
  lastFetchAt = 0;
}

/** Ensure the clone exists and origin/* refs are reasonably current. */
async function ensureRepo(force = false): Promise<SimpleGit> {
  const dir = config.clonePath;
  const plain = `https://github.com/${config.owner}/${config.repo}.git`;

  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    // Deterministic raw command: git clone --no-single-branch <url> <dir>
    // (the simple-git .clone()/.fetch() wrappers mis-ordered the url vs refspec).
    const authed = await authedRemoteUrl();
    const g0 = simpleGit({ maxConcurrentProcesses: 1 });
    await g0.raw(["clone", "--no-single-branch", authed, dir]);
    // strip the token out of persisted config immediately
    await git(dir).raw(["remote", "set-url", "origin", plain]);
    lastFetchAt = Date.now();
  }

  const g = git(dir);
  const now = Date.now();
  if (force || now - lastFetchAt > FETCH_TTL_MS) {
    // Mint the token only when we actually fetch (it's a network call too).
    const authed = await authedRemoteUrl();
    await g.raw(["fetch", "--prune", authed, "+refs/heads/*:refs/remotes/origin/*"]);
    lastFetchAt = now;
  }
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

    // enumerate remote branches. Use the FULL refname (not :short) so the
    // symbolic ref refs/remotes/origin/HEAD reduces to "HEAD" (and is filtered),
    // rather than shortening to "origin" and slipping through as a bogus branch.
    const raw = await g.raw(["for-each-ref", "--format=%(refname)", "refs/remotes/origin"]);
    const branches = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^refs\/remotes\/origin\//, ""))
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
 * After a clean `merge --no-commit` in `wt` (HEAD = target), report what the merge
 * would REMOVE from the target: files it deletes, and files whose content it net-reduces
 * (a stale branch reverting existing work). Additions are never flagged. Each removal is
 * attributed to whoever last changed that file on the target, so a human can judge it.
 */
async function computeRemovals(wt: SimpleGit): Promise<FileRemoval[]> {
  const nameStatus = (await wt.raw(["diff", "--cached", "--name-status", "HEAD"])).trim();
  if (!nameStatus) return [];
  const numstat = (await wt.raw(["diff", "--cached", "--numstat", "HEAD"])).trim();
  const nums = new Map<string, { added: number; deleted: number }>();
  for (const line of numstat ? numstat.split("\n") : []) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const file = parts.slice(2).join("\t");
    nums.set(file, { added: Number(parts[0]) || 0, deleted: Number(parts[1]) || 0 });
  }
  const out: FileRemoval[] = [];
  for (const line of nameStatus.split("\n")) {
    const parts = line.split("\t");
    const st = parts[0] || "";
    const file = parts.slice(1).join("\t");
    if (!file) continue;
    const n = nums.get(file) || { added: 0, deleted: 0 };
    let kind: "delete" | "revert" | null = null;
    if (st.startsWith("D")) kind = "delete";
    else if (st.startsWith("M") && n.deleted > n.added) kind = "revert"; // net content loss
    if (!kind) continue;
    let lastAuthor = "";
    try {
      const line = (await wt.raw(["log", "-1", "--format=%an%x1f%s", "HEAD", "--", file])).trim();
      const [an, subj = ""] = line.split("\x1f");
      if (/bot/i.test(an)) {
        // Shopify sync commits ("Update from Shopify for theme moment-theme/<person>")
        // hide the real owner behind shopify[bot] — recover the person from the message.
        const m = subj.match(/theme\s+(\S+)/i);
        const ref = m ? m[1] : "";
        lastAuthor = (ref.includes("/") ? ref.split("/").pop() : ref) || an;
      } else {
        lastAuthor = an;
      }
    } catch {
      lastAuthor = "";
    }
    out.push({ file, kind, linesRemoved: n.deleted, lastAuthor });
  }
  return out;
}

/**
 * Preview merging `source` into `target` (does NOT push). Returns clean flag,
 * per-file conflict data, and any destructive removals a clean merge would make.
 */
export async function previewMerge(source: string, target: string): Promise<MergePreview> {
  return withLock(async () => {
    const g = await ensureRepo();
    const dir = newWorktreeDir();
    const wt = await addWorktree(g, dir, remoteRef(target));
    try {
      // NOTE: simple-git's .raw does NOT reject on a merge-conflict exit code (git
      // prints "CONFLICT" to stdout and exits 1, but simple-git resolves anyway).
      // So never infer "clean" from the absence of a throw — always ask the index
      // which files are unmerged after the attempt.
      await wt.raw(["merge", "--no-commit", "--no-ff", remoteRef(source)]).catch(() => {});
      const status = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
      const files = status ? status.split("\n").map((s) => s.trim()).filter(Boolean) : [];
      if (files.length > 0) {
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
        return { clean: false, conflicts, removals: [] };
      }
      // Clean merge — still check whether it would DELETE or REVERT content the target
      // currently has (the silent-destruction case), so a human can confirm.
      const removals = await computeRemovals(wt);
      return { clean: true, conflicts: [], removals };
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

/** Git commit author. We attribute merge/revert commits to the acting user. */
export interface Author {
  name: string;
  email: string;
}

/** Set the commit identity for a worktree (the machine has no global git identity). */
async function setAuthor(wt: SimpleGit, author: Author): Promise<void> {
  await wt.raw(["config", "user.name", author.name || "Publish Console"]);
  await wt.raw(["config", "user.email", author.email || "publish-console@moment-skis"]);
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
  message: string,
  author: Author,
  // Up-merges into staging/live keep an explicit merge commit (--no-ff). Down-merges
  // (re-level / sync into a person-branch) must fast-forward when possible, otherwise
  // they add a commit the source lacks and the branch reads as perpetually "ahead".
  noFf = true
): Promise<MergeResult> {
  return withLock(() => mergeAndPushCore(source, target, picks, message, author, noFf));
}

// Unlocked core so publishAsVersion() can merge + tag atomically under one lock.
async function mergeAndPushCore(
  source: string,
  target: string,
  picks: Record<string, "ours" | "theirs">,
  message: string,
  author: Author,
  noFf: boolean
): Promise<MergeResult> {
  {
    const g = await ensureRepo(true);
    const dir = newWorktreeDir();
    // Work on an actual branch so the push ref is clean.
    await g.raw(["worktree", "add", "-B", `_deploy_${target}`, dir, remoteRef(target)]);
    const wt = git(dir);
    await setAuthor(wt, author);
    const authed = await authedRemoteUrl();
    try {
      const beforeSha = (await wt.raw(["rev-parse", "HEAD"])).trim();
      const mergeArgs = noFf
        ? ["merge", "--no-ff", "-m", message, remoteRef(source)]
        : ["merge", "--ff", "-m", message, remoteRef(source)];
      // simple-git's .raw does NOT reject on a merge-conflict exit code, so detect
      // conflicts from the index (unmerged files) rather than a thrown error.
      await wt.raw(mergeArgs).catch(() => {});
      const status = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
      const conflicted = status.length > 0;

      if (conflicted) {
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
  }
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
  message: string,
  author: Author
): Promise<MergeResult> {
  return withLock(async () => {
    const g = await ensureRepo(true);
    const dir = newWorktreeDir();
    await g.raw(["worktree", "add", "-B", `_deploy_${target}`, dir, remoteRef(target)]);
    const wt = git(dir);
    await setAuthor(wt, author);
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
          await wt.raw(args).catch(() => {});
          // .raw doesn't reject on a revert conflict — check the index explicitly.
          const u = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
          if (u) throw new Error(`revert hit conflicts in ${u.replace(/\n/g, ", ")}`);
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
            await wt.raw(args).catch(() => {});
            // .raw doesn't reject on a revert conflict — check the index explicitly.
            const u = (await wt.raw(["diff", "--name-only", "--diff-filter=U"])).trim();
            if (u) throw new Error(`revert hit conflicts in ${u.replace(/\n/g, ", ")}`);
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

// ============================ versioning ====================================
// Versions are annotated git tags (v<major>.<minor>.<patch>) on the published
// staging commit. Because the tag sits on the staging commit that gets merged
// everywhere, each branch "is on" the highest tag reachable from it — so a person
// syncing from staging picks the version up automatically. The tag annotation
// carries the type + description; the tagger is the acting user.

export type VersionType = "major" | "minor" | "patch";

export interface Version {
  version: string; // "2.1.0"
  sha: string; // the (staging) commit the tag points to
  type: VersionType | string;
  description: string;
  author: string;
  at: string; // ISO
}

const US = "\x1f"; // field sep
const RS = "\x1e"; // record sep

function parseSemver(tag: string): [number, number, number] | null {
  const m = tag.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function parseAnnotation(contents: string): { type: string; description: string } {
  // format written by publishAsVersion:  "type: <type>\n\n<description>"
  const typeM = contents.match(/^type:\s*(\w+)/m);
  const type = typeM ? typeM[1] : "";
  const idx = contents.indexOf("\n\n");
  const description = idx >= 0 ? contents.slice(idx + 2).trim() : "";
  return { type, description };
}

async function readVersions(g: SimpleGit): Promise<Version[]> {
  const fmt = ["%(refname:short)", "%(*objectname)", "%(objectname)", "%(taggername)", "%(taggerdate:iso-strict)", "%(contents)"].join(US) + RS;
  let raw = "";
  try {
    raw = await g.raw(["for-each-ref", "--sort=-creatordate", `--format=${fmt}`, "refs/tags/v*"]);
  } catch {
    return [];
  }
  const out: Version[] = [];
  for (const rec of raw.split(RS)) {
    const line = rec.replace(/^\n/, "");
    if (!line.trim()) continue;
    const [name, derefSha, objSha, tagger, date, contents = ""] = line.split(US);
    if (!parseSemver(name)) continue;
    const { type, description } = parseAnnotation(contents);
    out.push({
      version: name,
      sha: (derefSha || objSha || "").trim(),
      type,
      description,
      author: tagger || "",
      at: date || "",
    });
  }
  return out;
}

export async function listVersions(): Promise<Version[]> {
  return withLock(async () => {
    const g = await ensureRepo();
    return readVersions(g);
  });
}

/** Current version + the next number for each bump type. */
export async function computeNextVersions(): Promise<{
  current: string;
  major: string;
  minor: string;
  patch: string;
}> {
  return withLock(async () => {
    const g = await ensureRepo();
    const versions = await readVersions(g);
    let base: [number, number, number] = [0, 0, 0];
    for (const v of versions) {
      const s = parseSemver(v.version);
      if (s && cmpSemver(s, base) > 0) base = s;
    }
    const [M, m, p] = base;
    return {
      current: versions.length ? base.join(".") : "",
      major: `${M + 1}.0.0`,
      minor: `${M}.${m + 1}.0`,
      patch: `${M}.${m}.${p + 1}`,
    };
  });
}

/** Highest version tag reachable from a ref. Unlocked — caller holds the lock. */
async function highestMergedTag(g: SimpleGit, ref: string): Promise<string | null> {
  let raw = "";
  try {
    raw = await g.raw(["tag", "--merged", ref, "--list", "v*"]);
  } catch {
    return null;
  }
  let best: [number, number, number] | null = null;
  let bestTag: string | null = null;
  for (const t of raw.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const s = parseSemver(t);
    if (s && (!best || cmpSemver(s, best) > 0)) {
      best = s;
      bestTag = t;
    }
  }
  return bestTag;
}

/** Highest version tag reachable from origin/<branch> (forward-only branches). */
export async function versionForBranch(branch: string): Promise<string | null> {
  return withLock(async () => {
    const g = await ensureRepo();
    return highestMergedTag(g, remoteRef(branch));
  });
}

export interface ThemeStatus {
  branch: string;
  exists: boolean; // does origin/<branch> exist?
  ahead: number; // commits on the branch that staging doesn't have (own unstaged work)
  behind: number; // commits on staging the branch doesn't have (out of date)
  version: string | null; // highest version tag the branch has caught up to
}

/**
 * Sync status of each named theme branch relative to staging. `behind > 0` means
 * staging has moved on and the theme should Sync to catch up before editing.
 * One lock covers all branches (a handful) so a state build stays cheap.
 */
export async function themeStatuses(branches: string[]): Promise<ThemeStatus[]> {
  return withLock(async () => {
    const g = await ensureRepo();
    const staging = remoteRef(config.stagingBranch);
    const out: ThemeStatus[] = [];
    for (const branch of branches) {
      const ref = remoteRef(branch);
      let exists = true;
      try {
        await g.raw(["rev-parse", "--verify", "--quiet", ref]);
      } catch {
        exists = false;
      }
      if (!exists) {
        out.push({ branch, exists: false, ahead: 0, behind: 0, version: null });
        continue;
      }
      const ahead = Number((await g.raw(["rev-list", "--count", `${staging}..${ref}`])).trim());
      const behind = Number((await g.raw(["rev-list", "--count", `${ref}..${staging}`])).trim());
      const version = await highestMergedTag(g, ref);
      out.push({ branch, exists: true, ahead, behind, version });
    }
    return out;
  });
}

export interface PublishVersionResult {
  version: string;
  liveSha: string;
  tagSha: string;
  alreadyUpToDate: boolean;
}

/**
 * Publish staging → live AND stamp a version: merge (up, --no-ff), then create +
 * push an annotated tag on the published staging commit. One lock = atomic.
 */
export async function publishAsVersion(opts: {
  type: VersionType;
  description: string;
  author: Author;
  picks: Record<string, "ours" | "theirs">;
  message: string;
}): Promise<PublishVersionResult> {
  return withLock(async () => {
    const g = await ensureRepo(true);
    const staging = config.stagingBranch;
    const live = config.liveBranch;

    // compute next version from existing tags
    const existing = await readVersions(g);
    let base: [number, number, number] = [0, 0, 0];
    for (const v of existing) {
      const s = parseSemver(v.version);
      if (s && cmpSemver(s, base) > 0) base = s;
    }
    const [M, m, p] = base;
    const next =
      opts.type === "major" ? `${M + 1}.0.0` : opts.type === "minor" ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`;
    const tagName = `v${next}`;

    const stagingSha = (await g.raw(["rev-parse", remoteRef(staging)])).trim();

    // merge staging -> live (unlocked core, we already hold the lock)
    const merge = await mergeAndPushCore(staging, live, opts.picks, opts.message, opts.author, true);
    if (merge.alreadyUpToDate) {
      return { version: "", liveSha: merge.sha, tagSha: stagingSha, alreadyUpToDate: true };
    }

    // annotated tag on the published staging commit, authored by the acting user
    const authed = await authedRemoteUrl();
    const annotation = `type: ${opts.type}\n\n${opts.description || ""}`.trim();
    await g.raw([
      "-c", `user.name=${opts.author.name}`,
      "-c", `user.email=${opts.author.email}`,
      "tag", "-a", "-f", tagName, stagingSha, "-m", annotation,
    ]);
    await g.raw(["push", authed, "-f", `refs/tags/${tagName}`]);

    return { version: tagName, liveSha: merge.sha, tagSha: stagingSha, alreadyUpToDate: false };
  });
}
