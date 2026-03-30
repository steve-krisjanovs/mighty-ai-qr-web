import { v4 as uuidv4 } from 'uuid'
import type { Message, QrResult, Conversation, HistoryItem } from './types'
import { getDefaultDevice } from './storage'

export interface ChatResponse {
  message: string
  qr?: QrResult
  sources?: { title: string; url: string }[]
}

const BASE = '/api'

function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('device_id')
  if (!id) { id = uuidv4(); localStorage.setItem('device_id', id) }
  return id
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function setToken(token: string) {
  localStorage.setItem('auth_token', token)
}

async function authenticate(): Promise<void> {
  const res = await fetch(`${BASE}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId() }),
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const data = await res.json()
  setToken(data.token)
}

export async function initAuth(): Promise<void> {
  if (!getToken()) await authenticate()
}

export async function sendChat(messages: Message[], signal?: AbortSignal, device?: string): Promise<ChatResponse> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-default-device': device ?? getDefaultDevice(),
    },
    body: JSON.stringify({ messages }),
  })

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return sendChat(messages, undefined, device)
  }

  if (!res.ok) {
    let message = `Server error ${res.status}`
    try {
      const body = await res.json()
      if (body?.error && typeof body.error === 'string') message = body.error
    } catch { /* ignore parse errors */ }
    throw new Error(message)
  }

  const data = await res.json()
  return {
    message: data.message ?? '',
    qr: data.qr,
    sources: data.sources,
  }
}

export async function scanQrFromFile(file: File): Promise<{ qrString: string; imageBase64: string } | null> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken()! }
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE}/scan-qr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.found) return null
  return { qrString: data.qrString, imageBase64: data.imageBase64 }
}

export interface DecodeResult {
  presetName: string
  deviceName: string
  deviceId?: string
  settings: import('./types').QrResult['settings']
}

export async function decodeQr(qrString: string): Promise<DecodeResult | null> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken() }
  const res = await fetch(`${BASE}/decode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ qrString }),
  })
  if (!res.ok) return null
  return res.json()
}


export async function identifyQr(importNote: string): Promise<{ artist: string | null; song: string | null }> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken()! }
  try {
    const res = await fetch(`${BASE}/identify-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ importNote }),
    })
    if (!res.ok) return { artist: null, song: null }
    return res.json()
  } catch {
    return { artist: null, song: null }
  }
}

// ─── Server-side storage ──────────────────────────────────────────────────────

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken()! }
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return authedFetch(url, init)
  }
  return res
}

export async function apiLoadConversations(): Promise<Conversation[]> {
  const res = await authedFetch(`${BASE}/conversations`)
  if (!res.ok) return []
  return res.json()
}

export async function apiUpsertConversation(conv: Conversation): Promise<void> {
  await authedFetch(`${BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conv),
  })
}

export async function apiDeleteConversation(id: string): Promise<void> {
  await authedFetch(`${BASE}/conversations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiClearAllConversations(): Promise<void> {
  await authedFetch(`${BASE}/conversations`, { method: 'DELETE' })
}

export async function apiLoadHistory(): Promise<HistoryItem[]> {
  const res = await authedFetch(`${BASE}/history`)
  if (!res.ok) return []
  return res.json()
}

export async function apiSaveToHistory(qr: QrResult): Promise<HistoryItem | null> {
  const res = await authedFetch(`${BASE}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(qr),
  })
  if (!res.ok) return null
  return res.json()
}

export async function apiDeleteHistoryItem(id: string): Promise<void> {
  await authedFetch(`${BASE}/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiRenameHistoryItem(id: string, newName: string): Promise<void> {
  await authedFetch(`${BASE}/history`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, newName }),
  })
}

export async function apiClearAllHistory(): Promise<void> {
  await authedFetch(`${BASE}/history`, { method: 'DELETE' })
}

export async function apiMigrateLegacy(conversations: Conversation[], history: HistoryItem[]): Promise<void> {
  await authedFetch(`${BASE}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversations, history }),
  })
}

export async function convertPreset(qrString: string, targetDevice: string, presetName?: string): Promise<import('./types').QrResult | null> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken()! }

  const res = await fetch(`${BASE}/convert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-default-device': targetDevice,
    },
    body: JSON.stringify({ qrString, targetDevice, presetName }),
  })
  if (!res.ok) {
    let message = `Conversion failed (${res.status})`
    try { const b = await res.json(); if (b?.error) message = b.error } catch { /* ignore */ }
    throw new Error(message)
  }
  const data = await res.json()
  return data.qr ?? null
}
