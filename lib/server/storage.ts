import db from './db'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation, HistoryItem, QrResult, ChatMessage } from '../types'

type OwnerType = 'device' | 'user'

// ─── Conversations ────────────────────────────────────────────────────────────

export function loadConversations(ownerId: string, ownerType: OwnerType): Conversation[] {
  const rows = db.prepare(
    'SELECT id, title, messages, last_qr, created_at, updated_at FROM conversations WHERE owner_id = ? AND owner_type = ? ORDER BY updated_at DESC LIMIT 50'
  ).all(ownerId, ownerType) as { id: string; title: string; messages: string; last_qr: string | null; created_at: number; updated_at: number }[]

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    messages: JSON.parse(r.messages) as ChatMessage[],
    lastQr: r.last_qr ? JSON.parse(r.last_qr) as QrResult : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export function upsertConversation(ownerId: string, ownerType: OwnerType, conv: Conversation): void {
  db.prepare(`
    INSERT INTO conversations (id, owner_id, owner_type, title, messages, last_qr, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      messages = excluded.messages,
      last_qr = excluded.last_qr,
      updated_at = excluded.updated_at
  `).run(
    conv.id, ownerId, ownerType,
    conv.title,
    JSON.stringify(conv.messages),
    conv.lastQr ? JSON.stringify(conv.lastQr) : null,
    conv.createdAt,
    conv.updatedAt,
  )
}

export function deleteConversation(ownerId: string, ownerType: OwnerType, id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ? AND owner_id = ? AND owner_type = ?').run(id, ownerId, ownerType)
}

export function clearAllConversations(ownerId: string, ownerType: OwnerType): void {
  db.prepare('DELETE FROM conversations WHERE owner_id = ? AND owner_type = ?').run(ownerId, ownerType)
}

// ─── QR History ───────────────────────────────────────────────────────────────

export function loadHistory(ownerId: string, ownerType: OwnerType): HistoryItem[] {
  const rows = db.prepare(
    'SELECT id, preset_name, device_name, image_base64, qr_data, timestamp FROM qr_history WHERE owner_id = ? AND owner_type = ? ORDER BY timestamp DESC LIMIT 20'
  ).all(ownerId, ownerType) as { id: string; preset_name: string; device_name: string; image_base64: string; qr_data: string; timestamp: number }[]

  return rows.map(r => ({
    id: r.id,
    presetName: r.preset_name,
    deviceName: r.device_name,
    imageBase64: r.image_base64,
    timestamp: r.timestamp,
    qr: JSON.parse(r.qr_data) as QrResult,
  }))
}

export function saveToHistory(ownerId: string, ownerType: OwnerType, qr: QrResult): HistoryItem {
  const item: HistoryItem = {
    id: uuidv4(),
    presetName: qr.presetName,
    deviceName: qr.deviceName,
    imageBase64: qr.imageBase64,
    timestamp: Date.now(),
    qr,
  }
  db.prepare(`
    INSERT INTO qr_history (id, owner_id, owner_type, preset_name, device_name, image_base64, qr_data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, ownerId, ownerType, item.presetName, item.deviceName, item.imageBase64, JSON.stringify(qr), item.timestamp)

  // Keep max 20 per owner
  db.prepare(`
    DELETE FROM qr_history WHERE owner_id = ? AND owner_type = ? AND id NOT IN (
      SELECT id FROM qr_history WHERE owner_id = ? AND owner_type = ? ORDER BY timestamp DESC LIMIT 20
    )
  `).run(ownerId, ownerType, ownerId, ownerType)

  return item
}

export function deleteHistoryItem(ownerId: string, ownerType: OwnerType, id: string): void {
  db.prepare('DELETE FROM qr_history WHERE id = ? AND owner_id = ? AND owner_type = ?').run(id, ownerId, ownerType)
}

export function renameHistoryItem(ownerId: string, ownerType: OwnerType, id: string, newName: string): void {
  const row = db.prepare('SELECT qr_data FROM qr_history WHERE id = ? AND owner_id = ? AND owner_type = ?').get(id, ownerId, ownerType) as { qr_data: string } | undefined
  if (!row) return
  const qr = JSON.parse(row.qr_data) as QrResult
  qr.presetName = newName
  db.prepare('UPDATE qr_history SET preset_name = ?, qr_data = ? WHERE id = ? AND owner_id = ? AND owner_type = ?')
    .run(newName, JSON.stringify(qr), id, ownerId, ownerType)
}

export function clearAllHistory(ownerId: string, ownerType: OwnerType): void {
  db.prepare('DELETE FROM qr_history WHERE owner_id = ? AND owner_type = ?').run(ownerId, ownerType)
}

// ─── Migration: claim device data under a user account ───────────────────────

export function claimDeviceData(deviceId: string, userId: string): void {
  db.prepare("UPDATE conversations SET owner_id = ?, owner_type = 'user' WHERE owner_id = ? AND owner_type = 'device'")
    .run(userId, deviceId)
  db.prepare("UPDATE qr_history SET owner_id = ?, owner_type = 'user' WHERE owner_id = ? AND owner_type = 'device'")
    .run(userId, deviceId)
}

// ─── Legacy localStorage import ──────────────────────────────────────────────

export function importLegacyConversations(ownerId: string, ownerType: OwnerType, convs: Conversation[]): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO conversations (id, owner_id, owner_type, title, messages, last_qr, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const conv of convs) {
    insert.run(
      conv.id, ownerId, ownerType,
      conv.title,
      JSON.stringify(conv.messages),
      conv.lastQr ? JSON.stringify(conv.lastQr) : null,
      conv.createdAt,
      conv.updatedAt,
    )
  }
}

export function importLegacyHistory(ownerId: string, ownerType: OwnerType, items: HistoryItem[]): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO qr_history (id, owner_id, owner_type, preset_name, device_name, image_base64, qr_data, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of items) {
    insert.run(item.id, ownerId, ownerType, item.presetName, item.deviceName, item.imageBase64, JSON.stringify(item.qr), item.timestamp)
  }
}
