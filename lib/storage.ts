import { v4 as uuidv4 } from 'uuid'
import type { HistoryItem, QrResult, Conversation, ChatMessage } from './types'

// ─── QR history ───────────────────────────────────────────────────────────────

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

export function deleteHistoryItem(id: string) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(loadHistory().filter(i => i.id !== id)))
}

export function renameHistoryItem(id: string, newName: string) {
  const updated = loadHistory().map(i => {
    if (i.id !== id) return i
    return { ...i, presetName: newName, qr: { ...i.qr, presetName: newName } }
  })
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
}

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

export function upsertConversation(conv: Conversation) {
  const all = loadConversations()
  const idx = all.findIndex(c => c.id === conv.id)
  if (idx >= 0) all[idx] = conv
  else all.unshift(conv)
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  saveConversations(all)
}

export function deleteConversation(id: string) {
  saveConversations(loadConversations().filter(c => c.id !== id))
}

export function clearAllConversations() {
  localStorage.removeItem(CONV_KEY)
}

export function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY)
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

// ─── API Settings (BYOK) ──────────────────────────────────────────────────────

const SETTINGS_KEY = 'maq_settings'

export type AiProvider = 'builtin' | 'anthropic' | 'openai' | 'gemini' | 'grok' | 'mistral' | 'groq' | 'ollama' | 'openwebui' | 'lmstudio'

export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface ApiSettings {
  provider: AiProvider
  configs: Partial<Record<AiProvider, ProviderConfig>>
}

export function getApiSettings(): ApiSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (!raw) return null
    // Migrate old flat format
    if (raw.provider && 'apiKey' in raw && !raw.configs) {
      return { provider: raw.provider as AiProvider, configs: { [raw.provider]: { apiKey: raw.apiKey, baseUrl: raw.baseUrl } } } as ApiSettings
    }
    return raw as ApiSettings
  } catch { return null }
}

export function saveApiSettings(s: ApiSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function getActiveConfig(): { provider: AiProvider; apiKey: string; baseUrl?: string; model?: string } | null {
  const s = getApiSettings()
  if (!s) return null
  const config = s.configs[s.provider] ?? { apiKey: '' }
  return { provider: s.provider, apiKey: config.apiKey ?? '', baseUrl: config.baseUrl, model: config.model }
}

export function clearApiSettings() {
  localStorage.removeItem(SETTINGS_KEY)
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'oled' | 'light' | 'tweed' | 'amber' | 'british' | 'oxblood' | 'silver' | 'pedalboard' | 'blackface' | 'plexi'

const THEME_KEY = 'maq_theme'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(THEME_KEY) as Theme) ?? 'dark'
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
}
