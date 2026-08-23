import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type LeadRecord = {
  name: string;
  company: string;
  email: string;
  phone: string | null;
  service: string;
  seats: string | null;
  message: string;
  sourcePage: string | null;
  userAgent: string | null;
};

let db: Database.Database | null = null;

/**
 * Lazily open the SQLite database. Deferred rather than opened at module load
 * so that `next build` never touches the filesystem while prerendering.
 */
function getDb(): Database.Database {
  if (db) return db;

  const dbPath =
    process.env.CLOUDPATHWAY_DB_PATH ?? path.join(process.cwd(), "data", "cloudpathway.db");

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      company      TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone        TEXT,
      service      TEXT NOT NULL,
      seats        TEXT,
      message      TEXT NOT NULL,
      source_page  TEXT,
      user_agent   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
  `);

  return db;
}

export function insertLead(lead: LeadRecord): number {
  const result = getDb()
    .prepare(
      `INSERT INTO leads (name, company, email, phone, service, seats, message, source_page, user_agent)
       VALUES (@name, @company, @email, @phone, @service, @seats, @message, @sourcePage, @userAgent)`,
    )
    .run(lead);
  return Number(result.lastInsertRowid);
}

/** Count submissions from one email in the trailing window — used for basic abuse throttling. */
export function recentLeadCount(email: string, windowMinutes = 10): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM leads
       WHERE email = ? AND created_at >= datetime('now', ?)`,
    )
    .get(email, `-${windowMinutes} minutes`) as { count: number };
  return row.count;
}
