"use client";

import React, { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  Check,
  RotateCcw,
  X,
  Eye,
  Globe,
  Mail,
  AlertTriangle,
  FileCode,
  LogOut,
  RefreshCw,
  ArrowUpToLine,
  ArrowDownToLine,
  Settings,
  Boxes,
} from "lucide-react";
import { C, MONO } from "@/lib/ui";

// ---- shapes mirrored from src/lib/console-state.ts --------------------------
interface DiffLine {
  t: string;
  d?: boolean;
}
interface FileConflict {
  id: string;
  file: string;
  ours: DiffLine[];
  theirs: DiffLine[];
}
interface FileRemoval {
  file: string;
  kind: "delete" | "revert";
  linesRemoved: number;
  lastAuthor: string;
}
interface Update {
  branch: string;
  authorLogin: string;
  authorName: string;
  authorColor: string;
  title: string;
  when: string;
  ahead: number;
  clean: boolean;
  conflicts: FileConflict[];
  removals: FileRemoval[];
  previewUrl: string | null;
  version: string | null;
  behindLive: boolean;
}
interface Commit {
  sha: string;
  subject: string;
  author: string;
  iso: string;
  when: string;
}
interface VersionView {
  version: string;
  sha: string;
  type: string;
  description: string;
  author: string;
  at: string;
  when: string;
}
interface ThemeCard {
  branch: string;
  authorLogin: string;
  authorName: string;
  authorColor: string;
  previewUrl: string | null;
  version: string | null;
  ahead: number;
  behind: number;
  exists: boolean;
  isCurrentUser: boolean;
}
interface State {
  user: { login: string; name: string; color: string };
  repo: { owner: string; repo: string; liveBranch: string; stagingBranch: string };
  store: { publicDomain: string; devEmail: string };
  updates: Update[];
  themes: ThemeCard[];
  staging: {
    sha: string;
    ahead: number;
    commits: Commit[];
    previewUrl: string | null;
    qa: { signedOff: boolean; signoffs: { user_login: string; signed_at: string }[] };
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
    shopify: { name: string; role: string; updated_at: string; previewUrl: string | null } | null;
    lastPublish: { version: string; description: string; author: string; iso: string; when: string } | null;
  };
}

type Picks = Record<string, Record<string, "ours" | "theirs">>;

function Avatar({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-medium"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      {(name || "?")[0].toUpperCase()}
    </span>
  );
}

type BtnKind = "publish" | "ghost" | "link" | "restore" | "danger" | "accent";
function Btn({
  kind,
  onClick,
  disabled,
  href,
  children,
}: {
  kind: BtnKind;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  children: React.ReactNode;
}) {
  const styles: Record<BtnKind, React.CSSProperties> = {
    publish: { background: C.okFg, color: "#fff", border: "none" },
    accent: { background: C.accent, color: "#fff", border: "none" },
    ghost: { background: "transparent", color: C.muted, border: `1px solid ${C.line}` },
    link: { background: "transparent", color: C.accent, border: `1px solid ${C.line}` },
    restore: { background: "transparent", color: C.restore, border: "1px solid #E7CFC8" },
    danger: { background: C.restore, color: "#fff", border: "none" },
  };
  const common: React.CSSProperties = {
    ...styles[kind],
    borderRadius: 9,
    padding: "9px 15px",
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  };
  const hover = (e: React.MouseEvent<HTMLElement>, on: boolean) =>
    !disabled && (e.currentTarget.style.filter = on ? "brightness(0.96)" : "none");
  if (href)
    return (
      <a
        href={href}
        style={common}
        onMouseEnter={(e) => hover(e, true)}
        onMouseLeave={(e) => hover(e, false)}
      >
        {children}
      </a>
    );
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={common}
      onMouseEnter={(e) => hover(e, true)}
      onMouseLeave={(e) => hover(e, false)}
    >
      {children}
    </button>
  );
}

function Badge({ ok, okText = "Ready", warnText = "Needs review" }: { ok: boolean; okText?: string; warnText?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-medium"
      style={{
        fontSize: 12.5,
        padding: "5px 11px",
        borderRadius: 999,
        background: ok ? C.okBg : C.warnBg,
        color: ok ? C.okFg : C.warnFg,
        whiteSpace: "nowrap",
      }}
    >
      {ok ? <Check size={14} /> : <AlertTriangle size={14} />}
      {ok ? okText : warnText}
    </span>
  );
}

function VersionTag({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    major: { label: "Major", bg: "#EAE2F4", fg: "#6A4FA0" },
    minor: { label: "Minor", bg: C.accentTint, fg: C.accent },
    patch: { label: "Patch", bg: "#EDECE6", fg: "#8A7A3C" },
  };
  const m = map[type] || { label: type || "—", bg: C.bg, fg: C.muted };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, background: m.bg, color: m.fg, borderRadius: 999, padding: "2px 9px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {m.label}
    </span>
  );
}

function DiffColumn({
  label,
  tone,
  lines,
  picked,
  onPick,
}: {
  label: string;
  tone: "add" | "del";
  lines: DiffLine[];
  picked: boolean;
  onPick: () => void;
}) {
  const isAdd = tone === "add";
  return (
    <div
      style={{
        flex: "1 1 262px",
        minWidth: 0,
        borderRadius: 10,
        overflow: "hidden",
        background: C.paper,
        border: picked ? `2px solid ${C.accent}` : `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          padding: "7px 12px",
          borderBottom: `1px solid ${C.line}`,
          fontSize: 11.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          color: isAdd ? C.accent : C.faint,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65, background: C.codeBg, overflowX: "auto" }}>
        {lines.map((ln, i) => (
          <div key={i} className="flex" style={{ background: ln.d ? (isAdd ? C.addBg : C.delBg) : "transparent" }}>
            <span
              style={{
                width: 20,
                textAlign: "center",
                flexShrink: 0,
                userSelect: "none",
                color: ln.d ? (isAdd ? C.addMark : C.delMark) : C.faint,
              }}
            >
              {ln.d ? (isAdd ? "+" : "-") : ""}
            </span>
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", paddingRight: 10, color: C.ink }}>
              {ln.t}
            </span>
          </div>
        ))}
      </div>
      <div style={{ padding: 9, borderTop: `1px solid ${C.line}` }}>
        <button
          onClick={onPick}
          className="inline-flex items-center justify-center gap-2 font-medium"
          style={{
            width: "100%",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13.5,
            cursor: "pointer",
            background: picked ? C.accent : "transparent",
            color: picked ? "#fff" : C.accent,
            border: `1px solid ${picked ? C.accent : C.line}`,
          }}
        >
          {picked ? (
            <>
              <Check size={15} /> Using this version
            </>
          ) : (
            "Use this version"
          )}
        </button>
      </div>
    </div>
  );
}

function ConflictResolver({
  conflicts,
  leftLabel,
  rightLabel,
  scopePicks,
  onPick,
  intro,
}: {
  conflicts: FileConflict[];
  leftLabel: string;
  rightLabel: string;
  scopePicks: Record<string, "ours" | "theirs">;
  onPick: (file: string, side: "ours" | "theirs") => void;
  intro?: string;
}) {
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
      {intro && (
        <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>{intro}</div>
      )}
      <div className="flex flex-col" style={{ gap: 18 }}>
        {conflicts.map((c) => {
          const sel = scopePicks[c.file];
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <FileCode size={14} color={C.muted} />
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.muted }}>{c.file}</span>
              </div>
              <div className="flex" style={{ gap: 12, flexWrap: "wrap" }}>
                <DiffColumn
                  label={leftLabel}
                  tone="del"
                  lines={c.ours}
                  picked={sel === "ours"}
                  onPick={() => onPick(c.file, "ours")}
                />
                <DiffColumn
                  label={rightLabel}
                  tone="add"
                  lines={c.theirs}
                  picked={sel === "theirs"}
                  onPick={() => onPick(c.file, "theirs")}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Destructive-change guard: a "clean" merge can still delete or revert work already
 * on the target. Surface exactly what would be lost and require an explicit tick before
 * the action proceeds. Never hard-blocks — you can always ship after acknowledging.
 */
function RemovalWarning({
  removals,
  acked,
  onAck,
  context,
}: {
  removals: FileRemoval[];
  acked: boolean;
  onAck: (v: boolean) => void;
  context: string;
}) {
  if (!removals || removals.length === 0) return null;
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", background: C.delBg, border: `1px solid ${C.delMark}`, borderRadius: 10 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <AlertTriangle size={15} color={C.delMark} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.delMark }}>
          This removes work already on {context}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: 5, marginBottom: 10 }}>
        {removals.map((r) => (
          <div key={r.file} className="flex items-center gap-2" style={{ fontSize: 12.5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: C.delMark, minWidth: 58 }}>
              {r.kind === "delete" ? "DELETES" : "REVERTS"}
            </span>
            <span style={{ fontFamily: MONO, color: C.ink }}>{r.file}</span>
            {r.lastAuthor && <span style={{ color: C.muted }}>· last changed by {r.lastAuthor}</span>}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2" style={{ fontSize: 13, color: C.ink, cursor: "pointer" }}>
        <input type="checkbox" checked={acked} onChange={(e) => onAck(e.target.checked)} />
        Yes, I intend to remove the above.
      </label>
    </div>
  );
}

type Modal =
  | { kind: "publish" }
  | { kind: "undo" }
  | { kind: "restore"; sha: string; version: string; description: string }
  | null;

type VType = "major" | "minor" | "patch";
const VERSION_TYPES: { key: VType; label: string; blurb: string }[] = [
  { key: "major", label: "Major", blurb: "A rebuild or big redesign that changes how the site looks or works." },
  { key: "minor", label: "Minor", blurb: "A new feature or a noticeable addition to the site." },
  { key: "patch", label: "Small patch", blurb: "A small fix or tweak — copy edits, minor styling, quick corrections." },
];

export default function Console({ currentLogin, isAdmin }: { currentLogin: string; isAdmin?: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pubType, setPubType] = useState<VType>("minor");
  const [pubDesc, setPubDesc] = useState("");
  // Destructive-change acknowledgments, keyed by scope (branch name, or "__publish__").
  const [ackRemovals, setAckRemovals] = useState<Record<string, boolean>>({});
  const ackRemoval = (scope: string, v: boolean) => setAckRemovals((a) => ({ ...a, [scope]: v }));

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/state${force ? "?force=1" : ""}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail || j.error || `Failed to load (${res.status})`);
        return;
      }
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Manual Refresh: force fresh refs from GitHub + show feedback (the load can
  // take a moment, so an unindicated click looks like nothing happened).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
    setToast("Refreshed.");
  }, [load]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const pick = (scope: string, file: string, side: "ours" | "theirs") =>
    setPicks((p) => ({ ...p, [scope]: { ...(p[scope] || {}), [file]: side } }));

  const isResolved = (u: Update) => u.clean || u.conflicts.every((c) => picks[u.branch]?.[c.file]);
  const publishResolved = (s: State) =>
    s.staging.publishClean || s.staging.publishConflicts.every((c) => picks["__publish__"]?.[c.file]);

  async function post(path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  const addToStaging = async (u: Update) => {
    setBusy(`add:${u.branch}`);
    const { ok, data } = await post("/api/add-to-staging", {
      branch: u.branch,
      picks: picks[u.branch] || {},
      ackRemovals: ackRemovals[u.branch] === true,
    });
    setBusy(null);
    if (ok) {
      setToast(`Added to staging — “${u.title}” is now on staging.`);
      ackRemoval(u.branch, false);
      await load();
    } else if (data.needsConfirm) {
      // Server backstop: state was stale and this add is destructive. Reload so the
      // warning panel shows, and prompt the operator to confirm.
      setToast("This update would remove work already on staging — review and confirm below.");
      await load();
    } else {
      setToast(`Couldn’t add to staging: ${data.detail || data.error}`);
    }
  };

  const syncFromStaging = async (u: Update) => {
    setBusy(`sync:${u.branch}`);
    const { ok, data } = await post("/api/sync-from-staging", { branch: u.branch, picks: picks[u.branch] || {} });
    setBusy(null);
    if (ok) {
      setToast(`Synced — ${u.authorName}’s branch is caught up with staging.`);
      await load();
    } else {
      setToast(`Couldn’t sync: ${data.detail || data.error}`);
    }
  };

  // Sync a named theme card down to staging. Clean-but-behind branches fast-forward
  // with no picks; if the theme has diverged and conflicts, the endpoint aborts and
  // we point the user at the update card above (which has the conflict resolver).
  const syncTheme = async (t: ThemeCard) => {
    setBusy(`synctheme:${t.branch}`);
    const { ok, data } = await post("/api/sync-from-staging", { branch: t.branch });
    setBusy(null);
    if (ok) {
      setToast(
        data.alreadyUpToDate
          ? `${t.authorName}’s theme was already up to date with staging.`
          : `Synced — ${t.authorName}’s theme is caught up with staging.`
      );
      await load();
    } else if (t.ahead > 0) {
      setToast(
        `Couldn’t auto-sync — ${t.authorName}’s theme has its own changes that overlap staging. Resolve it under “Updates to add to staging” above.`
      );
    } else {
      setToast(`Couldn’t sync: ${data.detail || data.error}`);
    }
  };

  const qaReview = async () => {
    if (state?.staging.previewUrl) window.open(state.staging.previewUrl, "_blank", "noopener");
    setBusy("qa");
    const { ok, data } = await post("/api/qa");
    setBusy(null);
    if (ok) {
      setToast("Opened the staging preview — marked as reviewed.");
      await load();
    } else {
      setToast(`Couldn’t record review: ${data.detail || data.error}`);
    }
  };

  const doPublish = async () => {
    setBusy("publish");
    const { ok, data } = await post("/api/publish", {
      type: pubType,
      description: pubDesc.trim(),
      picks: picks["__publish__"] || {},
      ackRemovals: ackRemovals["__publish__"] === true,
    });
    setBusy(null);
    setModal(null);
    if (ok) {
      setToast(data.version ? `Published ${data.version} — it’s live now.` : "Published — it’s live now.");
      setPubDesc("");
      setPubType("minor");
      ackRemoval("__publish__", false);
      await load();
    } else if (data.needsConfirm) {
      setToast("This publish would remove content currently live — review and confirm on the Publish button.");
      await load();
    } else {
      setToast(`Couldn’t publish: ${data.detail || data.error}`);
    }
  };

  const doUndo = async () => {
    setBusy("undo");
    const { ok, data } = await post("/api/undo");
    setBusy(null);
    setModal(null);
    if (ok) {
      setToast("Undone — the live site is back to the previous version.");
      await load();
    } else {
      setToast(`Couldn’t undo: ${data.detail || data.error}`);
    }
  };

  const doRestore = async (sha: string, version: string) => {
    setBusy("restore");
    const { ok, data } = await post("/api/restore", { sha, version });
    setBusy(null);
    setModal(null);
    if (ok) {
      setToast(version ? `Restored — ${version} is live again.` : "Restored — the live site is back to that version.");
      await load();
    } else {
      setToast(`Couldn’t restore: ${data.detail || data.error}`);
    }
  };

  const mailto = (u: Update, devEmail: string) => {
    const subject = `Need a hand publishing: ${u.title}`;
    const body = [
      "Hi,",
      "",
      `I'm trying to move "${u.title}" up to staging but it overlaps with what's already there:`,
      ...u.conflicts.map((c) => `- ${c.file}`),
      "",
      "Could you take a look?",
      "",
      "Thanks,",
      u.authorName,
    ].join("\n");
    return `mailto:${devEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // -------- render -----------------------------------------------------------
  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        color: C.ink,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <style>{`
        .card { transition: box-shadow .2s ease; }
        .card:hover { box-shadow: 0 4px 16px rgba(24,36,46,.07); }
        button:focus-visible, a:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "28px 20px 60px" }}>
        {/* top bar */}
        <div className="flex items-center justify-between" style={{ marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 9, background: C.ink }}
            >
              <Globe size={18} color="#fff" />
            </span>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>
                Publish
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: -1 }}>
                {state?.store.publicDomain || "…"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2"
              title="Refresh"
              style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 11px", cursor: refreshing ? "default" : "pointer", color: C.muted, fontSize: 13 }}
            >
              <RefreshCw size={14} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <Link
              href="/architecture"
              title="Theme architecture map"
              className="inline-flex items-center gap-2"
              style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 11px", color: C.muted, fontSize: 13, textDecoration: "none" }}
            >
              <Boxes size={14} /> Architecture
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                title="Settings"
                className="inline-flex items-center gap-2"
                style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 11px", color: C.muted, fontSize: 13, textDecoration: "none" }}
              >
                <Settings size={14} /> Settings
              </Link>
            )}
            <div className="flex items-center gap-2" style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 6px 4px 4px" }}>
              <Avatar name={state?.user.name || currentLogin} color={state?.user.color || "#5C6B78"} size={22} />
              <span style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{state?.user.name || currentLogin}</span>
              <button
                onClick={() => signOut()}
                title="Sign out"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, display: "inline-flex", padding: 4 }}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: C.warnBg, color: C.warnFg, border: `1px solid #E9D3A8`, borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontSize: 13.5, lineHeight: 1.5 }}>
            <strong>Couldn’t reach the store’s history.</strong> {error}
          </div>
        )}

        {/* live now + undo */}
        <div style={{ background: C.ink, borderRadius: 14, padding: "16px 18px", color: "#fff", marginBottom: 22 }}>
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8FB9C4", fontWeight: 600 }}>
                Live on the site
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 600 }}>{state?.store.publicDomain || "…"}</span>
                {state?.live.currentVersion && (
                  <span style={{ fontSize: 12.5, fontWeight: 600, background: "#243645", color: "#CFE0E6", borderRadius: 999, padding: "3px 10px" }}>
                    {state.live.currentVersion}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#AFC3CC", marginTop: 3 }}>
                {state?.live.lastPublish
                  ? <>published {state.live.lastPublish.when} by {state.live.lastPublish.author}{state.live.lastPublish.description ? ` · ${state.live.lastPublish.description}` : ""}</>
                  : state
                    ? <>no versions published yet</>
                    : "loading…"}
              </div>
            </div>
            {state && state.live.versions.length > 0 && (
              <div className="flex items-center gap-2" style={{ background: "#243645", borderRadius: 10, padding: "10px 12px" }}>
                <span style={{ fontSize: 13, color: "#CFE0E6" }}>Something look wrong?</span>
                <button
                  onClick={() => setModal({ kind: "undo" })}
                  disabled={busy === "undo"}
                  className="inline-flex items-center gap-2 font-medium"
                  style={{ background: "#fff", color: C.ink, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", opacity: busy === "undo" ? 0.6 : 1 }}
                >
                  <RotateCcw size={15} /> Undo last publish
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===== UPDATES → STAGING ===== */}
        <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Updates to add to staging</h2>
          <span style={{ fontSize: 13, color: C.faint }}>{state ? `${state.updates.length} waiting` : ""}</span>
        </div>

        <div className="flex flex-col" style={{ gap: 12, marginBottom: 30 }}>
          {state?.updates.map((u) => {
            const resolved = isResolved(u);
            const scopePicks = picks[u.branch] || {};
            const busyAdd = busy === `add:${u.branch}`;
            const busySync = busy === `sync:${u.branch}`;
            return (
              <div key={u.branch} className="card" style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
                <div className="flex items-start justify-between gap-3" style={{ flexWrap: "wrap" }}>
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 500 }}>{u.title}</div>
                    <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                      <Avatar name={u.authorName} color={u.authorColor} size={18} />
                      <span style={{ fontSize: 13, color: C.muted }}>{u.authorName}</span>
                      <span style={{ color: C.faint }}>·</span>
                      <span style={{ fontSize: 13, color: C.faint }}>{u.when}</span>
                      <span style={{ color: C.faint }}>·</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>{u.branch}</span>
                      {u.version && (
                        <>
                          <span style={{ color: C.faint }}>·</span>
                          <span style={{ fontSize: 12, color: u.behindLive ? C.warnFg : C.faint }} title={u.behindLive ? "This theme is behind staging — sync to catch up" : "Up to date with staging"}>
                            {u.version}{u.behindLive ? " · behind" : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge ok={resolved} />
                </div>

                {u.conflicts.length > 0 && (
                  <ConflictResolver
                    conflicts={u.conflicts}
                    leftLabel="On staging now"
                    rightLabel={`${u.authorName}'s version`}
                    scopePicks={scopePicks}
                    onPick={(file, side) => pick(u.branch, file, side)}
                    intro={
                      resolved
                        ? undefined
                        : "These sections overlap with what's already on staging. Pick a version for each — if a diff looks over your head, email your developer instead."
                    }
                  />
                )}

                <RemovalWarning
                  removals={u.removals}
                  acked={ackRemovals[u.branch] === true}
                  onAck={(v) => ackRemoval(u.branch, v)}
                  context="staging"
                />

                <div className="flex items-center gap-2" style={{ marginTop: 15, flexWrap: "wrap" }}>
                  <Btn
                    kind="publish"
                    onClick={() => addToStaging(u)}
                    disabled={!resolved || busyAdd || (u.removals.length > 0 && ackRemovals[u.branch] !== true)}
                  >
                    <ArrowUpToLine size={16} /> {busyAdd ? "Adding…" : "Add to staging"}
                  </Btn>
                  <Btn kind="ghost" onClick={() => syncFromStaging(u)} disabled={busySync}>
                    <ArrowDownToLine size={15} /> {busySync ? "Syncing…" : "Sync from staging"}
                  </Btn>
                  {u.previewUrl && (
                    <Btn kind="ghost" href={u.previewUrl}>
                      <Eye size={15} /> Preview
                    </Btn>
                  )}
                  {u.conflicts.length > 0 && (
                    <Btn kind="link" href={mailto(u, state.store.devEmail)}>
                      <Mail size={15} /> Ask your developer
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
          {state && state.updates.length === 0 && (
            <div style={{ textAlign: "center", color: C.muted, padding: "28px 0", fontSize: 14 }}>
              Nothing waiting. Every branch is level with staging.
            </div>
          )}
          {!state && !error && (
            <div style={{ textAlign: "center", color: C.faint, padding: "28px 0", fontSize: 14 }}>Loading…</div>
          )}
        </div>

        {/* ===== STAGING → LIVE ===== */}
        <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Staging — ready for the live site</h2>
          <span style={{ fontSize: 13, color: C.faint }}>
            {state ? (state.staging.ahead > 0 ? `${state.staging.ahead} change${state.staging.ahead === 1 ? "" : "s"} staged` : "up to date") : ""}
          </span>
        </div>

        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 30 }}>
          {state && state.staging.ahead === 0 ? (
            <div style={{ color: C.muted, fontSize: 14, padding: "8px 0" }}>
              Staging matches the live site. Add an update above to stage something for release.
            </div>
          ) : (
            state && (
              <>
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", marginBottom: 12 }}>
                  <div className="flex items-center gap-2">
                    <Badge
                      ok={state.staging.qa.signedOff}
                      okText={`QA’d${state.staging.qa.signoffs[0] ? " by " + state.staging.qa.signoffs[0].user_login : ""}`}
                      warnText="Not reviewed yet"
                    />
                    {!state.staging.publishClean && <Badge ok={false} warnText="Overlaps live — needs review" />}
                  </div>
                  <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                    <Btn kind="link" onClick={qaReview} disabled={busy === "qa"}>
                      <Eye size={15} /> {busy === "qa" ? "Opening…" : "QA Review"}
                    </Btn>
                    <Btn
                      kind="publish"
                      onClick={() => setModal({ kind: "publish" })}
                      disabled={
                        busy === "publish" ||
                        !publishResolved(state) ||
                        (state.staging.publishRemovals.length > 0 && ackRemovals["__publish__"] !== true)
                      }
                    >
                      <Globe size={16} /> Publish to live
                    </Btn>
                  </div>
                </div>

                <div className="flex flex-col" style={{ gap: 6 }}>
                  {state.staging.commits.slice(0, 8).map((c) => (
                    <div key={c.sha} className="flex items-center gap-2" style={{ fontSize: 13.5, color: C.muted }}>
                      <Check size={13} color={C.okFg} />
                      <span style={{ color: C.ink }}>{c.subject}</span>
                      <span style={{ color: C.faint }}>·</span>
                      <span style={{ color: C.faint }}>{c.author}, {c.when}</span>
                    </div>
                  ))}
                </div>

                {!state.staging.publishClean && (
                  <ConflictResolver
                    conflicts={state.staging.publishConflicts}
                    leftLabel="On the site now"
                    rightLabel="Staging’s version"
                    scopePicks={picks["__publish__"] || {}}
                    onPick={(file, side) => pick("__publish__", file, side)}
                    intro="Staging overlaps with something already live. Pick a version for each file before publishing."
                  />
                )}

                <RemovalWarning
                  removals={state.staging.publishRemovals}
                  acked={ackRemovals["__publish__"] === true}
                  onAck={(v) => ackRemoval("__publish__", v)}
                  context="the live site"
                />
              </>
            )
          )}
        </div>

        {/* ===== THEMES ===== */}
        <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Themes</h2>
          <span style={{ fontSize: 13, color: C.faint }}>
            {state
              ? state.themes.filter((t) => t.behind > 0).length > 0
                ? `${state.themes.filter((t) => t.behind > 0).length} behind staging`
                : "all up to date"
              : ""}
          </span>
        </div>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 12px" }}>
          Each person’s preview theme. Themes no longer sync automatically — if you’re about to do a batch
          of work, Sync from staging first so you build on the latest. After syncing, refresh your working
          copy / Shopify theme (<code style={{ fontFamily: MONO, fontSize: 12 }}>git pull</code> if you edit locally).
        </p>

        <div className="flex flex-col" style={{ gap: 12, marginBottom: 30 }}>
          {state?.themes.map((t) => {
            const busySync = busy === `synctheme:${t.branch}`;
            const upToDate = t.exists && t.behind === 0;
            return (
              <div
                key={t.branch}
                className="card"
                style={{
                  background: t.behind > 0 ? C.warnBg : C.paper,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
                  <div className="flex items-center gap-2" style={{ minWidth: 200 }}>
                    <Avatar name={t.authorName} color={t.authorColor} size={24} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>
                        {t.authorName}
                        {t.isCurrentUser && <span style={{ color: C.faint, fontWeight: 400 }}> (you)</span>}
                      </div>
                      <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>{t.branch}</span>
                        {t.version && (
                          <>
                            <span style={{ color: C.faint }}>·</span>
                            <span style={{ fontSize: 12, color: C.faint }}>{t.version}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13 }}>
                    {!t.exists ? (
                      <span style={{ color: C.faint }}>No branch yet</span>
                    ) : t.behind > 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: C.warnFg, fontWeight: 500 }}>
                        <AlertTriangle size={14} /> Behind staging — {t.behind} to pull
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ color: C.okFg, fontWeight: 500 }}>
                        <Check size={14} /> Up to date{t.ahead > 0 ? ` · ${t.ahead} to stage` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ marginTop: 14, flexWrap: "wrap" }}>
                  <Btn
                    kind={t.behind > 0 ? "publish" : "ghost"}
                    onClick={() => syncTheme(t)}
                    disabled={busySync || !t.exists || upToDate}
                  >
                    <ArrowDownToLine size={15} /> {busySync ? "Syncing…" : "Sync from staging"}
                  </Btn>
                  {t.previewUrl && (
                    <Btn kind="ghost" href={t.previewUrl}>
                      <Eye size={15} /> Preview
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
          {state && state.themes.length === 0 && (
            <div style={{ textAlign: "center", color: C.muted, padding: "28px 0", fontSize: 14 }}>
              No themes configured.
            </div>
          )}
        </div>

        {/* versions */}
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Versions</h2>
        <div className="flex flex-col" style={{ gap: 8 }}>
          {state?.live.versions.map((v) => {
            const isLive = v.version === state.live.currentVersion;
            return (
              <div
                key={v.version}
                className="flex items-center justify-between"
                style={{ background: C.paper, border: `1px solid ${isLive ? C.okFg : C.line}`, borderRadius: 10, padding: "11px 14px", gap: 12, flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{v.version}</span>
                    <VersionTag type={v.type} />
                    {isLive && (
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.okFg, background: C.okBg, borderRadius: 999, padding: "2px 9px" }}>Live now</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: C.ink, marginTop: 4 }}>{v.description || <span style={{ color: C.faint }}>No description</span>}</div>
                  <div style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>{v.author}, {v.when}</div>
                </div>
                {!isLive && (
                  <Btn kind="restore" onClick={() => setModal({ kind: "restore", sha: v.sha, version: v.version, description: v.description })}>
                    <RotateCcw size={14} /> Restore this version
                  </Btn>
                )}
              </div>
            );
          })}
          {state && state.live.versions.length === 0 && (
            <div style={{ color: C.faint, fontSize: 13.5, padding: "8px 0" }}>
              No versions yet. The first time you publish, you’ll pick a version number and it’ll show up here.
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", color: C.faint, fontSize: 12.5, marginTop: 26, lineHeight: 1.6 }}>
          Add your work to staging, review it on the staging preview, then publish to the live site.
          <br />
          Every live change is confirmed and can be undone. Nothing here is permanent.
        </div>
      </div>

      {/* confirm modal */}
      {modal && state && (
        <div
          onClick={() => setModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(24,36,46,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.paper, borderRadius: 16, padding: 24, maxWidth: modal.kind === "publish" ? 520 : 440, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-start justify-between">
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                {modal.kind === "publish" ? "Publish a new version" : modal.kind === "undo" ? "Undo the last publish?" : "Restore this version?"}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint }}>
                <X size={20} />
              </button>
            </div>

            {modal.kind === "publish" ? (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, margin: "0 0 14px" }}>
                  Everything on staging goes live on {state.store.publicDomain} right away. Pick what kind of change this is —
                  the version number is set for you.
                </p>
                <div className="flex flex-col" style={{ gap: 8, marginBottom: 16 }}>
                  {VERSION_TYPES.map((t) => {
                    const on = pubType === t.key;
                    const nextV = state.staging.nextVersions[t.key];
                    return (
                      <button
                        key={t.key}
                        onClick={() => setPubType(t.key)}
                        style={{ textAlign: "left", background: on ? C.accentTint : C.paper, border: `1.5px solid ${on ? C.accent : C.line}`, borderRadius: 11, padding: "11px 13px", cursor: "pointer" }}
                      >
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{t.label}</span>
                          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: on ? C.accent : C.faint }}>v{nextV}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{t.blurb}</div>
                      </button>
                    );
                  })}
                </div>
                <label style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>What changed? (shown in the version history)</label>
                <textarea
                  value={pubDesc}
                  onChange={(e) => setPubDesc(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. New winter homepage hero and updated shipping copy"
                  style={{ width: "100%", marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", color: C.ink, resize: "vertical" }}
                />
                {!state.staging.qa.signedOff && (
                  <div style={{ fontSize: 13, color: C.warnFg, background: C.warnBg, borderRadius: 9, padding: "8px 11px", marginTop: 10, lineHeight: 1.45 }}>
                    Heads up: this hasn’t been marked as reviewed in QA yet.
                  </div>
                )}
                <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
                  <Btn kind="ghost" onClick={() => setModal(null)}>Cancel</Btn>
                  <Btn kind="publish" onClick={doPublish} disabled={busy === "publish"}>
                    <Check size={16} /> {busy === "publish" ? "Publishing…" : `Publish v${state.staging.nextVersions[pubType]}`}
                  </Btn>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, margin: "12px 0 20px" }}>
                  {modal.kind === "undo" && <>This puts the live site back to how it was before the last publish. You can always publish again later.</>}
                  {modal.kind === "restore" && (
                    <>This puts the live site back to <strong>{modal.version}</strong>{modal.description ? ` (“${modal.description}”)` : ""}. You can always publish again later.</>
                  )}
                </p>
                <div className="flex justify-end gap-2">
                  <Btn kind="ghost" onClick={() => setModal(null)}>Cancel</Btn>
                  {modal.kind === "undo" && (
                    <Btn kind="danger" onClick={doUndo} disabled={busy === "undo"}>
                      <RotateCcw size={15} /> {busy === "undo" ? "Undoing…" : "Undo publish"}
                    </Btn>
                  )}
                  {modal.kind === "restore" && (
                    <Btn kind="danger" onClick={() => doRestore(modal.sha, modal.version)} disabled={busy === "restore"}>
                      <RotateCcw size={15} /> {busy === "restore" ? "Restoring…" : "Restore version"}
                    </Btn>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", padding: "12px 18px", borderRadius: 10, fontSize: 14, zIndex: 60, boxShadow: "0 6px 24px rgba(24,36,46,.25)", maxWidth: "90%" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
