#!/usr/bin/env node
// refresh-architecture.mjs — regenerate data/architecture/*.json for every branch.
//
// Deterministic + free (no LLM, no API). Read-only over theme code: it fetches the
// theme repo into a local clone, checks out each branch, statically analyzes the
// working tree, and writes JSON. It NEVER writes to any theme or branch.
//
// Run it via ./refresh-architecture.sh (which sets git auth), then commit the JSON
// and deploy. Safe to wire into cron later.
//
// Env:
//   ARCH_REMOTE     git remote for the theme repo (default git@github.com:moment-skis/moment-theme.git)
//   ARCH_CLONE_PATH local clone dir (default ./data/arch-repo)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { analyzeTheme } from "./scripts/architecture/analyze.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REMOTE = process.env.ARCH_REMOTE || "git@github.com:moment-skis/moment-theme.git";
const CLONE = path.resolve(process.env.ARCH_CLONE_PATH || path.join(ROOT, "data", "arch-repo"));
const OUT = path.join(ROOT, "data", "architecture");
const now = new Date().toISOString();

function git(args, cwd = CLONE) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ensureClone() {
  if (!fs.existsSync(path.join(CLONE, ".git"))) {
    fs.mkdirSync(path.dirname(CLONE), { recursive: true });
    console.log(`Cloning ${REMOTE} → ${CLONE}`);
    execFileSync("git", ["clone", "--no-single-branch", REMOTE, CLONE], { stdio: "inherit" });
  } else {
    console.log(`Fetching latest into ${CLONE}`);
    git(["fetch", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
  }
}

function checkout(branch) {
  git(["checkout", "-f", "-B", branch, `origin/${branch}`]);
  git(["clean", "-fd"]); // drop any stray files so the tree is exactly the branch
}

function loadThemes() {
  const raw = fs.readFileSync(path.join(ROOT, "config", "themes.yml"), "utf8");
  const cfg = parseYaml(raw);
  return { branches: cfg.branches || {}, people: cfg.people || {} };
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function buildPipeline({ branches, people }) {
  const personIds = Object.keys(people); // merritt, luke, max
  const has = (b) => Object.prototype.hasOwnProperty.call(branches, b);
  const nodes = [];
  const push = (id, tier) =>
    nodes.push({
      id,
      branch: id,
      tier,
      label: people[id]?.name || id.charAt(0).toUpperCase() + id.slice(1),
      color: people[id]?.color || null,
      themeId: branches[id]?.theme_id ?? null,
    });
  for (const p of personIds) if (has(p)) push(p, "person");
  if (has("staging")) push("staging", "staging");
  if (has("live")) push("live", "live");
  const edges = [];
  for (const p of personIds) if (has(p) && has("staging")) edges.push({ from: p, to: "staging" });
  if (has("staging") && has("live")) edges.push({ from: "staging", to: "live" });
  return { analyzedAt: now, nodes, edges };
}

async function main() {
  const themes = loadThemes();
  const allBranches = Object.keys(themes.branches);
  ensureClone();

  for (const branch of allBranches) {
    process.stdout.write(`Analyzing ${branch}… `);
    try {
      checkout(branch);
    } catch (e) {
      console.log(`skip (no origin/${branch}: ${String(e.message).split("\n")[0]})`);
      continue;
    }
    const result = analyzeTheme(CLONE, { branch, themeId: themes.branches[branch]?.theme_id ?? null });
    result.analyzedAt = now;
    writeJson(path.join(OUT, `${branch}.json`), result);
    console.log(`${result.counts.features} features, ${result.counts.edges} edges → data/architecture/${branch}.json`);
  }

  writeJson(path.join(OUT, "pipeline.json"), buildPipeline(themes));
  console.log(`Wrote data/architecture/pipeline.json`);
  console.log(`\nDone. Commit data/architecture/*.json and deploy to publish the map.`);
}

main().catch((e) => {
  console.error("refresh-architecture failed:", e);
  process.exit(1);
});
