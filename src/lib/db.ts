import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "./paths";

/**
 * The only local state: QA sign-offs and an audit log. Everything else is derived
 * from GitHub. Kept in a single SQLite file (config.databasePath).
 */

let db: Database.Database | null = null;

function get(): Database.Database {
  if (db) return db;
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS qa_signoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staging_sha TEXT NOT NULL,
      user_login TEXT NOT NULL,
      signed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qa_sha ON qa_signoffs(staging_sha);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_login TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT,
      result_sha TEXT,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_secret INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

// ---- settings store (key/value, secret values pre-encrypted by caller) ------
export interface SettingRow {
  key: string;
  value: string;
  is_secret: number;
  updated_by: string | null;
  updated_at: string;
}

export function getSettingRow(key: string): SettingRow | undefined {
  return get().prepare(`SELECT * FROM settings WHERE key = ?`).get(key) as SettingRow | undefined;
}

export function upsertSettingRow(row: { key: string; value: string; isSecret: boolean; updatedBy: string; at: string }): void {
  get()
    .prepare(
      `INSERT INTO settings (key, value, is_secret, updated_by, updated_at)
       VALUES (@key, @value, @is_secret, @updated_by, @updated_at)
       ON CONFLICT(key) DO UPDATE SET value=@value, is_secret=@is_secret, updated_by=@updated_by, updated_at=@updated_at`
    )
    .run({ key: row.key, value: row.value, is_secret: row.isSecret ? 1 : 0, updated_by: row.updatedBy, updated_at: row.at });
}

export function deleteSettingRow(key: string): void {
  get().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

export interface QaSignoff {
  id: number;
  staging_sha: string;
  user_login: string;
  signed_at: string;
}

export function recordQaSignoff(stagingSha: string, userLogin: string, at: string): void {
  get()
    .prepare(`INSERT INTO qa_signoffs (staging_sha, user_login, signed_at) VALUES (?, ?, ?)`)
    .run(stagingSha, userLogin, at);
}

export function qaSignoffsFor(stagingSha: string): QaSignoff[] {
  return get()
    .prepare(`SELECT * FROM qa_signoffs WHERE staging_sha = ? ORDER BY signed_at DESC`)
    .all(stagingSha) as QaSignoff[];
}

export interface AuditEntry {
  id: number;
  user_login: string;
  action: string;
  target: string;
  detail: string | null;
  result_sha: string | null;
  at: string;
}

export function recordAudit(entry: {
  userLogin: string;
  action: string;
  target: string;
  detail?: string;
  resultSha?: string;
  at: string;
}): void {
  get()
    .prepare(
      `INSERT INTO audit_log (user_login, action, target, detail, result_sha, at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(entry.userLogin, entry.action, entry.target, entry.detail ?? null, entry.resultSha ?? null, entry.at);
}

export function recentAudit(limit = 50): AuditEntry[] {
  return get().prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`).all(limit) as AuditEntry[];
}
