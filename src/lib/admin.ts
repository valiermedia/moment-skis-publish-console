/**
 * Super-admin = the GitHub login(s) allowed to manage operational settings in-app.
 * Configured via SUPER_ADMIN_LOGINS (comma-separated, case-insensitive); defaults
 * to "valiermedia". This is bootstrap config (env only) — it defines who can change
 * everything else, so it must not be self-editable.
 */
export function superAdminLogins(): string[] {
  const raw = process.env.SUPER_ADMIN_LOGINS?.trim() || "valiermedia";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(login: string): boolean {
  if (!login) return false;
  return superAdminLogins().includes(login.toLowerCase());
}
