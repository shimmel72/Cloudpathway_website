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

    CREATE TABLE IF NOT EXISTS reseller_applications (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name      TEXT NOT NULL,
      website           TEXT,
      contact_name      TEXT NOT NULL,
      contact_email     TEXT NOT NULL,
      contact_phone     TEXT,
      brand_name        TEXT,
      support_email     TEXT,
      support_phone     TEXT,
      business_type     TEXT NOT NULL,
      current_customers TEXT,
      expected_seats    TEXT,
      sells_voice_today TEXT NOT NULL,
      territory         TEXT,
      notes             TEXT NOT NULL,
      source_page       TEXT,
      user_agent        TEXT,
      mail_status       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_apps_created_at ON reseller_applications (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_apps_email ON reseller_applications (contact_email);
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

/* ------------------------------------------------------------------------ */
/* Reseller applications                                                    */
/* ------------------------------------------------------------------------ */

export type ResellerApplicationRecord = {
  companyName: string;
  website: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  brandName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  businessType: string;
  currentCustomers: string | null;
  expectedSeats: string | null;
  sellsVoiceToday: string;
  territory: string | null;
  notes: string;
  sourcePage: string | null;
  userAgent: string | null;
};

export function insertResellerApplication(app: ResellerApplicationRecord): number {
  const result = getDb()
    .prepare(
      `INSERT INTO reseller_applications
         (company_name, website, contact_name, contact_email, contact_phone,
          brand_name, support_email, support_phone, business_type, current_customers,
          expected_seats, sells_voice_today, territory, notes, source_page, user_agent)
       VALUES
         (@companyName, @website, @contactName, @contactEmail, @contactPhone,
          @brandName, @supportEmail, @supportPhone, @businessType, @currentCustomers,
          @expectedSeats, @sellsVoiceToday, @territory, @notes, @sourcePage, @userAgent)`,
    )
    .run(app);
  return Number(result.lastInsertRowid);
}

/**
 * Records what happened to the notification email.
 *
 * Kept on the row rather than only in the log, so an application whose email
 * failed can be found later. The application itself is never rejected because
 * mail is down — the row is committed first.
 */
export function setApplicationMailStatus(id: number, status: string): void {
  getDb()
    .prepare("UPDATE reseller_applications SET mail_status = ? WHERE id = ?")
    .run(status.slice(0, 500), id);
}

/** Submissions from one email in the trailing window — basic abuse throttling. */
export function recentApplicationCount(email: string, windowMinutes = 30): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM reseller_applications
       WHERE contact_email = ? AND created_at >= datetime('now', ?)`,
    )
    .get(email, `-${windowMinutes} minutes`) as { count: number };
  return row.count;
}
