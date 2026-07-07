// Apple-clean palette for the architecture map. Distinct from the console's UI
// (near-white, dot grid, hairlines, generous whitespace) but shares the product's
// one restrained accent (the console teal) so it's obviously the same app.
export const AC = {
  bg: "#F5F5F7",
  paper: "#FFFFFF",
  ink: "#1D1D1F",
  muted: "#6E6E73",
  faint: "#8E8E93",
  line: "#E4E4E9",
  hair: "#D2D2D7",
  accent: "#0C7C92",
  accentSoft: "#E4F1F4",
  dot: "#D5D5DB",
};

export const ARCH_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const ARCH_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif";

// Edge styling per typed relationship.
export const EDGE_STYLE: Record<string, { stroke: string; label: string }> = {
  renders: { stroke: "#B7C0CA", label: "renders" },
  "renders-section": { stroke: "#B7C0CA", label: "renders section" },
  scripts: { stroke: "#C9B3D6", label: "scripts" },
  styles: { stroke: "#B3D6C4", label: "styles" },
  composes: { stroke: "#C9C9CF", label: "composes" },
  "uses-element": { stroke: "#0C7C92", label: "uses element" },
  "emits-event": { stroke: "#0C7C92", label: "event" },
  shares: { stroke: "#D6CDB3", label: "shares" },
};

export const FILE_TYPE_LABEL: Record<string, string> = {
  section: "Section",
  block: "Block",
  snippet: "Snippet",
  layout: "Layout",
  template: "Template",
  "template-liquid": "Template",
  "asset-js": "JavaScript",
  "asset-css": "Styles",
  "asset-liquid": "Asset (Liquid)",
  asset: "Asset",
  config: "Config",
  locale: "Locale",
};
