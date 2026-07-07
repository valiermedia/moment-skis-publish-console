// Deterministic static analyzer for a Shopify theme working tree.
// No LLM, no network — pure file parsing, so the refresh script is free + cron-safe.
// Grounded in the real moment-theme (include/render-heavy, section-schema driven).
//
// Exports analyzeTheme(themeDir, { branch, themeId }) -> {
//   branch, themeId, analyzedAt(null; stamped by caller), features, files, edges, featureEdges
// }

import fs from "node:fs";
import path from "node:path";

// ---- file discovery ---------------------------------------------------------

const DIRS = ["sections", "blocks", "snippets", "templates", "layout", "assets", "config", "locales"];

function fileType(rel) {
  const ext = path.extname(rel).toLowerCase();
  if (rel.startsWith("sections/")) return "section";
  if (rel.startsWith("blocks/")) return "block";
  if (rel.startsWith("snippets/")) return "snippet";
  if (rel.startsWith("layout/")) return "layout";
  if (rel.startsWith("templates/")) return ext === ".json" ? "template" : "template-liquid";
  if (rel.startsWith("assets/")) {
    if (ext === ".js") return "asset-js";
    if (ext === ".css" || ext === ".scss") return "asset-css";
    if (ext === ".liquid") return "asset-liquid";
    return "asset";
  }
  if (rel.startsWith("config/")) return "config";
  if (rel.startsWith("locales/")) return "locale";
  return "other";
}

function walk(themeDir) {
  const out = [];
  for (const d of DIRS) {
    const base = path.join(themeDir, d);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const abs = path.join(base, name);
      if (fs.statSync(abs).isFile()) out.push(`${d}/${name}`);
    }
  }
  return out;
}

// ---- helpers ----------------------------------------------------------------

function titleCase(handle) {
  return handle
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\.liquid$/i, "")
    .trim();
}

// Standard DOM / library events that are noise for a data-flow graph.
const STD_EVENTS = new Set([
  "DOMContentLoaded", "load", "unload", "beforeunload", "resize", "scroll", "click",
  "change", "input", "submit", "keydown", "keyup", "keypress", "mouseenter", "mouseleave",
  "mouseover", "mouseout", "mousedown", "mouseup", "mousemove", "focus", "blur", "touchstart",
  "touchend", "touchmove", "transitionend", "animationend", "popstate", "hashchange", "message",
  // lazysizes / common lib events
  "lazyloaded", "lazybeforeunveil", "lazyunveilread", "lazybeforesizes",
]);

function unique(arr) {
  return [...new Set(arr)];
}

// ---- Liquid parsing ---------------------------------------------------------

function parseLiquid(content) {
  const renders = []; // { name, params:[] }
  const assets = []; // asset handle referenced via | asset_url etc
  const settings = []; // setting ids read
  const elements = []; // custom element tags used
  let schema = null;

  // {% render 'name' [, param: val] [with x] [for y] %}  and {% include 'name' [with x] %}
  const callRe = /\{%-?\s*(render|include)\s+['"]([^'"]+)['"]([^%]*?)-?%\}/g;
  let m;
  while ((m = callRe.exec(content))) {
    const rest = m[3] || "";
    const params = [];
    // named params:  foo: value
    for (const p of rest.matchAll(/([a-zA-Z_][\w-]*)\s*:/g)) params.push(p[1]);
    // with X / for X
    const withM = rest.match(/\bwith\s+([a-zA-Z_][\w.-]*)/);
    if (withM) params.push(`with:${withM[1]}`);
    const forM = rest.match(/\bfor\s+([a-zA-Z_][\w.-]*)/);
    if (forM) params.push(`for:${forM[1]}`);
    renders.push({ name: m[2], params: unique(params) });
  }

  // {% section 'name' %} / {% sections 'name' %}
  for (const s of content.matchAll(/\{%-?\s*sections?\s+['"]([^'"]+)['"]/g)) {
    renders.push({ name: s[1], params: [], asSection: true });
  }

  // 'file.ext' | asset_url   (also | asset_img_url etc.)
  for (const a of content.matchAll(/['"]([^'"]+\.(?:js|css|scss|png|jpe?g|svg|gif|webp|woff2?|json|map))['"]\s*\|\s*asset(?:_img)?_url/g)) {
    assets.push(a[1]);
  }

  // settings reads: settings.x, section.settings.x, block.settings.x
  for (const s of content.matchAll(/\b(?:(?:section|block)\.)?settings\.([a-zA-Z_][\w-]*)/g)) {
    settings.push(s[1]);
  }

  // custom element tags <foo-bar ...>
  for (const e of content.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]+)(?=[\s/>])/g)) {
    elements.push(e[1]);
  }

  // {% schema %} ... {% endschema %}
  const schemaM = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (schemaM) {
    try {
      const j = JSON.parse(schemaM[1]);
      schema = {
        name: typeof j.name === "string" ? j.name : null,
        settings: Array.isArray(j.settings)
          ? j.settings.filter((s) => s && s.id).map((s) => s.id)
          : [],
        blocks: Array.isArray(j.blocks) ? j.blocks.map((b) => b.type).filter(Boolean) : [],
      };
    } catch {
      // schema with liquid inside / invalid JSON — extract name heuristically
      const nameM = schemaM[1].match(/"name"\s*:\s*"([^"]+)"/);
      schema = { name: nameM ? nameM[1] : null, settings: [], blocks: [] };
    }
  }

  return {
    renders,
    assets: unique(assets),
    settings: unique(settings),
    elements: unique(elements),
    schema,
  };
}

// ---- JS parsing -------------------------------------------------------------

function parseJs(content) {
  const defines = []; // custom elements defined
  const imports = []; // module specifiers
  const emits = []; // custom event names dispatched
  const listens = []; // custom event names listened

  for (const d of content.matchAll(/customElements\.define\(\s*['"]([a-z][a-z0-9-]+)['"]/g)) defines.push(d[1]);
  for (const i of content.matchAll(/import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) imports.push(i[1]);
  for (const e of content.matchAll(/new\s+CustomEvent\(\s*['"]([^'"]+)['"]/g)) emits.push(e[1]);
  for (const e of content.matchAll(/\.dispatchEvent\(\s*new\s+(?:Custom)?Event\(\s*['"]([^'"]+)['"]/g)) emits.push(e[1]);
  for (const l of content.matchAll(/addEventListener\(\s*['"]([^'"]+)['"]/g)) listens.push(l[1]);

  return {
    defines: unique(defines),
    imports: unique(imports),
    emits: unique(emits.filter((e) => !STD_EVENTS.has(e))),
    listens: unique(listens.filter((e) => !STD_EVENTS.has(e))),
  };
}

// ---- resolution -------------------------------------------------------------

// Map a render/include name to an actual file path in the theme.
function resolveRender(name, fileSet, asSection) {
  // names can be 'foo' or 'foo.bar'; snippets are snippets/<name>.liquid
  const candidates = asSection
    ? [`sections/${name}.liquid`]
    : [`snippets/${name}.liquid`, `sections/${name}.liquid`];
  for (const c of candidates) if (fileSet.has(c)) return c;
  return null;
}

function resolveAsset(handle, fileSet) {
  const c = `assets/${handle}`;
  if (fileSet.has(c)) return c;
  // asset_url with .liquid compiled assets (e.g. bundle.js -> bundle.js.liquid)
  if (fileSet.has(`${c}.liquid`)) return `${c}.liquid`;
  return null;
}

// ---- main -------------------------------------------------------------------

export function analyzeTheme(themeDir, { branch, themeId } = {}) {
  const relFiles = walk(themeDir);
  const fileSet = new Set(relFiles);

  const parsed = {}; // rel -> parsed info
  const files = [];

  for (const rel of relFiles) {
    const type = fileType(rel);
    files.push({ path: rel, type });
    let content = "";
    try {
      content = fs.readFileSync(path.join(themeDir, rel), "utf8");
    } catch {
      content = "";
    }
    if (type === "asset-js") {
      parsed[rel] = { kind: "js", ...parseJs(content) };
    } else if (
      type === "section" || type === "snippet" || type === "block" ||
      type === "layout" || type === "template-liquid" || type === "asset-liquid"
    ) {
      parsed[rel] = { kind: "liquid", ...parseLiquid(content) };
    } else if (type === "template") {
      // JSON template: which sections it composes
      const composes = [];
      try {
        const j = JSON.parse(content);
        const order = j.order || Object.keys(j.sections || {});
        for (const key of order) {
          const sec = j.sections?.[key];
          if (sec?.type) composes.push(sec.type);
        }
      } catch {
        /* ignore */
      }
      parsed[rel] = { kind: "template", composes: unique(composes) };
    } else {
      parsed[rel] = { kind: type };
    }
  }

  // ---- file-level edges (Level 2) ----
  const edges = [];
  const addEdge = (from, to, type, detail) => {
    if (from && to) edges.push({ from, to, type, detail: detail || "" });
  };

  for (const rel of relFiles) {
    const p = parsed[rel];
    if (!p) continue;
    if (p.kind === "liquid") {
      for (const r of p.renders) {
        const target = resolveRender(r.name, fileSet, r.asSection);
        if (target) addEdge(rel, target, r.asSection ? "renders-section" : "renders", r.params.join(", "));
      }
      for (const a of p.assets) {
        const target = resolveAsset(a, fileSet);
        if (target) {
          const t = fileType(target);
          addEdge(rel, target, t === "asset-css" ? "styles" : "scripts", a);
        }
      }
    } else if (p.kind === "template") {
      for (const secType of p.composes) {
        const target = `sections/${secType}.liquid`;
        if (fileSet.has(target)) addEdge(rel, target, "composes", "");
      }
    }
  }

  // element edges: JS defines <x>, liquid uses <x>
  const definers = {}; // tag -> [jsFile]
  for (const rel of relFiles) {
    const p = parsed[rel];
    if (p?.kind === "js") for (const tag of p.defines) (definers[tag] ||= []).push(rel);
  }
  for (const rel of relFiles) {
    const p = parsed[rel];
    if (p?.kind === "liquid") {
      for (const tag of p.elements) {
        for (const js of definers[tag] || []) addEdge(js, rel, "uses-element", tag);
      }
    }
  }

  // event edges: emitter JS -> listener JS (custom events, same name)
  const emitters = {}, listeners = {};
  for (const rel of relFiles) {
    const p = parsed[rel];
    if (p?.kind === "js") {
      for (const e of p.emits) (emitters[e] ||= []).push(rel);
      for (const e of p.listens) (listeners[e] ||= []).push(rel);
    }
  }
  for (const ev of Object.keys(emitters)) {
    for (const from of emitters[ev]) for (const to of listeners[ev] || []) {
      if (from !== to) addEdge(from, to, "emits-event", ev);
    }
  }

  // ---- features (anchor on sections/blocks + standalone web components) ----
  const features = [];
  const featureByAnchor = {};

  function transitiveFiles(startRel) {
    // follow renders/includes + scripts/styles transitively
    const seen = new Set([startRel]);
    const stack = [startRel];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of edges) {
        if (e.from !== cur) continue;
        if (["renders", "scripts", "styles"].includes(e.type) && !seen.has(e.to)) {
          seen.add(e.to);
          stack.push(e.to);
        }
      }
    }
    return seen;
  }

  const anchors = relFiles.filter((r) => {
    const t = fileType(r);
    return t === "section" || t === "block";
  });
  // standalone web components: JS files defining an element, not pulled by a section
  const usedJs = new Set(edges.filter((e) => e.type === "scripts").map((e) => e.to));
  for (const rel of relFiles) {
    if (fileType(rel) === "asset-js" && parsed[rel]?.defines?.length && !usedJs.has(rel)) anchors.push(rel);
  }

  for (const anchor of anchors) {
    const handle = path.basename(anchor).replace(/\.(liquid|js)$/i, "");
    const closure = transitiveFiles(anchor);
    const closureArr = [...closure];
    const p = parsed[anchor];
    const settings = new Set();
    const elements = new Set();
    const emits = new Set();
    const listens = new Set();
    for (const f of closureArr) {
      const fp = parsed[f];
      if (!fp) continue;
      if (fp.kind === "liquid") {
        (fp.settings || []).forEach((s) => settings.add(s));
        (fp.elements || []).forEach((e) => elements.add(e));
        if (fp.schema?.settings) fp.schema.settings.forEach((s) => settings.add(s));
      } else if (fp.kind === "js") {
        (fp.defines || []).forEach((e) => elements.add(e));
        (fp.emits || []).forEach((e) => emits.add(e));
        (fp.listens || []).forEach((e) => listens.add(e));
      }
    }
    const name = (p?.schema?.name) || titleCase(handle);
    const snippets = closureArr.filter((f) => fileType(f) === "snippet");
    const assets = closureArr.filter((f) => fileType(f).startsWith("asset"));
    const feat = {
      id: handle,
      anchor,
      name,
      files: closureArr,
      snippets,
      assets,
      settings: [...settings].sort(),
      elements: [...elements].sort(),
      events: { emits: [...emits].sort(), listens: [...listens].sort() },
    };
    feat.summary = summarize(feat, fileType(anchor));
    features.push(feat);
    featureByAnchor[anchor] = feat;
  }

  // ---- feature-level edges (Level 1) ----
  const featureEdges = [];
  const seenPair = new Set();
  const addFeatEdge = (from, to, type, detail) => {
    if (!from || !to || from === to) return;
    const key = `${from}|${to}|${type}|${detail}`;
    if (seenPair.has(key)) return;
    seenPair.add(key);
    featureEdges.push({ from, to, type, detail });
  };

  // ownership: which feature(s) own a given file (anchor closure membership)
  const owners = {}; // file -> [featureId]
  for (const f of features) for (const file of f.files) (owners[file] ||= []).push(f.id);

  // shared-snippet: features sharing a non-ubiquitous snippet are coupled
  const snippetUsers = {}; // snippet -> Set(featureId)
  for (const f of features) for (const s of f.snippets) (snippetUsers[s] ||= new Set()).add(f.id);
  for (const [snip, users] of Object.entries(snippetUsers)) {
    const list = [...users];
    if (list.length >= 2 && list.length <= 6) {
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          addFeatEdge(list[i], list[j], "shares", path.basename(snip));
    }
  }

  // event edges lifted to features
  for (const ev of Object.keys(emitters)) {
    const fromFeats = unique(emitters[ev].flatMap((f) => owners[f] || []));
    const toFeats = unique((listeners[ev] || []).flatMap((f) => owners[f] || []));
    for (const a of fromFeats) for (const b of toFeats) addFeatEdge(a, b, "emits-event", ev);
  }
  // element edges lifted to features
  for (const tag of Object.keys(definers)) {
    const fromFeats = unique(definers[tag].flatMap((f) => owners[f] || []));
    const userFiles = relFiles.filter((r) => parsed[r]?.kind === "liquid" && parsed[r].elements?.includes(tag));
    const toFeats = unique(userFiles.flatMap((f) => owners[f] || []));
    for (const a of fromFeats) for (const b of toFeats) addFeatEdge(a, b, "uses-element", tag);
  }

  layoutFeatures(features, featureEdges);

  return {
    branch: branch || null,
    themeId: themeId || null,
    analyzedAt: null,
    counts: {
      files: files.length,
      features: features.length,
      edges: edges.length,
      featureEdges: featureEdges.length,
    },
    features: features.map(({ anchor, ...rest }) => ({ ...rest, anchor })),
    files,
    edges,
    featureEdges,
  };
}

// Deterministic force-directed layout (no randomness → stable across refreshes).
// Seeds nodes on a circle by sorted id, then relaxes with repulsion + edge springs.
function layoutFeatures(features, featureEdges) {
  const n = features.length;
  if (n === 0) return;
  const idx = {};
  features.sort((a, b) => (a.name + a.id).localeCompare(b.name + b.id));
  features.forEach((f, i) => {
    idx[f.id] = i;
    const ang = (i / n) * Math.PI * 2;
    const R = 60 + 34 * Math.sqrt(n);
    f.x = Math.cos(ang) * R;
    f.y = Math.sin(ang) * R;
  });
  const springs = featureEdges
    .map((e) => [idx[e.from], idx[e.to]])
    .filter(([a, b]) => a != null && b != null);
  const REP = 90000, SPRING = 0.02, TARGET = 240, STEP = 0.85;
  for (let iter = 0; iter < 320; iter++) {
    const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = features[i].x - features[j].x, dy = features[i].y - features[j].y;
        let d2 = dx * dx + dy * dy || 0.01;
        const f = REP / d2;
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        fx[i] += ux * f; fy[i] += uy * f;
        fx[j] -= ux * f; fy[j] -= uy * f;
      }
    }
    for (const [a, b] of springs) {
      let dx = features[b].x - features[a].x, dy = features[b].y - features[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - TARGET) * SPRING;
      const ux = dx / d, uy = dy / d;
      fx[a] += ux * f * d; fy[a] += uy * f * d;
      fx[b] -= ux * f * d; fy[b] -= uy * f * d;
    }
    const damp = STEP * (1 - iter / 400);
    for (let i = 0; i < n; i++) {
      features[i].x += Math.max(-40, Math.min(40, fx[i] * damp * 0.0006));
      features[i].y += Math.max(-40, Math.min(40, fy[i] * damp * 0.0006));
    }
  }
  // round for clean JSON
  for (const f of features) {
    f.x = Math.round(f.x);
    f.y = Math.round(f.y);
  }
}

function summarize(feat, anchorType) {
  const bits = [];
  const kind = anchorType === "block" ? "block" : anchorType === "asset-js" ? "web component" : "section";
  bits.push(`A ${kind} “${feat.name}”.`);
  const nSnip = feat.snippets.length;
  const nAsset = feat.assets.length;
  if (nSnip) bits.push(`Renders ${nSnip} snippet${nSnip === 1 ? "" : "s"}.`);
  if (nAsset) bits.push(`Loads ${nAsset} asset${nAsset === 1 ? "" : "s"}.`);
  if (feat.settings.length) bits.push(`Reads ${feat.settings.length} setting${feat.settings.length === 1 ? "" : "s"}.`);
  if (feat.elements.length) bits.push(`Uses element${feat.elements.length === 1 ? "" : "s"} ${feat.elements.map((e) => `<${e}>`).join(", ")}.`);
  const evs = [...feat.events.emits, ...feat.events.listens];
  if (evs.length) {
    const parts = [];
    if (feat.events.emits.length) parts.push(`emits ${feat.events.emits.join(", ")}`);
    if (feat.events.listens.length) parts.push(`listens for ${feat.events.listens.join(", ")}`);
    bits.push(`Data flow: ${parts.join("; ")}.`);
  }
  return bits.join(" ");
}
