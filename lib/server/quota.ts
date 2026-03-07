import db from './db'

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT ?? '100', 10)

interface QuotaRow { date: string; count: number }

export function checkAndIncrementQuota(): { allowed: boolean; remaining: number } {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC

  db.prepare('INSERT OR IGNORE INTO daily_quota (date, count) VALUES (?, 0)').run(today)
  const row = db.prepare('SELECT count FROM daily_quota WHERE date = ?').get(today) as unknown as QuotaRow

  if (row.count >= FREE_DAILY_LIMIT) {
    return { allowed: false, remaining: 0 }
  }

  db.prepare('UPDATE daily_quota SET count = count + 1 WHERE date = ?').run(today)
  return { allowed: true, remaining: FREE_DAILY_LIMIT - row.count - 1 }
}
