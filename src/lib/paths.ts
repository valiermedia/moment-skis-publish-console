import path from "node:path";

/**
 * Bootstrap path/env helpers with NO dependency on config/settings/db — this
 * breaks the cycle (db needs a path; settings need db; config reads settings).
 * These are always env-only (they must resolve before the settings store exists).
 */
export function resolveFromCwd(p: string): string {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function envOrDefault(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

export function databasePath(): string {
  return resolveFromCwd(envOrDefault("DATABASE_PATH", "./data/console.db"));
}

export function clonePath(): string {
  return resolveFromCwd(envOrDefault("REPO_CLONE_PATH", "./data/repo"));
}
