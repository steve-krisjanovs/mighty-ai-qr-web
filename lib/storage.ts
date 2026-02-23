import { v4 as uuidv4 } from 'uuid'
import type { HistoryItem, QrResult, Conversation, ChatMessage } from './types'

// ─── QR history (kept for backwards compat) ──────────────────────────────────

const HISTORY_KEY = 'qr_history'

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

export function saveToHistory(qr: QrResult): HistoryItem {
  const item: HistoryItem = { id: uuidv4(), presetName: qr.presetName, deviceName: qr.deviceName, imageBase64: qr.imageBase64, timestamp: Date.now(), qr }
  localStorage.setItem(HISTORY_KEY, JSON.stringify([item, ...loadHistory()].slice(0, 20)))
  return item
}

export function clearHistory() { localStorage.removeItem(HISTORY_KEY) }

// ─── Conversations ────────────────────────────────────────────────────────────

const CONV_KEY = 'maq_conversations'
const MAX_CONVERSATIONS = 50

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CONV_KEY) ?? '[]') } catch { return [] }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(CONV_KEY, JSON.stringify(convs.slice(0, MAX_CONVERSATIONS)))
}

export function createConversation(): Conversation {
  return { id: uuidv4(), title: 'New chat', messages: [], lastQr: null, createdAt: Date.now(), updatedAt: Date.now() }
}

export function upsertConversation(conv: Conversation) {
  const all = loadConversations()
  const idx = all.findIndex(c => c.id === conv.id)
  if (idx >= 0) all[idx] = conv
  else all.unshift(conv)
  // keep sorted newest first
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  saveConversations(all)
}

export function deleteConversation(id: string) {
  saveConversations(loadConversations().filter(c => c.id !== id))
}

export function autoTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user')?.content ?? 'New chat'
  return first.length > 42 ? first.slice(0, 42).trimEnd() + '…' : first
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ts).toLocaleDateString()
}
