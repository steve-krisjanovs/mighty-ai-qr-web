import { NextRequest, NextResponse } from 'next/server'
import { getOwner } from '@/lib/server/owner'
import {
  loadHistory,
  saveToHistory,
  deleteHistoryItem,
  renameHistoryItem,
  clearAllHistory,
} from '@/lib/server/storage'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(loadHistory(owner.id, owner.type))
}

export async function POST(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const qr = await request.json()
  const item = saveToHistory(owner.id, owner.type, qr)
  return NextResponse.json(item)
}

export async function PATCH(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, newName } = await request.json()
  renameHistoryItem(owner.id, owner.type, id, newName)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const owner = await getOwner(request)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    deleteHistoryItem(owner.id, owner.type, id)
  } else {
    clearAllHistory(owner.id, owner.type)
  }
  return NextResponse.json({ ok: true })
}
