import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data/mighty.db')

// Skip DB initialisation during Next.js build phase — routes are force-dynamic
// and will never execute their handlers at build time, but the module is still
// imported for static analysis which would otherwise throw on Render's build env.
let db: DatabaseSync

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
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

    CREATE TABLE IF NOT EXISTS web_search_cache (
      query      TEXT PRIMARY KEY,
      result     TEXT NOT NULL,
      cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

export default db!
