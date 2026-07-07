import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveFromCwd, clonePath as clonePathFn, databasePath as databasePathFn } from "./paths";
import { getEffective, getDbSetting } from "./settings";

/**
 * Central config. Two tiers:
 *  - BOOTSTRAP (env only): things needed before the settings store exists —
 *    GITHUB_ORG (auth boundary), OAuth/NextAuth secrets (read in auth.config),
 *    SUPER_ADMIN_LOGINS, encryption key, db/clone paths.
 *  - OPERATIONAL (settings store → env fallback): repo/branches, GitHub App creds,
 *    Shopify reads, UI strings, theme map. The super-admin edits these in-app.
 */

export interface Person {
  name: string;
  color: string;
}
export interface ThemesConfig {
  branches: Record<string, { theme_id: number }>;
  people: Record<string, Person>;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env var: ${name}`);
  return v;
}

function requiredEffective(key: string, hint: string): string {
  const v = getEffective(key);
  if (!v) throw new Error(`Missing ${key} — set it in the app's Settings (${hint}).`);
  return v;
}

export function themes(): ThemesConfig {
  // In-app override (THEMES_YAML) wins; else the committed config/themes.yml.
  const override = getDbSetting("THEMES_YAML");
  let raw: string;
  if (override && override.trim() !== "") {
    raw = override;
  } else {
    const file = process.env.THEMES_CONFIG_PATH
      ? resolveFromCwd(process.env.THEMES_CONFIG_PATH)
      : path.join(process.cwd(), "config", "themes.yml");
    raw = fs.readFileSync(file, "utf8");
  }
  const parsed = parseYaml(raw) as ThemesConfig;
  if (!parsed?.branches?.live || !parsed?.branches?.staging) {
    throw new Error(`Theme map must define branches.live and branches.staging`);
  }
  return { branches: parsed.branches ?? {}, people: parsed.people ?? {} };
}

export function themeIdForBranch(branch: string): number | null {
  return themes().branches[branch]?.theme_id ?? null;
}

/** GitHub App private key: DB/env inline value first, then a PEM file path. */
export function githubAppPrivateKey(): string {
  const inline = getEffective("GITHUB_APP_PRIVATE_KEY");
  if (inline) return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  const p = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (p) return fs.readFileSync(resolveFromCwd(p), "utf8");
  throw new Error("Missing GitHub App private key — set it in the app's Settings, or GITHUB_APP_PRIVATE_KEY_PATH in .env");
}

export const config = {
  // ---- bootstrap (env only) ----
  get org() {
    return requiredEnv("GITHUB_ORG");
  },

  // ---- operational (settings → env) ----
  get owner() {
    return requiredEffective("GITHUB_OWNER", "Repo owner");
  },
  get repo() {
    return requiredEffective("GITHUB_REPO", "Theme repo name");
  },
  get liveBranch() {
    return getEffective("LIVE_BRANCH") ?? "live";
  },
  get stagingBranch() {
    return getEffective("STAGING_BRANCH") ?? "staging";
  },
  get appId() {
    return requiredEffective("GITHUB_APP_ID", "GitHub App ID");
  },
  get installationId() {
    return Number(requiredEffective("GITHUB_APP_INSTALLATION_ID", "Installation ID"));
  },
  get clonePath() {
    return clonePathFn();
  },
  get databasePath() {
    return databasePathFn();
  },
  get shopifyDomain() {
    return getEffective("SHOPIFY_STORE_DOMAIN") ?? "";
  },
  get shopifyToken() {
    return getEffective("SHOPIFY_ADMIN_API_TOKEN") ?? "";
  },
  get shopifyApiVersion() {
    return getEffective("SHOPIFY_API_VERSION") ?? "2025-01";
  },
  get devEmail() {
    return getEffective("DEV_EMAIL") ?? "developer@momentskis.com";
  },
  get storePublicDomain() {
    return getEffective("STORE_PUBLIC_DOMAIN") ?? "momentskis.com";
  },
};

export function personFor(login: string): Person {
  const p = themes().people[login.toLowerCase()];
  if (p) return p;
  return { name: login.charAt(0).toUpperCase() + login.slice(1), color: "#5C6B78" };
}
