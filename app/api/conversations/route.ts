import { NextRequest, NextResponse } from 'next/server'
import { getOwner } from '@/lib/server/owner'
import {
  loadConversations,
  upsertConversation,
  deleteConversation,
  clearAllConversations,
} from '@/lib/server/storage'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(loadConversations(owner.id, owner.type))
}

export async function POST(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const conv = await request.json()
  upsertConversation(owner.id, owner.type, conv)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    deleteConversation(owner.id, owner.type, id)
  } else {
    clearAllConversations(owner.id, owner.type)
  }
  return NextResponse.json({ ok: true })
}
