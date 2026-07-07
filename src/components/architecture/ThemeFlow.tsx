"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Search, X, FileCode, Boxes, Radio, SlidersHorizontal, ArrowRight, CornerDownLeft,
  Home, ShoppingBag, LayoutGrid, Newspaper, FileText, ShoppingCart, Layers, Store, PanelTop,
} from "lucide-react";
import { AC, ARCH_FONT, ARCH_MONO, EDGE_STYLE, FILE_TYPE_LABEL } from "@/lib/arch-ui";
import type { BranchArchitecture, Feature, PageType } from "@/lib/architecture";
import ArchHeader from "./ArchHeader";

const GLOBAL_ID = "__global__";

// ---------- title-case fallback ----------
function titleCase(h: string) {
  return h.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PT_ICON: Record<string, React.ReactNode> = {
  index: <Home size={17} />,
  product: <ShoppingBag size={17} />,
  collection: <LayoutGrid size={17} />,
  "list-collections": <LayoutGrid size={17} />,
  blog: <Newspaper size={17} />,
  article: <Newspaper size={17} />,
  page: <FileText size={17} />,
  cart: <ShoppingCart size={17} />,
  search: <Search size={17} />,
  [GLOBAL_ID]: <PanelTop size={17} />,
};

// ============================ custom nodes ============================
function RootNode({ data }: NodeProps) {
  const d = data as unknown as { domain: string };
  return (
    <div style={{ width: 190, borderRadius: 16, background: AC.ink, color: "#fff", padding: "14px 18px", boxShadow: "0 10px 30px rgba(0,0,0,.18)", textAlign: "center" }}>
      <Handle type="source" position={Position.Right} style={hs} />
      <Handle type="source" position={Position.Bottom} style={hs} />
      <Handle type="source" position={Position.Left} style={hs} />
      <Handle type="source" position={Position.Top} style={hs} />
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600 }}>
        <Store size={16} /> Storefront
      </div>
      <div style={{ fontFamily: ARCH_MONO, fontSize: 11, color: "#9BB4BC", marginTop: 4 }}>{d.domain}</div>
    </div>
  );
}

function PageTypeNode({ data }: NodeProps) {
  const d = data as unknown as { pt: PageType; onOpen: () => void; hit: boolean };
  const pt = d.pt;
  return (
    <div onClick={d.onOpen} className="arch-node" style={{ ...card, borderColor: d.hit ? AC.accent : AC.line, boxShadow: d.hit ? shadowHit : shadow, width: 208 }}>
      <Handle type="target" position={Position.Left} style={hs} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: AC.accentSoft, color: AC.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {PT_ICON[pt.id] || <FileText size={17} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: AC.ink, letterSpacing: "-0.01em" }}>{pt.label}</div>
          <div style={{ fontFamily: ARCH_MONO, fontSize: 11, color: AC.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pt.url}</div>
        </div>
      </div>
      {pt.templateCount > 1 && (
        <div style={{ fontSize: 11, color: AC.muted, marginTop: 8 }}>{pt.templateCount} templates</div>
      )}
    </div>
  );
}

function GlobalNode({ data }: NodeProps) {
  const d = data as unknown as { onOpen: () => void; count: number };
  return (
    <div onClick={d.onOpen} className="arch-node" style={{ ...card, width: 208, background: "#FBFBFD" }}>
      <Handle type="target" position={Position.Left} style={hs} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: AC.ink, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <PanelTop size={17} />
        </span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: AC.ink }}>Global</div>
          <div style={{ fontSize: 11, color: AC.faint }}>Header &amp; footer · every page</div>
        </div>
      </div>
    </div>
  );
}

function SectionNode({ data }: NodeProps) {
  const d = data as unknown as { name: string; region: string; sectionType: string; components: number | null; onOpen: () => void; hit: boolean; hasFeature: boolean };
  const tone = d.region === "Header" ? "#8FA9B3" : d.region === "Footer" ? "#8FA9B3" : AC.accent;
  return (
    <div onClick={d.onOpen} className="arch-node" style={{ ...card, width: 250, borderColor: d.hit ? AC.accent : AC.line, boxShadow: d.hit ? shadowHit : shadow, opacity: d.hasFeature ? 1 : 0.7 }}>
      <Handle type="target" position={Position.Top} style={hs} />
      <Handle type="source" position={Position.Bottom} style={hs} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: AC.ink, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone, flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 11, color: AC.faint }}>
        <span style={{ fontFamily: ARCH_MONO }}>{d.sectionType}</span>
        {d.components != null && <span>· {d.components} files</span>}
      </div>
    </div>
  );
}

function RegionLabel({ data }: NodeProps) {
  const d = data as unknown as { label: string; note: string };
  return (
    <div style={{ width: 150, textAlign: "right", paddingRight: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: AC.ink, textTransform: "uppercase", letterSpacing: "0.08em" }}>{d.label}</div>
      <div style={{ fontSize: 11, color: AC.faint, marginTop: 3 }}>{d.note}</div>
    </div>
  );
}

function FileNodeView({ data }: NodeProps) {
  const d = data as unknown as { path: string; ftype: string; isAnchor: boolean };
  const base = d.path.split("/").pop() || d.path;
  const dir = d.path.slice(0, d.path.length - base.length);
  return (
    <div style={{ width: 200, borderRadius: 11, background: d.isAnchor ? AC.accentSoft : AC.paper, border: `1px solid ${d.isAnchor ? AC.accent : AC.line}`, boxShadow: shadow, padding: "9px 11px" }}>
      <Handle type="target" position={Position.Left} style={hs} />
      <Handle type="source" position={Position.Right} style={hs} />
      <div style={{ fontSize: 10, color: AC.faint, textTransform: "uppercase", letterSpacing: "0.05em" }}>{FILE_TYPE_LABEL[d.ftype] || d.ftype}</div>
      <div style={{ fontFamily: ARCH_MONO, fontSize: 11.5, color: AC.ink, marginTop: 2, wordBreak: "break-all" }}>
        <span style={{ color: AC.faint }}>{dir}</span>{base}
      </div>
    </div>
  );
}

const hs = { width: 6, height: 6, background: AC.hair, border: "none" };
const card: React.CSSProperties = { borderRadius: 14, background: AC.paper, border: `1.5px solid ${AC.line}`, boxShadow: "0 3px 14px rgba(0,0,0,.05)", padding: "12px 14px", cursor: "pointer", transition: "box-shadow .2s ease, border-color .2s ease, transform .2s ease" };
const shadow = "0 3px 14px rgba(0,0,0,.05)";
const shadowHit = "0 8px 26px rgba(12,124,146,.18)";

// ---------- Level-3 file layout (BFS layering from anchor) ----------
function layoutFiles(feature: Feature, data: BranchArchitecture) {
  const fileSet = new Set(feature.files);
  const subEdges = data.edges.filter((e) => fileSet.has(e.from) && fileSet.has(e.to));
  const layer: Record<string, number> = { [feature.anchor]: 0 };
  for (let k = 0; k < feature.files.length; k++)
    for (const e of subEdges) if (layer[e.from] != null) layer[e.to] = Math.max(layer[e.to] ?? 0, layer[e.from] + 1);
  const byLayer: Record<number, string[]> = {};
  for (const f of feature.files) (byLayer[layer[f] ?? 1] ||= []).push(f);
  const typeOf: Record<string, string> = Object.fromEntries(data.files.map((f) => [f.path, f.type]));
  const nodes: Node[] = [];
  for (const [Lstr, group] of Object.entries(byLayer)) {
    const L = Number(Lstr);
    group.sort();
    const totalH = group.length * 84;
    group.forEach((p, i) =>
      nodes.push({ id: p, type: "file", position: { x: L * 300, y: i * 84 - totalH / 2 }, data: { path: p, ftype: typeOf[p] || "other", isAnchor: p === feature.anchor }, draggable: false })
    );
  }
  const edges: Edge[] = subEdges.map((e, i) => ({
    id: `f${i}`, source: e.from, target: e.to, type: "smoothstep",
    label: EDGE_STYLE[e.type]?.label, labelStyle: { fontSize: 10, fill: AC.faint }, labelBgStyle: { fill: AC.bg, fillOpacity: 0.85 },
    style: { stroke: EDGE_STYLE[e.type]?.stroke || AC.hair, strokeWidth: 1.4 },
  }));
  return { nodes, edges };
}

// ---------- search index ----------
type SI = { label: string; sub: string; kind: string; sectionType?: string; pageTypeId?: string };
function buildIndex(data: BranchArchitecture): SI[] {
  const items: SI[] = [];
  for (const pt of data.sitemap.pageTypes) items.push({ label: pt.label, sub: pt.url, kind: "page", pageTypeId: pt.id });
  const seen = new Set<string>();
  for (const f of data.features) {
    if (!seen.has(f.id)) { items.push({ label: f.name, sub: f.id, kind: "section", sectionType: f.id }); seen.add(f.id); }
    for (const s of f.settings) items.push({ label: s, sub: f.name, kind: "setting", sectionType: f.id });
    for (const el of f.elements) items.push({ label: `<${el}>`, sub: f.name, kind: "element", sectionType: f.id });
  }
  const owner: Record<string, string> = {};
  for (const f of data.features) for (const file of f.files) if (!owner[file]) owner[file] = f.id;
  for (const { path: file } of data.files) items.push({ label: file.split("/").pop() || file, sub: file, kind: "file", sectionType: owner[file] });
  return items;
}
const KIND_ICON: Record<string, React.ReactNode> = {
  page: <LayoutGrid size={14} />, section: <Boxes size={14} />, file: <FileCode size={14} />,
  setting: <SlidersHorizontal size={14} />, element: <Boxes size={14} />, event: <Radio size={14} />,
};

// ============================================================================
function Canvas({ data, branchLabel }: { data: BranchArchitecture; branchLabel: string }) {
  const [view, setView] = useState<"pages" | "page">("pages");
  const [pageId, setPageId] = useState<string | null>(null);
  const [variant, setVariant] = useState(0);
  const [selected, setSelected] = useState<string | null>(null); // section feature id (drawer)
  const [expanded, setExpanded] = useState<string | null>(null); // section feature id (L3 files)
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [hit, setHit] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const featureById = useMemo(() => Object.fromEntries(data.features.map((f) => [f.id, f])), [data]);
  const nameById = useMemo(() => Object.fromEntries(data.features.map((f) => [f.id, f.name])), [data]);
  const index = useMemo(() => buildIndex(data), [data]);
  const pageById = useMemo(() => Object.fromEntries(data.sitemap.pageTypes.map((p) => [p.id, p])), [data]);

  // section type -> first (pageTypeId, variantIdx) that contains it
  const sectionLocation = useMemo(() => {
    const loc: Record<string, { pageId: string; variant: number }> = {};
    for (const pt of data.sitemap.pageTypes)
      pt.templates.forEach((t, vi) => t.sections.forEach((s) => { if (!loc[s]) loc[s] = { pageId: pt.id, variant: vi }; }));
    for (const s of [...data.sitemap.global.header, ...data.sitemap.global.footer]) if (!loc[s]) loc[s] = { pageId: GLOBAL_ID, variant: 0 };
    return loc;
  }, [data]);

  const nodeTypes = useMemo(() => ({ root: RootNode, pageType: PageTypeNode, global: GlobalNode, section: SectionNode, region: RegionLabel, file: FileNodeView }), []);

  const openPage = useCallback((id: string) => { setExpanded(null); setSelected(null); setPageId(id); setVariant(0); setView("page"); }, []);
  const openSection = useCallback((sectionType: string) => {
    const loc = sectionLocation[sectionType];
    if (loc) { setPageId(loc.pageId); setVariant(loc.variant); setView("page"); }
    setExpanded(null);
    setSelected(sectionType);
    setHit(sectionType);
    setTimeout(() => setHit(null), 1500);
    setSearchOpen(false);
  }, [sectionLocation]);

  // ---- build nodes/edges for the active view ----
  const flow = useMemo(() => {
    // L3: expanded file graph
    if (expanded && featureById[expanded]) return { ...layoutFiles(featureById[expanded], data), kind: "files" as const };

    if (view === "pages") {
      const pts = data.sitemap.pageTypes;
      const ring = [...pts.map((p) => ({ id: p.id, isGlobal: false, pt: p })), { id: GLOBAL_ID, isGlobal: true, pt: null as PageType | null }];
      const n = ring.length;
      const R = Math.max(300, 96 * Math.sqrt(n) + 130);
      const nodes: Node[] = [{ id: "__root__", type: "root", position: { x: -95, y: -34 }, data: { domain: `${branchLabel.toLowerCase()} theme` }, draggable: false }];
      const edges: Edge[] = [];
      ring.forEach((r, i) => {
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = Math.cos(ang) * R, y = Math.sin(ang) * R * 0.72;
        nodes.push(
          r.isGlobal
            ? { id: r.id, type: "global", position: { x, y }, data: { onOpen: () => openPage(GLOBAL_ID) }, draggable: false }
            : { id: r.id, type: "pageType", position: { x, y }, data: { pt: r.pt, hit: hit === r.id, onOpen: () => openPage(r.id) }, draggable: false }
        );
        edges.push({ id: `r${i}`, source: "__root__", target: r.id, type: "straight", style: { stroke: AC.hair, strokeWidth: 1, opacity: 0.7 } });
      });
      return { nodes, edges, kind: "pages" as const };
    }

    // L2: a page assembled top-to-bottom
    const isGlobal = pageId === GLOBAL_ID;
    const pt = isGlobal ? null : pageById[pageId!];
    const tmpl = pt?.templates[variant];
    const regions: { label: string; note: string; sections: string[] }[] = isGlobal
      ? [
          { label: "Header", note: "top of every page", sections: data.sitemap.global.header },
          { label: "Footer", note: "bottom of every page", sections: data.sitemap.global.footer },
        ]
      : [
          { label: "Header", note: "global", sections: data.sitemap.global.header },
          { label: "Main", note: tmpl?.template || "", sections: tmpl?.sections || [] },
          { label: "Footer", note: "global", sections: data.sitemap.global.footer },
        ];
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 0;
    let prev: string | null = null;
    const X = 120;
    for (const region of regions) {
      const startY = y;
      region.sections.forEach((s) => {
        const nid = `${region.label}:${s}`;
        const feat = featureById[s];
        nodes.push({
          id: nid,
          type: "section",
          position: { x: X, y },
          data: {
            name: feat?.name || titleCase(s),
            region: region.label,
            sectionType: s,
            components: feat ? feat.files.length : null,
            hasFeature: !!feat,
            hit: hit === s,
            onOpen: () => { setSelected(s); setSearchOpen(false); },
          },
          draggable: false,
        });
        if (prev) edges.push({ id: `s${prev}->${nid}`, source: prev, target: nid, type: "smoothstep", style: { stroke: AC.hair, strokeWidth: 1.5 }, animated: false });
        prev = nid;
        y += 96;
      });
      if (region.sections.length === 0) { nodes.push({ id: `empty:${region.label}`, type: "region", position: { x: X, y }, data: { label: "—", note: "no sections" }, draggable: false }); y += 70; }
      // region label to the left of the band
      nodes.push({ id: `region:${region.label}:${startY}`, type: "region", position: { x: X - 190, y: startY + 6 }, data: { label: region.label, note: region.note }, draggable: false });
      y += 26;
    }
    return { nodes, edges, kind: "page" as const };
  }, [view, pageId, variant, expanded, data, pageById, featureById, hit, branchLabel, openPage]);

  // ⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 10); }
      if (e.key === "Escape") { setSearchOpen(false); setSelected(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter((it) => it.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1, bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
        if (as !== bs) return as - bs;
        const order = ["page", "section", "setting", "element", "file"];
        if (a.kind !== b.kind) return order.indexOf(a.kind) - order.indexOf(b.kind);
        return a.label.length - b.label.length;
      })
      .slice(0, 12);
  }, [query, index]);

  const feat = selected ? featureById[selected] : null;
  const crumbs = useMemo(() => {
    const base = [{ label: "Pipeline", href: "/architecture" }, { label: branchLabel, href: `/architecture/${data.branch}` }];
    if (view === "pages") return [{ label: "Pipeline", href: "/architecture" }, { label: branchLabel }];
    const p = pageId === GLOBAL_ID ? { label: "Global" } : { label: pageById[pageId!]?.label || pageId! };
    if (expanded) return [...base, { label: p.label, href: undefined }, { label: featureById[expanded]?.name || expanded }];
    return [...base, p];
  }, [view, pageId, expanded, branchLabel, data.branch, pageById, featureById]);

  const activePt = pageId && pageId !== GLOBAL_ID ? pageById[pageId] : null;

  return (
    <>
      <ArchHeader
        title={
          expanded ? featureById[expanded]?.name || branchLabel
          : view === "pages" ? `${branchLabel} theme`
          : pageId === GLOBAL_ID ? "Global — header & footer"
          : `${activePt?.label} page`
        }
        subtitle={
          expanded ? "Components inside this section and how they connect."
          : view === "pages" ? `${data.sitemap.pageTypes.length} page types · press ⌘K to search`
          : pageId === GLOBAL_ID ? "Appears on every page of the site."
          : `${activePt?.url} · top-to-bottom, as a visitor sees it`
        }
        crumbs={crumbs}
        right={
          view === "pages" && (
            <button onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 10); }} style={pill}>
              <Search size={14} /> Search <kbd style={kbd}>⌘K</kbd>
            </button>
          )
        }
      />

      {/* variant switcher for multi-template pages */}
      {view === "page" && activePt && activePt.templates.length > 1 && !expanded && (
        <div style={{ display: "flex", gap: 7, padding: "10px 20px", background: AC.paper, borderBottom: `1px solid ${AC.line}`, overflowX: "auto", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: AC.faint, marginRight: 4, whiteSpace: "nowrap" }}>Template:</span>
          {activePt.templates.map((t, i) => (
            <button key={t.template} onClick={() => { setVariant(i); setSelected(null); }} style={{ ...chip, ...(i === variant ? chipOn : {}) }}>
              {t.variant === "default" ? activePt.id : t.variant}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: "relative" }} className="arch-canvas">
        {!mounted ? (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: AC.faint }}>Loading map…</div>
        ) : (
          <ReactFlow
            key={`${view}:${pageId}:${variant}:${expanded}`}
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: view === "page" ? 0.14 : 0.22, duration: 550 }}
            minZoom={0.1}
            maxZoom={2.2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color={AC.dot} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}

        {/* back button */}
        {(view === "page" || expanded) && (
          <button
            onClick={() => (expanded ? setExpanded(null) : (setView("pages"), setSelected(null)))}
            style={{ position: "absolute", top: 16, left: 16, zIndex: 6, ...pill, boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}
          >
            <CornerDownLeft size={14} /> {expanded ? "Back to page" : "All pages"}
          </button>
        )}

        {/* search */}
        {searchOpen && (
          <div style={searchWrap} onClick={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
            <div style={searchPanel}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${AC.line}` }}>
                <Search size={17} color={AC.faint} />
                <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages, sections, files, settings…" autoFocus
                  style={{ border: "none", outline: "none", fontSize: 15.5, flex: 1, color: AC.ink, background: "transparent", fontFamily: ARCH_FONT }}
                  onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pick(results[0]); }} />
                <button onClick={() => setSearchOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: AC.faint }}><X size={17} /></button>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {results.length === 0 && query && <div style={{ padding: 18, color: AC.faint, fontSize: 14 }}>No matches.</div>}
                {results.map((r, i) => (
                  <button key={i} onClick={() => pick(r)} className="arch-result" style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "10px 15px", border: "none", background: "transparent", cursor: "pointer", fontFamily: ARCH_FONT }}>
                    <span style={{ color: AC.faint, display: "inline-flex" }}>{KIND_ICON[r.kind]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, color: AC.ink, fontFamily: r.kind === "file" || r.kind === "setting" ? ARCH_MONO : ARCH_FONT }}>{r.label}</span>
                      <span style={{ fontSize: 12, color: AC.faint, marginLeft: 8 }}>{r.kind}{r.sub && r.kind !== "page" ? ` · ${r.sub}` : ""}</span>
                    </span>
                    <ArrowRight size={13} color={AC.hair} />
                  </button>
                ))}
                {!query && <div style={{ padding: "14px 15px", color: AC.faint, fontSize: 13 }}>Try “product”, “cart”, “header”, a section, a file, or a setting.</div>}
              </div>
            </div>
          </div>
        )}

        {/* detail drawer (L3 entry) */}
        {feat && !expanded && (
          <Drawer feature={feat} data={data} nameById={nameById} onClose={() => setSelected(null)} onExpand={() => setExpanded(feat.id)} />
        )}
      </div>
    </>
  );

  function pick(r: SI) {
    if (r.kind === "page" && r.pageTypeId) openPage(r.pageTypeId);
    else if (r.sectionType) openSection(r.sectionType);
  }
}

// ---------------- drawer ----------------
function Drawer({ feature, data, nameById, onClose, onExpand }: { feature: Feature; data: BranchArchitecture; nameById: Record<string, string>; onClose: () => void; onExpand: () => void }) {
  const conns = useMemo(() =>
    data.featureEdges.filter((e) => e.from === feature.id || e.to === feature.id)
      .map((e) => ({ other: e.from === feature.id ? e.to : e.from, dir: e.from === feature.id ? "out" : "in", type: e.type, detail: e.detail }))
      .filter((c) => c.other !== feature.id).slice(0, 40), [data, feature]);
  const typeOf: Record<string, string> = Object.fromEntries(data.files.map((f) => [f.path, f.type]));
  const filesByType: Record<string, string[]> = {};
  for (const f of feature.files) (filesByType[typeOf[f] || "other"] ||= []).push(f);

  return (
    <div className="arch-drawer" style={drawer}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: AC.accent, fontWeight: 600 }}>Section</div>
          <h2 style={{ fontSize: 20, fontWeight: 650, margin: "3px 0 0", letterSpacing: "-0.02em", color: AC.ink }}>{feature.name}</h2>
          <div style={{ fontFamily: ARCH_MONO, fontSize: 12, color: AC.faint, marginTop: 3 }}>{feature.anchor}</div>
        </div>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: AC.faint }}><X size={19} /></button>
      </div>
      <p style={{ fontSize: 14, color: AC.muted, lineHeight: 1.55, margin: "14px 0 16px" }}>{feature.summary}</p>
      <button onClick={onExpand} style={{ width: "100%", background: AC.ink, color: "#fff", border: "none", borderRadius: 11, padding: 11, fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <FileCode size={15} /> Expand to components ({feature.files.length})
      </button>
      {conns.length > 0 && (
        <Section title="Connections">
          {conns.map((c, i) => (
            <div key={i} style={row}>
              <span style={{ fontSize: 12, color: AC.faint, width: 22 }}>{c.dir === "out" ? "→" : "←"}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: AC.ink }}>{nameById[c.other] || c.other}</span>
              <span style={{ fontSize: 11.5, color: AC.muted }}>{EDGE_STYLE[c.type]?.label || c.type}{c.detail ? ` · ${c.detail}` : ""}</span>
            </div>
          ))}
        </Section>
      )}
      {(feature.events.emits.length || feature.events.listens.length || feature.elements.length) > 0 && (
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
      <Section title="Components">
        {Object.entries(filesByType).sort().map(([type, list]) => (
          <div key={type} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: AC.faint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{FILE_TYPE_LABEL[type] || type} ({list.length})</div>
            {list.slice(0, 40).map((f) => <div key={f} style={{ fontFamily: ARCH_MONO, fontSize: 12, color: AC.ink, padding: "2px 0", wordBreak: "break-all" }}>{f}</div>)}
            {list.length > 40 && <div style={{ fontSize: 12, color: AC.faint }}>+{list.length - 40} more</div>}
          </div>
        ))}
      </Section>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 20 }}><div style={{ fontSize: 12, fontWeight: 600, color: AC.ink, marginBottom: 8 }}>{title}</div>{children}</div>;
}
function Tag({ label, tone, mono }: { label: string; tone?: "accent"; mono?: boolean }) {
  return <span style={{ display: "inline-block", fontSize: 12, fontFamily: mono ? ARCH_MONO : ARCH_FONT, color: tone === "accent" ? AC.accent : AC.muted, background: tone === "accent" ? AC.accentSoft : "#F0F0F3", borderRadius: 7, padding: "3px 8px", margin: "0 6px 6px 0" }}>{label}</span>;
}

const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: AC.muted, background: AC.paper, border: `1px solid ${AC.line}`, borderRadius: 999, padding: "7px 13px", cursor: "pointer" };
const kbd: React.CSSProperties = { fontFamily: ARCH_MONO, fontSize: 11, background: AC.bg, border: `1px solid ${AC.line}`, borderRadius: 5, padding: "1px 5px", color: AC.faint };
const chip: React.CSSProperties = { fontSize: 12.5, color: AC.muted, background: AC.bg, border: `1px solid ${AC.line}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: ARCH_MONO };
const chipOn: React.CSSProperties = { background: AC.accent, color: "#fff", borderColor: AC.accent };
const searchWrap: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(30,30,32,0.14)", backdropFilter: "blur(2px)", display: "flex", justifyContent: "center", paddingTop: 90, zIndex: 20 };
const searchPanel: React.CSSProperties = { width: "min(560px, 92%)", background: AC.paper, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.22)", overflow: "hidden", height: "fit-content" };
const drawer: React.CSSProperties = { position: "absolute", top: 12, right: 12, bottom: 12, width: 372, maxWidth: "calc(100% - 24px)", background: AC.paper, borderRadius: 16, border: `1px solid ${AC.line}`, boxShadow: "0 18px 50px rgba(0,0,0,.14)", padding: 22, overflowY: "auto", zIndex: 15 };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${AC.bg}` };

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
        .arch-canvas .react-flow__renderer { animation: archIn .4s ease; }
        .arch-drawer { animation: drawerIn .28s cubic-bezier(.2,.7,.3,1); }
        @keyframes archIn { from { opacity:0 } to { opacity:1 } }
        @keyframes drawerIn { from { opacity:0; transform: translateX(14px) } to { opacity:1; transform:none } }
        @media (prefers-reduced-motion: reduce){ .arch-canvas .react-flow__renderer,.arch-drawer,.arch-node{ animation:none; transition:none } }
      `}</style>
    </div>
  );
}
