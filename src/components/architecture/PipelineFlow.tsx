"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { AC, ARCH_FONT, ARCH_MONO } from "@/lib/arch-ui";
import type { Pipeline, PipelineNode } from "@/lib/architecture";
import ArchHeader from "./ArchHeader";

const POS: Record<string, { x: number; y: number }> = {
  merritt: { x: 40, y: 30 },
  luke: { x: 40, y: 170 },
  max: { x: 40, y: 310 },
  staging: { x: 400, y: 170 },
  live: { x: 760, y: 170 },
};

function PipelineNodeView({ data }: NodeProps) {
  const n = data as unknown as PipelineNode & { onOpen: () => void };
  const emphasized = n.tier === "live";
  return (
    <div
      onClick={n.onOpen}
      className="arch-node"
      style={{
        width: 216,
        borderRadius: 16,
        background: AC.paper,
        border: `1px solid ${emphasized ? AC.accent : AC.line}`,
        boxShadow: emphasized ? "0 8px 30px rgba(12,124,146,.16)" : "0 4px 18px rgba(0,0,0,.05)",
        padding: "15px 17px",
        cursor: "pointer",
      }}
    >
      {n.tier !== "person" && <Handle type="target" position={Position.Left} style={handleStyle} />}
      {n.tier !== "live" && <Handle type="source" position={Position.Right} style={handleStyle} />}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: n.color || (n.tier === "live" ? AC.accent : AC.faint),
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.01em", color: AC.ink }}>{n.label}</span>
      </div>
      <div style={{ fontSize: 11.5, color: AC.faint, marginTop: 7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {n.tier === "person" ? "Person theme" : n.tier === "staging" ? "QA trunk" : "Live storefront"}
      </div>
      {n.themeId != null && (
        <div style={{ fontFamily: ARCH_MONO, fontSize: 11, color: AC.muted, marginTop: 4 }}>theme {n.themeId}</div>
      )}
    </div>
  );
}

const handleStyle = { width: 7, height: 7, background: AC.hair, border: "none" };

function Flow({ pipeline }: { pipeline: Pipeline }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const nodeTypes = useMemo(() => ({ pipe: PipelineNodeView }), []);

  const nodes: Node[] = useMemo(
    () =>
      pipeline.nodes.map((n) => ({
        id: n.id,
        type: "pipe",
        position: POS[n.id] ?? { x: 0, y: 0 },
        data: { ...n, onOpen: () => router.push(`/architecture/${n.branch}`) },
        draggable: false,
      })),
    [pipeline, router]
  );

  const edges: Edge[] = useMemo(
    () =>
      pipeline.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        animated: true,
        style: { stroke: AC.hair, strokeWidth: 1.5 },
      })),
    [pipeline]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => router.push(`/architecture/${node.id}`),
    [router]
  );

  if (!mounted) return <div style={{ height: "100%", display: "grid", placeItems: "center", color: AC.faint, fontSize: 14 }}>Loading map…</div>;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      fitView
      fitViewOptions={{ padding: 0.28, duration: 600 }}
      minZoom={0.4}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      nodesDraggable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color={AC.dot} />
      <Controls showInteractive={false} style={{ boxShadow: "0 2px 10px rgba(0,0,0,.08)", borderRadius: 10, overflow: "hidden" }} />
    </ReactFlow>
  );
}

export default function PipelineFlow({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div style={{ height: "100vh", background: AC.bg, fontFamily: ARCH_FONT, display: "flex", flexDirection: "column" }}>
      <ArchHeader
        title="Theme Architecture"
        subtitle="How work flows through the themes — click a theme to explore its features."
        crumbs={[{ label: "Pipeline" }]}
      />
      <div style={{ flex: 1, minHeight: 0 }} className="arch-canvas">
        <ReactFlowProvider>
          <Flow pipeline={pipeline} />
        </ReactFlowProvider>
      </div>
      <style>{`
        .arch-node { transition: box-shadow .2s ease, transform .2s ease; }
        .arch-node:hover { transform: translateY(-2px); }
        .react-flow__attribution { display: none; }
        .react-flow__controls-button { border: none; background: ${AC.paper}; color: ${AC.muted}; }
        .arch-canvas .react-flow__renderer { animation: archIn .5s ease; }
        @keyframes archIn { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce){ .arch-canvas .react-flow__renderer{ animation:none } .arch-node{ transition:none } }
      `}</style>
    </div>
  );
}
