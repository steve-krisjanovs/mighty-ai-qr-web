import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data/mighty.db')

// Skip DB initialisation during Next.js build phase — routes are force-dynamic
// and will never execute their handlers at build time, but the module is still
// imported for static analysis which would otherwise throw on Render's build env.
let db: Database.Database

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id               TEXT PRIMARY KEY,
      generations_used        INTEGER NOT NULL DEFAULT 0,
      has_active_subscription INTEGER NOT NULL DEFAULT 0,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_quota (
      date  TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      tag        TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id           TEXT PRIMARY KEY,
      owner_id     TEXT NOT NULL,
      owner_type   TEXT NOT NULL CHECK(owner_type IN ('device', 'user')),
      title        TEXT NOT NULL DEFAULT 'New chat',
      messages     TEXT NOT NULL DEFAULT '[]',
      last_qr      TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_id, owner_type);

    CREATE TABLE IF NOT EXISTS qr_history (
      id           TEXT PRIMARY KEY,
      owner_id     TEXT NOT NULL,
      owner_type   TEXT NOT NULL CHECK(owner_type IN ('device', 'user')),
      preset_name  TEXT NOT NULL,
      device_name  TEXT NOT NULL,
      image_base64 TEXT NOT NULL,
      qr_data      TEXT NOT NULL,
      timestamp    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_qr_history_owner ON qr_history(owner_id, owner_type);

    INSERT OR IGNORE INTO schema_migrations (tag) VALUES ('1.5.2_baseline');

    -- v1.6.0: drop web_search_cache (Tavily replaced by Anthropic native search)
    DROP TABLE IF EXISTS web_search_cache;
    INSERT OR IGNORE INTO schema_migrations (tag) VALUES ('1.6.0_drop_web_search_cache');

    -- v2.0.0: conversations + qr_history moved server-side; better-sqlite3 driver
    INSERT OR IGNORE INTO schema_migrations (tag) VALUES ('2.0.0_server_side_storage');
  `)
}

export default db!
