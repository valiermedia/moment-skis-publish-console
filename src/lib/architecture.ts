import fs from "node:fs";
import path from "node:path";

/**
 * Server-side readers for the pre-generated theme architecture map. The app only
 * ever reads the committed data/architecture/*.json — it never analyzes theme code
 * at request time. Regenerate with ./refresh-architecture.sh.
 */

export interface PipelineNode {
  id: string;
  branch: string;
  tier: "person" | "staging" | "live";
  label: string;
  color: string | null;
  themeId: number | null;
}
export interface Pipeline {
  analyzedAt: string;
  nodes: PipelineNode[];
  edges: { from: string; to: string }[];
}

export interface Feature {
  id: string;
  anchor: string;
  name: string;
  summary: string;
  files: string[];
  snippets: string[];
  assets: string[];
  settings: string[];
  elements: string[];
  events: { emits: string[]; listens: string[] };
  x: number;
  y: number;
}
export interface ArchFile {
  path: string;
  type: string;
}
export interface ArchEdge {
  from: string;
  to: string;
  type: string;
  detail: string;
}
export interface BranchArchitecture {
  branch: string;
  themeId: number | null;
  analyzedAt: string | null;
  counts: { files: number; features: number; edges: number; featureEdges: number };
  features: Feature[];
  files: ArchFile[];
  edges: ArchEdge[];
  featureEdges: ArchEdge[];
}

function archDir(): string {
  return path.join(process.cwd(), "data", "architecture");
}

export function readPipeline(): Pipeline | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(archDir(), "pipeline.json"), "utf8"));
  } catch {
    return null;
  }
}

export function listBranches(): string[] {
  const p = readPipeline();
  return p ? p.nodes.map((n) => n.branch) : [];
}

export function readBranch(branch: string): BranchArchitecture | null {
  // guard against path traversal — only simple branch tokens
  if (!/^[a-zA-Z0-9._-]+$/.test(branch)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(archDir(), `${branch}.json`), "utf8"));
  } catch {
    return null;
  }
}
