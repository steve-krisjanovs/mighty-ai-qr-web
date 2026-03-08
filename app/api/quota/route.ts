export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import db from '@/lib/server/db'

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT ?? '100', 10)

interface QuotaRow { count: number }

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)
  const row = db.prepare('SELECT count FROM daily_quota WHERE date = ?').get(today) as unknown as QuotaRow | undefined
  const used = row?.count ?? 0
  const remaining = Math.max(0, FREE_DAILY_LIMIT - used)
  return NextResponse.json({ remaining, limit: FREE_DAILY_LIMIT })
}
