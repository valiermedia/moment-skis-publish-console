import { NextResponse } from "next/server";
import { requireAdmin, nowISO } from "@/lib/guard";
import { settingsStatus, setSetting, clearSetting, FIELDS } from "@/lib/settings";
import { recordAudit } from "@/lib/db";
import { themes } from "@/lib/config";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { superAdminLogins } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN = new Set(FIELDS.map((f) => f.key));

/** GET: field metadata + status (secrets masked; secret values never returned). */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  let currentThemesYaml = "";
  try {
    currentThemesYaml = stringifyYaml(themes());
  } catch {
    currentThemesYaml = "";
  }
  return NextResponse.json({
    fields: settingsStatus(),
    currentThemesYaml,
    superAdmins: superAdminLogins(),
    admin: gate.user.login,
  });
}

/**
 * POST: update settings. Body: { updates: { KEY: value }, clear?: [KEY] }.
 * An empty-string value with the key in `clear` removes the override (falls back
 * to env). Secret values are encrypted by the settings layer. Every change is audited.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { login } = gate.user;

  let body: { updates?: Record<string, string>; clear?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates = body.updates ?? {};
  const clear = body.clear ?? [];
  const at = nowISO();
  const changed: string[] = [];

  // Validate the theme YAML before saving so a typo can't break the console.
  if (typeof updates.THEMES_YAML === "string" && updates.THEMES_YAML.trim() !== "") {
    try {
      const parsed = parseYaml(updates.THEMES_YAML) as { branches?: Record<string, unknown> };
      if (!parsed?.branches || typeof parsed.branches !== "object") {
        throw new Error("must have a top-level `branches:` map");
      }
    } catch (e) {
      return NextResponse.json({ error: `Theme map YAML is invalid: ${(e as Error).message}` }, { status: 400 });
    }
  }

  try {
    for (const [key, value] of Object.entries(updates)) {
      if (!KNOWN.has(key)) continue;
      if (typeof value !== "string" || value === "") continue; // empty = leave as-is (use clear to remove)
      setSetting(key, value, login, at);
      changed.push(key);
    }
    for (const key of clear) {
      if (!KNOWN.has(key)) continue;
      clearSetting(key);
      changed.push(`-${key}`);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  if (changed.length > 0) {
    recordAudit({
      userLogin: login,
      action: "update-settings",
      target: "settings",
      // never log secret values — only which keys changed
      detail: changed.join(", "),
      at,
    });
  }

  // sanity-check the theme map is still parseable after the write
  let themesOk = true;
  try {
    themes();
  } catch {
    themesOk = false;
  }

  return NextResponse.json({ ok: true, changed, themesOk, fields: settingsStatus() });
}
