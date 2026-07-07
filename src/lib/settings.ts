import { getSettingRow, upsertSettingRow, deleteSettingRow } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";

/**
 * Runtime-managed settings. The super-admin edits these in-app; they're stored in
 * sqlite (secrets AES-encrypted) and OVERRIDE the matching env var. Bootstrap values
 * (NEXTAUTH_*, AUTH_GITHUB_*, GITHUB_ORG, SUPER_ADMIN_LOGINS, SETTINGS_ENCRYPTION_KEY,
 * DATABASE_PATH, REPO_CLONE_PATH) are deliberately NOT here — they must live in .env
 * because they're needed before a session/settings store exists (no self-lockout).
 */

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  secret?: boolean;
  multiline?: boolean;
  placeholder?: string;
  help?: string;
}

export const FIELDS: FieldDef[] = [
  // GitHub repository
  { key: "GITHUB_OWNER", label: "Repo owner (org/user)", group: "GitHub repository", placeholder: "moment-skis" },
  { key: "GITHUB_REPO", label: "Theme repo name", group: "GitHub repository", placeholder: "moment-skis-theme" },
  { key: "LIVE_BRANCH", label: "Live branch", group: "GitHub repository", placeholder: "live" },
  { key: "STAGING_BRANCH", label: "Staging branch", group: "GitHub repository", placeholder: "staging" },

  // GitHub App (writes)
  { key: "GITHUB_APP_ID", label: "GitHub App ID", group: "GitHub App (writes)", placeholder: "123456" },
  { key: "GITHUB_APP_INSTALLATION_ID", label: "Installation ID", group: "GitHub App (writes)", placeholder: "987654" },
  {
    key: "GITHUB_APP_PRIVATE_KEY",
    label: "App private key (PEM)",
    group: "GitHub App (writes)",
    secret: true,
    multiline: true,
    placeholder: "-----BEGIN RSA PRIVATE KEY-----\n…",
    help: "Paste the .pem contents. Stored encrypted.",
  },

  // Shopify (read-only)
  { key: "SHOPIFY_STORE_DOMAIN", label: "Store domain", group: "Shopify (read-only)", placeholder: "moment-skis.myshopify.com" },
  {
    key: "SHOPIFY_ADMIN_API_TOKEN",
    label: "Admin API token (read scope)",
    group: "Shopify (read-only)",
    secret: true,
    placeholder: "shpat_…",
    help: "read_themes scope only. Stored encrypted.",
  },
  { key: "SHOPIFY_API_VERSION", label: "API version", group: "Shopify (read-only)", placeholder: "2025-01" },

  // Store / UI
  { key: "STORE_PUBLIC_DOMAIN", label: "Public store domain", group: "Store / UI", placeholder: "momentskis.com" },
  { key: "DEV_EMAIL", label: "Developer email (Ask your developer)", group: "Store / UI", placeholder: "developer@momentskis.com" },

  // Theme map
  {
    key: "THEMES_YAML",
    label: "Branch → Shopify theme map (YAML)",
    group: "Theme map",
    multiline: true,
    help: "Overrides config/themes.yml. branches: { live: { theme_id: N }, … } and people: { login: { name, color } }.",
  },
];

const SECRET_KEYS = new Set(FIELDS.filter((f) => f.secret).map((f) => f.key));
const KNOWN_KEYS = new Set(FIELDS.map((f) => f.key));

/** Decrypted DB value for a managed key, or null if unset in DB. */
export function getDbSetting(key: string): string | null {
  const row = getSettingRow(key);
  if (!row) return null;
  return row.is_secret ? decryptSecret(row.value) : row.value;
}

/** Effective value: DB override → env fallback → null. */
export function getEffective(key: string): string | null {
  const db = getDbSetting(key);
  if (db !== null && db !== "") return db;
  const env = process.env[key];
  return env && env.trim() !== "" ? env : null;
}

export function setSetting(key: string, rawValue: string, updatedBy: string, at: string): void {
  if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown setting: ${key}`);
  const secret = SECRET_KEYS.has(key);
  const value = secret ? encryptSecret(rawValue) : rawValue;
  upsertSettingRow({ key, value, isSecret: secret, updatedBy, at });
}

export function clearSetting(key: string): void {
  if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown setting: ${key}`);
  deleteSettingRow(key);
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

export interface FieldStatus extends FieldDef {
  source: "db" | "env" | "unset";
  isSet: boolean;
  // Non-secret current effective value shown in the UI; secrets never leave the server.
  value: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Status for the admin UI. Secret values are masked to null; never returned. */
export function settingsStatus(): FieldStatus[] {
  return FIELDS.map((f) => {
    const row = getSettingRow(f.key);
    const envSet = Boolean(process.env[f.key] && process.env[f.key]!.trim() !== "");
    const source: "db" | "env" | "unset" = row ? "db" : envSet ? "env" : "unset";
    const isSet = source !== "unset";
    let value: string | null = null;
    if (!f.secret && isSet) {
      value = row ? (row.is_secret ? null : row.value) : (process.env[f.key] ?? null);
    }
    return {
      ...f,
      source,
      isSet,
      value,
      updatedBy: row?.updated_by ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}
