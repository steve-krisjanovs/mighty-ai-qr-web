import { NextRequest, NextResponse } from 'next/server'
import { getOwner } from '@/lib/server/owner'
import { importLegacyConversations, importLegacyHistory } from '@/lib/server/storage'
import type { Conversation, HistoryItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

// One-time import of legacy localStorage data (v1.x) into the server-side DB.
// Idempotent — uses INSERT OR IGNORE so re-running is safe.
export async function POST(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const conversations: Conversation[] = Array.isArray(body.conversations) ? body.conversations : []
  const history: HistoryItem[] = Array.isArray(body.history) ? body.history : []

  importLegacyConversations(owner.id, owner.type, conversations)
  importLegacyHistory(owner.id, owner.type, history)

  return NextResponse.json({ ok: true, conversations: conversations.length, history: history.length })
}
