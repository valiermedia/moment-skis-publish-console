"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, ShieldCheck, Lock, Check, AlertTriangle } from "lucide-react";
import { C, MONO } from "@/lib/ui";

interface FieldStatus {
  key: string;
  label: string;
  group: string;
  secret?: boolean;
  multiline?: boolean;
  placeholder?: string;
  help?: string;
  source: "db" | "env" | "unset";
  isSet: boolean;
  value: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

const THEMES_KEY = "THEMES_YAML";

function SourceBadge({ source }: { source: "db" | "env" | "unset" }) {
  const map = {
    db: { t: "Set in app", bg: C.okBg, fg: C.okFg },
    env: { t: "Set in .env", bg: C.accentTint, fg: C.accent },
    unset: { t: "Not set", bg: C.warnBg, fg: C.warnFg },
  }[source];
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: map.bg, color: map.fg }}>
      {map.t}
    </span>
  );
}

export default function AdminSettings({ admin }: { admin: string }) {
  const [fields, setFields] = useState<FieldStatus[] | null>(null);
  const [themesYaml, setThemesYaml] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [superAdmins, setSuperAdmins] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings", { cache: "no-store" });
    if (!res.ok) {
      setMsg({ ok: false, text: `Couldn't load settings (${res.status})` });
      return;
    }
    const j = await res.json();
    setFields(j.fields);
    setSuperAdmins(j.superAdmins || []);
    // seed the theme editor with the current effective map
    setThemesYaml((prev) => (prev ? prev : j.currentThemesYaml || ""));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const groups = useMemo(() => {
    const g: Record<string, FieldStatus[]> = {};
    for (const f of fields ?? []) {
      if (f.key === THEMES_KEY) continue; // rendered separately
      (g[f.group] ||= []).push(f);
    }
    return g;
  }, [fields]);

  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(drafts)) {
      if (v !== undefined && v !== "") updates[k] = v;
    }
    // theme map: send the current editor contents if non-empty
    if (themesYaml.trim() !== "") updates[THEMES_KEY] = themesYaml;

    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Saved ${j.changed?.length || 0} change(s). Takes effect immediately.` });
      setDrafts({});
      setFields(j.fields);
    } else {
      setMsg({ ok: false, text: j.error || "Save failed" });
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 740, margin: "0 auto", padding: "28px 20px 80px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 9, background: C.ink }}>
              <ShieldCheck size={18} color="#fff" />
            </span>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.accent, fontWeight: 600 }}>
                Settings
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: -1 }}>Operator configuration</div>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-medium"
            style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 13px", fontSize: 13, color: C.muted, textDecoration: "none" }}
          >
            <ArrowLeft size={15} /> Back to console
          </Link>
        </div>

        <div style={{ background: C.accentTint, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 22, fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
          Signed in as super-admin <strong>{admin}</strong>. Changes here save to the server and take effect
          immediately — no redeploy. Secrets are stored encrypted and never shown back; leave a secret field
          blank to keep the current value. Login credentials (GitHub OAuth, org) live in <code style={{ fontFamily: MONO }}>.env</code> by
          design and aren&apos;t editable here.
          {superAdmins.length > 0 && (
            <div style={{ marginTop: 6, color: C.muted, fontSize: 12.5 }}>
              Super-admins: {superAdmins.join(", ")} (set via <code style={{ fontFamily: MONO }}>SUPER_ADMIN_LOGINS</code>).
            </div>
          )}
        </div>

        {!fields && <div style={{ color: C.faint, fontSize: 14 }}>Loading…</div>}

        {fields &&
          Object.entries(groups).map(([group, gfields]) => (
            <div key={group} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>{group}</h2>
              <div className="flex flex-col" style={{ gap: 16 }}>
                {gfields.map((f) => (
                  <div key={f.key}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                      <label htmlFor={f.key} className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {f.secret && <Lock size={13} color={C.faint} />}
                        {f.label}
                      </label>
                      <SourceBadge source={f.source} />
                    </div>
                    {f.multiline ? (
                      <textarea
                        id={f.key}
                        rows={5}
                        value={drafts[f.key] ?? ""}
                        placeholder={f.secret && f.isSet ? "•••••••• (set — leave blank to keep)" : f.value ?? f.placeholder ?? ""}
                        onChange={(e) => setDraft(f.key, e.target.value)}
                        style={inputStyle(true)}
                      />
                    ) : (
                      <input
                        id={f.key}
                        type="text"
                        value={drafts[f.key] ?? ""}
                        placeholder={f.secret && f.isSet ? "•••••••• (set — leave blank to keep)" : f.value ?? f.placeholder ?? ""}
                        onChange={(e) => setDraft(f.key, e.target.value)}
                        style={inputStyle(false)}
                      />
                    )}
                    {f.help && <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{f.help}</div>}
                    {f.updatedBy && (
                      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>
                        last set by {f.updatedBy}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

        {/* Theme map editor */}
        {fields && (
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Theme map</h2>
            <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 10, lineHeight: 1.5 }}>
              Branch → Shopify theme ids (used only for preview links + the live-version label — never for
              publishing). Edit and save to override <code style={{ fontFamily: MONO }}>config/themes.yml</code>.
            </div>
            <textarea
              rows={12}
              value={themesYaml}
              onChange={(e) => setThemesYaml(e.target.value)}
              spellCheck={false}
              style={{ ...inputStyle(true), fontFamily: MONO, fontSize: 12.5 }}
            />
          </div>
        )}

        <div className="flex items-center gap-3" style={{ position: "sticky", bottom: 0, paddingTop: 12 }}>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 font-medium"
            style={{ background: C.okFg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 14.5, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, boxShadow: "0 4px 14px rgba(24,36,46,.12)" }}
          >
            <Save size={16} /> {saving ? "Saving…" : "Save changes"}
          </button>
          {msg && (
            <span className="inline-flex items-center gap-2" style={{ fontSize: 13.5, color: msg.ok ? C.okFg : C.warnFg }}>
              {msg.ok ? <Check size={15} /> : <AlertTriangle size={15} />} {msg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function inputStyle(multiline: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${C.line}`,
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 14,
    color: C.ink,
    background: C.paper,
    outlineColor: C.accent,
    resize: multiline ? "vertical" : undefined,
    fontFamily: "inherit",
  };
}
