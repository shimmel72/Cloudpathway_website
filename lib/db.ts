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

  // Cached only once the schema is in place. If any step throws (disk full, a
  // read-only directory), the next request retries from scratch instead of
  // being handed a handle with no tables, which would fail every query until
  // the service restarted.
  const handle = new Database(dbPath);
  try {
    initSchema(handle);
  } catch (err) {
    handle.close();
    throw err;
  }
  db = handle;
  return db;
}

function initSchema(handle: Database.Database): void {
  handle.pragma("journal_mode = WAL");
  handle.exec(`
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
      mail_status  TEXT,
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

  // Columns added after the first release. The schema only ever gains
  // columns, so an older release still reads a database a newer one touched.
  const leadColumns = handle.prepare("PRAGMA table_info(leads)").all() as { name: string }[];
  if (!leadColumns.some((c) => c.name === "mail_status")) {
    handle.exec("ALTER TABLE leads ADD COLUMN mail_status TEXT");
  }
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

/**
 * Notification emails sent in the trailing window, across both forms — rows
 * whose mail_status shows an attempt (not "not sent: …"). Feeds the hourly cap
 * in lib/notify.ts. Table names are constants, never input.
 */
export function recentNotificationCount(windowMinutes = 60): number {
  const conn = getDb();
  const count = (table: "leads" | "reseller_applications") =>
    (conn
      .prepare(
        `SELECT COUNT(*) AS count FROM ${table}
         WHERE created_at >= datetime('now', ?) AND mail_status IS NOT NULL AND mail_status NOT LIKE 'not sent%'`,
      )
      .get(`-${windowMinutes} minutes`) as { count: number }).count;
  return count("leads") + count("reseller_applications");
}

/** What happened to a signup's notification email: the provider's id, or why it was not sent. */
export function setLeadMailStatus(id: number, status: string): void {
  getDb()
    .prepare("UPDATE leads SET mail_status = ? WHERE id = ?")
    .run(status.slice(0, 500), id);
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

/* ------------------------------------------------------------------------ */
/* Health                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Prove the database can actually be written, not merely opened.
 *
 * Opening succeeds on a read-only file; the failure only arrives with the first
 * lead. Under systemd's ProtectSystem=strict a data directory missing from
 * ReadWritePaths is exactly that — the site renders, the health check says
 * "ok", and every form submission 500s. So this writes a row.
 */
export function dbHealth(): { ok: boolean; path: string; error?: string } {
  const dbPath =
    process.env.CLOUDPATHWAY_DB_PATH ?? path.join(process.cwd(), "data", "cloudpathway.db");
  try {
    const conn = getDb();
    conn.exec("CREATE TABLE IF NOT EXISTS _health (id INTEGER PRIMARY KEY CHECK (id = 1), at TEXT NOT NULL)");
    conn.prepare("INSERT OR REPLACE INTO _health (id, at) VALUES (1, datetime('now'))").run();
    return { ok: true, path: dbPath };
  } catch (error) {
    return { ok: false, path: dbPath, error: error instanceof Error ? error.message : String(error) };
  }
}
