import { config, themeIdForBranch } from "./config";

/**
 * READ-ONLY Shopify Admin API. There is NO publish code path anywhere in this app.
 * The token is read scope (read_themes) and is used only to:
 *   - read a theme's preview URL (QA)
 *   - read the live theme's version/name (the "Live now" display)
 *
 * If Shopify isn't configured, these return null and the UI degrades gracefully
 * (it still works off GitHub state — Shopify is only cosmetic/QA-preview here).
 */

function configured(): boolean {
  return Boolean(config.shopifyDomain && config.shopifyToken);
}

async function adminGet<T>(pathname: string): Promise<T | null> {
  if (!configured()) return null;
  const url = `https://${config.shopifyDomain}/admin/api/${config.shopifyApiVersion}/${pathname}`;
  const res = await fetch(url, {
    method: "GET", // reads only — never POST/PUT to themes
    headers: {
      "X-Shopify-Access-Token": config.shopifyToken,
      "Content-Type": "application/json",
    },
    // don't cache theme reads for long; the live version can change out of band
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface ThemeInfo {
  id: number;
  name: string;
  role: string;
  updated_at: string;
  previewUrl: string | null;
}

interface RawTheme {
  id: number;
  name: string;
  role: string;
  updated_at: string;
}

/** Preview URL for a theme id (QA). */
export function themePreviewUrl(themeId: number): string {
  // Standard Shopify theme preview deep-link on the storefront.
  return `https://${config.shopifyDomain}?preview_theme_id=${themeId}`;
}

/** Read a single theme's info by id (name, role, updated_at). */
export async function readTheme(themeId: number): Promise<ThemeInfo | null> {
  const data = await adminGet<{ theme: RawTheme }>(`themes/${themeId}.json`);
  if (!data?.theme) return null;
  const t = data.theme;
  return {
    id: t.id,
    name: t.name,
    role: t.role,
    updated_at: t.updated_at,
    previewUrl: themePreviewUrl(t.id),
  };
}

/** The live theme's info, read from the theme mapped to the live branch. */
export async function readLiveTheme(): Promise<ThemeInfo | null> {
  const id = themeIdForBranch(config.liveBranch);
  if (!id) return null;
  return readTheme(id);
}

/** Preview URL for the staging theme (QA Review). */
export function stagingPreviewUrl(): string | null {
  const id = themeIdForBranch(config.stagingBranch);
  return id ? themePreviewUrl(id) : null;
}
