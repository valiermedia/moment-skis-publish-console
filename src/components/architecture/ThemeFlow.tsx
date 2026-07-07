"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Search, X, FileCode, Boxes, Radio, SlidersHorizontal, ArrowRight, CornerDownLeft } from "lucide-react";
import { AC, ARCH_FONT, ARCH_MONO, EDGE_STYLE, FILE_TYPE_LABEL } from "@/lib/arch-ui";
import type { BranchArchitecture, Feature } from "@/lib/architecture";
import ArchHeader from "./ArchHeader";

const SCALE = 1.7;
const FW = 210; // feature node width
const FH = 66;

// ---------- Level-1 feature node ----------
function FeatureNodeView({ data, selected }: NodeProps) {
  const d = data as unknown as { feature: Feature; dim: boolean; hit: boolean; onOpen: () => void };
  const f = d.feature;
  return (
    <div
      onClick={d.onOpen}
      className="arch-node"
      style={{
        width: FW,
        borderRadius: 14,
        background: AC.paper,
        border: `1.5px solid ${selected || d.hit ? AC.accent : AC.line}`,
        boxShadow: selected || d.hit ? "0 8px 26px rgba(12,124,146,.18)" : "0 3px 14px rgba(0,0,0,.05)",
        padding: "11px 13px",
        cursor: "pointer",
        opacity: d.dim ? 0.32 : 1,
        transition: "opacity .25s ease, box-shadow .2s ease, border-color .2s ease",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <div style={{ fontSize: 14, fontWeight: 600, color: AC.ink, letterSpacing: "-0.01em", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {f.name}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: AC.faint }}>
        <span>{f.files.length} files</span>
        {f.settings.length > 0 && <span>{f.settings.length} settings</span>}
        {(f.events.emits.length + f.events.listens.length) > 0 && <span style={{ color: AC.accent }}>events</span>}
      </div>
    </div>
  );
}

// ---------- Level-2 file node ----------
function FileNodeView({ data }: NodeProps) {
  const d = data as unknown as { path: string; ftype: string; isAnchor: boolean };
  const base = d.path.split("/").pop() || d.path;
  const dir = d.path.slice(0, d.path.length - base.length);
  return (
    <div
      style={{
        width: 200,
        borderRadius: 11,
        background: d.isAnchor ? AC.accentSoft : AC.paper,
        border: `1px solid ${d.isAnchor ? AC.accent : AC.line}`,
        boxShadow: "0 2px 10px rgba(0,0,0,.05)",
        padding: "9px 11px",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <div style={{ fontSize: 10, color: AC.faint, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {FILE_TYPE_LABEL[d.ftype] || d.ftype}
      </div>
      <div style={{ fontFamily: ARCH_MONO, fontSize: 11.5, color: AC.ink, marginTop: 2, wordBreak: "break-all" }}>
        <span style={{ color: AC.faint }}>{dir}</span>
        {base}
      </div>
    </div>
  );
}

const handleStyle = { width: 6, height: 6, background: AC.hair, border: "none" };

// ---------- search index ----------
type SearchItem = { label: string; sub: string; kind: string; featureId: string };
function buildIndex(data: BranchArchitecture): SearchItem[] {
  const items: SearchItem[] = [];
  const seenOwner: Record<string, string> = {};
  for (const f of data.features) {
    items.push({ label: f.name, sub: f.id, kind: "feature", featureId: f.id });
    for (const s of f.settings) items.push({ label: s, sub: f.name, kind: "setting", featureId: f.id });
    for (const el of f.elements) items.push({ label: `<${el}>`, sub: f.name, kind: "element", featureId: f.id });
    for (const ev of [...f.events.emits, ...f.events.listens]) items.push({ label: ev, sub: f.name, kind: "event", featureId: f.id });
    for (const file of f.files) if (!seenOwner[file]) seenOwner[file] = f.id;
  }
  for (const { path: file } of data.files) {
    items.push({ label: file.split("/").pop() || file, sub: file, kind: "file", featureId: seenOwner[file] || "" });
  }
  return items;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  feature: <Boxes size={14} />,
  file: <FileCode size={14} />,
  setting: <SlidersHorizontal size={14} />,
  element: <Boxes size={14} />,
  event: <Radio size={14} />,
};

// ---------- Level-2 layout (BFS layering from anchor) ----------
function layoutFiles(feature: Feature, data: BranchArchitecture) {
  const fileSet = new Set(feature.files);
  const subEdges = data.edges.filter((e) => fileSet.has(e.from) && fileSet.has(e.to));
  const layer: Record<string, number> = { [feature.anchor]: 0 };
  for (let k = 0; k < feature.files.length; k++) {
    for (const e of subEdges) {
      if (layer[e.from] != null) layer[e.to] = Math.max(layer[e.to] ?? 0, layer[e.from] + 1);
    }
  }
  const byLayer: Record<number, string[]> = {};
  for (const f of feature.files) {
    const L = layer[f] ?? 1;
    (byLayer[L] ||= []).push(f);
  }
  const typeOf: Record<string, string> = {};
  for (const f of data.files) typeOf[f.path] = f.type;
  const nodes: Node[] = [];
  for (const [Lstr, group] of Object.entries(byLayer)) {
    const L = Number(Lstr);
    group.sort();
    const totalH = group.length * 84;
    group.forEach((p, i) => {
      nodes.push({
        id: p,
        type: "file",
        position: { x: L * 300, y: i * 84 - totalH / 2 },
        data: { path: p, ftype: typeOf[p] || "other", isAnchor: p === feature.anchor },
        draggable: false,
      });
    });
  }
  const edges: Edge[] = subEdges.map((e, i) => ({
    id: `f${i}`,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    label: EDGE_STYLE[e.type]?.label,
    labelStyle: { fontSize: 10, fill: AC.faint, fontFamily: ARCH_FONT },
    labelBgStyle: { fill: AC.bg, fillOpacity: 0.85 },
    style: { stroke: EDGE_STYLE[e.type]?.stroke || AC.hair, strokeWidth: 1.4 },
  }));
  return { nodes, edges };
}

// ============================================================================
function Canvas({ data, branchLabel }: { data: BranchArchitecture; branchLabel: string }) {
  const rf = useReactFlow();
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [hit, setHit] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const featureById = useMemo(() => Object.fromEntries(data.features.map((f) => [f.id, f])), [data]);
  const nameById = useMemo(() => Object.fromEntries(data.features.map((f) => [f.id, f.name])), [data]);
  const index = useMemo(() => buildIndex(data), [data]);

  const neighbors = useMemo(() => {
    // features directly connected to `selected` (for dimming)
    if (!selected) return null;
    const s = new Set<string>([selected]);
    for (const e of data.featureEdges) {
      if (e.from === selected) s.add(e.to);
      if (e.to === selected) s.add(e.from);
    }
    return s;
  }, [selected, data]);

  const nodeTypes = useMemo(() => ({ feature: FeatureNodeView, file: FileNodeView }), []);

  const focusFeature = useCallback(
    (id: string, open = true) => {
      const f = featureById[id];
      if (!f) return;
      setExpanded(null);
      setSelected(id);
      if (open) setSearchOpen(false);
      setHit(id);
      setTimeout(() => setHit(null), 1400);
      rf.setCenter(f.x * SCALE + FW / 2, f.y * SCALE + FH / 2, { zoom: 1.15, duration: 650 });
    },
    [featureById, rf]
  );

  // Level-1 vs Level-2 nodes/edges
  const { nodes, edges } = useMemo(() => {
    if (expanded) {
      const f = featureById[expanded];
      if (f) return layoutFiles(f, data);
    }
    const nodes: Node[] = data.features.map((f) => ({
      id: f.id,
      type: "feature",
      position: { x: f.x * SCALE, y: f.y * SCALE },
      data: {
        feature: f,
        dim: neighbors ? !neighbors.has(f.id) : false,
        hit: hit === f.id,
        onOpen: () => {
          setSelected(f.id);
          setSearchOpen(false);
        },
      },
      selected: selected === f.id,
      draggable: false,
    }));
    const edges: Edge[] = data.featureEdges.map((e, i) => {
      const st = EDGE_STYLE[e.type] || { stroke: AC.hair };
      const strong = e.type === "emits-event" || e.type === "uses-element";
      return {
        id: `fe${i}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        style: { stroke: st.stroke, strokeWidth: strong ? 1.8 : 1, opacity: strong ? 0.9 : 0.5 },
      };
    });
    return { nodes, edges };
  }, [expanded, data, featureById, neighbors, hit, selected]);

  // ⌘K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 10);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = index
      .filter((it) => it.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
      .slice(0, 40);
    // rank: label startsWith first, features first
    scored.sort((a, b) => {
      const as = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
      if ((a.kind === "feature") !== (b.kind === "feature")) return a.kind === "feature" ? -1 : 1;
      return a.label.length - b.label.length;
    });
    return scored.slice(0, 12);
  }, [query, index]);

  const feat = selected ? featureById[selected] : null;

  const crumbs = expanded
    ? [
        { label: "Pipeline", href: "/architecture" },
        { label: branchLabel, href: `/architecture/${data.branch}` },
        { label: featureById[expanded]?.name || expanded },
      ]
    : [{ label: "Pipeline", href: "/architecture" }, { label: branchLabel }];

  return (
    <>
      <ArchHeader
        title={expanded ? featureById[expanded]?.name || branchLabel : `${branchLabel} theme`}
        subtitle={
          expanded
            ? "Files inside this feature and how they connect."
            : `${data.counts.features} features · ${data.counts.edges} connections · press ⌘K to search`
        }
        crumbs={crumbs}
        right={
          !expanded && (
            <button
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => inputRef.current?.focus(), 10);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: AC.muted, background: AC.paper, border: `1px solid ${AC.line}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}
            >
              <Search size={14} /> Search <kbd style={kbd}>⌘K</kbd>
            </button>
          )
        }
      />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }} className="arch-canvas">
        {!mounted ? (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: AC.faint, fontSize: 14 }}>Loading map…</div>
        ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => {
            if (!expanded) {
              setSelected(n.id);
              setSearchOpen(false);
            }
          }}
          onPaneClick={() => setSelected(null)}
          fitView
          fitViewOptions={{ padding: 0.2, duration: 500 }}
          minZoom={0.15}
          maxZoom={2.4}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          nodesDraggable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color={AC.dot} />
          <Controls showInteractive={false} />
          {!expanded && (
            <MiniMap
              pannable
              zoomable
              nodeColor={() => "#C9D2DA"}
              maskColor="rgba(245,245,247,0.7)"
              style={{ borderRadius: 10, border: `1px solid ${AC.line}` }}
            />
          )}
        </ReactFlow>
        )}

        {/* Search overlay */}
        {searchOpen && !expanded && (
          <div style={searchWrap} onClick={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
            <div style={searchPanel}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${AC.line}` }}>
                <Search size={17} color={AC.faint} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search features, files, settings, events…"
                  autoFocus
                  style={{ border: "none", outline: "none", fontSize: 15.5, flex: 1, color: AC.ink, background: "transparent", fontFamily: ARCH_FONT }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results[0]) focusFeature(results[0].featureId);
                  }}
                />
                <button onClick={() => setSearchOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: AC.faint }}>
                  <X size={17} />
                </button>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {results.length === 0 && query && (
                  <div style={{ padding: 18, color: AC.faint, fontSize: 14 }}>No matches.</div>
                )}
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => r.featureId && focusFeature(r.featureId)}
                    className="arch-result"
                    style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "10px 15px", border: "none", background: "transparent", cursor: "pointer", fontFamily: ARCH_FONT }}
                  >
                    <span style={{ color: AC.faint, display: "inline-flex" }}>{KIND_ICON[r.kind]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, color: AC.ink, fontFamily: r.kind === "file" || r.kind === "setting" ? ARCH_MONO : ARCH_FONT }}>{r.label}</span>
                      <span style={{ fontSize: 12, color: AC.faint, marginLeft: 8 }}>{r.kind}{r.sub && r.kind !== "feature" ? ` · ${r.sub}` : ""}</span>
                    </span>
                    <ArrowRight size={13} color={AC.hair} />
                  </button>
                ))}
                {!query && (
                  <div style={{ padding: "14px 15px", color: AC.faint, fontSize: 13 }}>
                    Try “zoom”, “cart”, “product”, a file name, or a setting.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Detail drawer */}
        {feat && !expanded && (
          <Drawer feature={feat} data={data} nameById={nameById} onClose={() => setSelected(null)} onExpand={() => setExpanded(feat.id)} />
        )}

        {expanded && (
          <button
            onClick={() => setExpanded(null)}
            style={{ position: "absolute", top: 16, left: 16, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 7, background: AC.paper, border: `1px solid ${AC.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, color: AC.ink, cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}
          >
            <CornerDownLeft size={14} /> Back to features
          </button>
        )}
      </div>
    </>
  );
}

function Drawer({
  feature,
  data,
  nameById,
  onClose,
  onExpand,
}: {
  feature: Feature;
  data: BranchArchitecture;
  nameById: Record<string, string>;
  onClose: () => void;
  onExpand: () => void;
}) {
  const conns = useMemo(
    () =>
      data.featureEdges
        .filter((e) => e.from === feature.id || e.to === feature.id)
        .map((e) => ({
          other: e.from === feature.id ? e.to : e.from,
          dir: e.from === feature.id ? "out" : "in",
          type: e.type,
          detail: e.detail,
        }))
        .filter((c) => c.other !== feature.id)
        .slice(0, 40),
    [data, feature]
  );
  const filesByType: Record<string, string[]> = {};
  const typeOf: Record<string, string> = Object.fromEntries(data.files.map((f) => [f.path, f.type]));
  for (const f of feature.files) (filesByType[typeOf[f] || "other"] ||= []).push(f);

  return (
    <div className="arch-drawer" style={drawerStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: AC.accent, fontWeight: 600 }}>Feature</div>
          <h2 style={{ fontSize: 20, fontWeight: 650, margin: "3px 0 0", letterSpacing: "-0.02em", color: AC.ink }}>{feature.name}</h2>
          <div style={{ fontFamily: ARCH_MONO, fontSize: 12, color: AC.faint, marginTop: 3 }}>{feature.anchor}</div>
        </div>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: AC.faint }}>
          <X size={19} />
        </button>
      </div>

      <p style={{ fontSize: 14, color: AC.muted, lineHeight: 1.55, margin: "14px 0 16px" }}>{feature.summary}</p>

      <button
        onClick={onExpand}
        style={{ width: "100%", background: AC.ink, color: "#fff", border: "none", borderRadius: 11, padding: "11px", fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <FileCode size={15} /> Expand to files ({feature.files.length})
      </button>

      {conns.length > 0 && (
        <Section title="Connections">
          {conns.map((c, i) => (
            <div key={i} style={rowStyle}>
              <span style={{ fontSize: 10.5, color: AC.faint, textTransform: "uppercase", width: 26 }}>{c.dir === "out" ? "→" : "←"}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: AC.ink }}>{nameById[c.other] || c.other}</span>
              <span style={{ fontSize: 11.5, color: AC.muted }}>{EDGE_STYLE[c.type]?.label || c.type}{c.detail ? ` · ${c.detail}` : ""}</span>
            </div>
          ))}
        </Section>
      )}

      {(feature.events.emits.length > 0 || feature.events.listens.length > 0 || feature.elements.length > 0) && (
        <Section title="Data flow">
          {feature.events.emits.map((e) => <Tag key={"e" + e} label={`emits ${e}`} tone="accent" />)}
          {feature.events.listens.map((e) => <Tag key={"l" + e} label={`listens ${e}`} tone="accent" />)}
          {feature.elements.map((e) => <Tag key={"el" + e} label={`<${e}>`} tone="accent" mono />)}
        </Section>
      )}

      {feature.settings.length > 0 && (
        <Section title={`Settings (${feature.settings.length})`}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {feature.settings.slice(0, 60).map((s) => <Tag key={s} label={s} mono />)}
            {feature.settings.length > 60 && <span style={{ fontSize: 12, color: AC.faint }}>+{feature.settings.length - 60} more</span>}
          </div>
        </Section>
      )}

      <Section title="Files">
        {Object.entries(filesByType).sort().map(([type, list]) => (
          <div key={type} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: AC.faint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {FILE_TYPE_LABEL[type] || type} ({list.length})
            </div>
            {list.slice(0, 40).map((f) => (
              <div key={f} style={{ fontFamily: ARCH_MONO, fontSize: 12, color: AC.ink, padding: "2px 0", wordBreak: "break-all" }}>{f}</div>
            ))}
            {list.length > 40 && <div style={{ fontSize: 12, color: AC.faint }}>+{list.length - 40} more</div>}
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: AC.ink, marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</div>
      {children}
    </div>
  );
}
function Tag({ label, tone, mono }: { label: string; tone?: "accent"; mono?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        fontFamily: mono ? ARCH_MONO : ARCH_FONT,
        color: tone === "accent" ? AC.accent : AC.muted,
        background: tone === "accent" ? AC.accentSoft : "#F0F0F3",
        borderRadius: 7,
        padding: "3px 8px",
        margin: "0 6px 6px 0",
      }}
    >
      {label}
    </span>
  );
}

const kbd: React.CSSProperties = { fontFamily: ARCH_MONO, fontSize: 11, background: AC.bg, border: `1px solid ${AC.line}`, borderRadius: 5, padding: "1px 5px", color: AC.faint };
const searchWrap: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(30,30,32,0.14)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", paddingTop: 90, zIndex: 20 };
const searchPanel: React.CSSProperties = { width: "min(560px, 92%)", background: AC.paper, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.22)", overflow: "hidden", height: "fit-content" };
const drawerStyle: React.CSSProperties = { position: "absolute", top: 12, right: 12, bottom: 12, width: 372, maxWidth: "calc(100% - 24px)", background: AC.paper, borderRadius: 16, border: `1px solid ${AC.line}`, boxShadow: "0 18px 50px rgba(0,0,0,.14)", padding: 22, overflowY: "auto", zIndex: 15 };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${AC.bg}` };

export default function ThemeFlow({ data, branchLabel }: { data: BranchArchitecture; branchLabel: string }) {
  return (
    <div style={{ height: "100vh", background: AC.bg, fontFamily: ARCH_FONT, display: "flex", flexDirection: "column" }}>
      <ReactFlowProvider>
        <Canvas data={data} branchLabel={branchLabel} />
      </ReactFlowProvider>
      <style>{`
        .arch-node:hover { transform: translateY(-2px); }
        .arch-result:hover { background: ${AC.bg}; }
        .react-flow__attribution { display:none; }
        .react-flow__controls-button { border:none; background:${AC.paper}; color:${AC.muted}; box-shadow:none; }
        .arch-canvas .react-flow__renderer { animation: archIn .45s ease; }
        .arch-drawer { animation: drawerIn .28s cubic-bezier(.2,.7,.3,1); }
        @keyframes archIn { from { opacity:0 } to { opacity:1 } }
        @keyframes drawerIn { from { opacity:0; transform: translateX(14px) } to { opacity:1; transform:none } }
        @media (prefers-reduced-motion: reduce){ .arch-canvas .react-flow__renderer,.arch-drawer,.arch-node{ animation:none; transition:none } }
      `}</style>
    </div>
  );
}
