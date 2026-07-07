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
  previewUrl: string | null;
}
interface Commit {
  sha: string;
  subject: string;
  author: string;
  iso: string;
  when: string;
}
interface State {
  user: { login: string; name: string; color: string };
  repo: { owner: string; repo: string; liveBranch: string; stagingBranch: string };
  store: { publicDomain: string; devEmail: string };
  updates: Update[];
  staging: {
    sha: string;
    ahead: number;
    commits: Commit[];
    previewUrl: string | null;
    qa: { signedOff: boolean; signoffs: { user_login: string; signed_at: string }[] };
    publishClean: boolean;
    publishConflicts: FileConflict[];
  };
  live: {
    sha: string;
    recent: Commit[];
    shopify: { name: string; role: string; updated_at: string; previewUrl: string | null } | null;
    lastPublish: { subject: string; author: string; iso: string; when: string } | null;
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

type Modal =
  | { kind: "publish" }
  | { kind: "undo" }
  | { kind: "restore"; sha: string; subject: string }
  | null;

export default function Console({ currentLogin, isAdmin }: { currentLogin: string; isAdmin?: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

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
    const { ok, data } = await post("/api/add-to-staging", { branch: u.branch, picks: picks[u.branch] || {} });
    setBusy(null);
    if (ok) {
      setToast(
        data.releveled
          ? `Added to staging — “${u.title}” is on staging and ${u.authorName}’s theme is caught up.`
          : `Added to staging — but couldn’t auto re-level ${u.authorName}’s branch. Ask your developer.`
      );
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
    const { ok, data } = await post("/api/publish", { picks: picks["__publish__"] || {} });
    setBusy(null);
    setModal(null);
    if (ok) {
      setToast("Published — staging is live on the site now.");
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

  const doRestore = async (sha: string) => {
    setBusy("restore");
    const { ok, data } = await post("/api/restore", { sha });
    setBusy(null);
    setModal(null);
    if (ok) {
      setToast("Restored — the live site is back to that version.");
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
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{state?.store.publicDomain || "…"}</div>
              <div style={{ fontSize: 13, color: "#AFC3CC", marginTop: 2 }}>
                {state?.live.lastPublish
                  ? <>published {state.live.lastPublish.when} by {state.live.lastPublish.author} · {state.live.shopify?.name || state.live.sha.slice(0, 7)}</>
                  : state
                    ? <>current version {state.live.shopify?.name || state.live.sha.slice(0, 7)}</>
                    : "loading…"}
              </div>
            </div>
            {state && state.live.recent.length > 0 && (
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

                <div className="flex items-center gap-2" style={{ marginTop: 15, flexWrap: "wrap" }}>
                  <Btn kind="publish" onClick={() => addToStaging(u)} disabled={!resolved || busyAdd}>
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
                      disabled={busy === "publish" || !publishResolved(state)}
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
              </>
            )
          )}
        </div>

        {/* recently published */}
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Recently published</h2>
        <div className="flex flex-col" style={{ gap: 8 }}>
          {state?.live.recent.map((c) => (
            <div
              key={c.sha}
              className="flex items-center justify-between"
              style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 14px", gap: 12, flexWrap: "wrap" }}
            >
              <div className="flex items-center gap-2" style={{ minWidth: 200, flex: 1 }}>
                <span style={{ fontSize: 14.5 }}>{c.subject}</span>
                <span style={{ color: C.faint }}>·</span>
                <span style={{ fontSize: 13, color: C.faint }}>{c.author}, {c.when}</span>
              </div>
              <Btn kind="restore" onClick={() => setModal({ kind: "restore", sha: c.sha, subject: c.subject })}>
                <RotateCcw size={14} /> Restore this version
              </Btn>
            </div>
          ))}
          {state && state.live.recent.length === 0 && (
            <div style={{ color: C.faint, fontSize: 13.5, padding: "8px 0" }}>No publishes yet.</div>
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
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.paper, borderRadius: 16, padding: 24, maxWidth: 440, width: "100%" }}>
            <div className="flex items-start justify-between">
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                {modal.kind === "publish" ? "Publish to the live site?" : modal.kind === "undo" ? "Undo the last publish?" : "Restore this version?"}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, margin: "12px 0 20px" }}>
              {modal.kind === "publish" && (
                <>
                  Everything on staging will go live on {state.store.publicDomain} right away, and customers will see it immediately.
                  {!state.staging.qa.signedOff && (
                    <>
                      {" "}
                      <span style={{ color: C.warnFg }}>Heads up: this hasn’t been marked as reviewed in QA yet.</span>
                    </>
                  )}
                </>
              )}
              {modal.kind === "undo" && <>This puts the live site back to how it was before the last publish. You can always publish again later.</>}
              {modal.kind === "restore" && <>This puts the live site back to how it was at “{modal.subject}”. You can always publish again later.</>}
            </p>
            <div className="flex justify-end gap-2">
              <Btn kind="ghost" onClick={() => setModal(null)}>
                Cancel
              </Btn>
              {modal.kind === "publish" && (
                <Btn kind="publish" onClick={doPublish} disabled={busy === "publish"}>
                  <Check size={16} /> {busy === "publish" ? "Publishing…" : "Publish now"}
                </Btn>
              )}
              {modal.kind === "undo" && (
                <Btn kind="danger" onClick={doUndo} disabled={busy === "undo"}>
                  <RotateCcw size={15} /> {busy === "undo" ? "Undoing…" : "Undo publish"}
                </Btn>
              )}
              {modal.kind === "restore" && (
                <Btn kind="danger" onClick={() => doRestore(modal.sha)} disabled={busy === "restore"}>
                  <RotateCcw size={15} /> {busy === "restore" ? "Restoring…" : "Restore version"}
                </Btn>
              )}
            </div>
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
