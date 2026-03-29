import { v4 as uuidv4 } from 'uuid'
import type { HistoryItem, QrResult, Conversation, ChatMessage } from './types'

// ─── QR history ───────────────────────────────────────────────────────────────

const HISTORY_KEY = 'qr_history'

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const items: HistoryItem[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    let dirty = false
    for (const item of items) {
      if (!item.deviceName && item.qr?.deviceName) {
        item.deviceName = item.qr.deviceName
        dirty = true
      }
    }
    if (dirty) localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
    return items
  } catch { return [] }
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

export type AiProvider = 'builtin' | 'anthropic'

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

// ─── Default NUX Device ───────────────────────────────────────────────────────

export type NuxDevice = 'plugpro' | 'space' | 'litemk2' | '8btmk2' | 'mightyair_v1' | 'mightyair_v2' | 'plugair_v1' | 'plugair_v2' | 'lite' | '8bt' | '2040bt'

export const NUX_DEVICES: { id: NuxDevice; label: string }[] = [
  { id: 'plugpro',      label: 'Mighty Plug Pro' },
  { id: 'space',        label: 'Mighty Space' },
  { id: 'litemk2',     label: 'Mighty Lite MkII' },
  { id: '8btmk2',      label: 'Mighty 8BT MkII' },
  { id: 'mightyair_v1', label: 'Mighty Air (v1)' },
  { id: 'mightyair_v2', label: 'Mighty Air (v2)' },
  { id: 'plugair_v1',  label: 'Mighty Plug (v1)' },
  { id: 'plugair_v2',  label: 'Mighty Plug (v2)' },
  { id: 'lite',       label: 'Mighty Lite BT' },
  { id: '8bt',        label: 'Mighty 8BT' },
  { id: '2040bt',     label: 'Mighty 20/40BT' },
]

const DEVICE_KEY = 'maq_default_device'

export function getDefaultDevice(): NuxDevice {
  if (typeof window === 'undefined') return 'plugpro'
  const stored = localStorage.getItem(DEVICE_KEY)
  const valid = NUX_DEVICES.find(d => d.id === stored)
  return valid ? (stored as NuxDevice) : 'plugpro'
}

export function saveDefaultDevice(device: NuxDevice) {
  localStorage.setItem(DEVICE_KEY, device)
}

// ─── Welcome splash (shown once per version) ──────────────────────────────────

const WELCOME_KEY = 'maq_welcome_seen'

export function getWelcomeSeen(version: string): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(WELCOME_KEY) === version
}

export function saveWelcomeSeen(version: string) {
  localStorage.setItem(WELCOME_KEY, version)
}

// ─── Hint dismissed ───────────────────────────────────────────────────────────

const HINT_KEY = 'maq_hint_dismissed'

export function getHintDismissed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(HINT_KEY) === 'true'
}

export function saveHintDismissed(v: boolean) {
  localStorage.setItem(HINT_KEY, v ? 'true' : 'false')
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'oled' | 'light' | 'tweed' | 'amber' | 'british' | 'oxblood' | 'silver' | 'pedalboard' | 'blackface' | 'plexi' | 'tweed-lt' | 'amber-lt' | 'british-lt' | 'oxblood-lt' | 'silver-lt' | 'pedalboard-lt' | 'blackface-lt' | 'plexi-lt'

const THEME_KEY = 'maq_theme'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(THEME_KEY) as Theme) ?? 'dark'
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
}
