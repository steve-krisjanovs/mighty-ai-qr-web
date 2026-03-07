import { v4 as uuidv4 } from 'uuid'
import type { Message, QrResult } from './types'
import { getActiveConfig } from './storage'

export interface ChatResponse {
  message: string
  qr?: QrResult
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

export async function fetchModels(
  provider: string,
  apiKey: string,
  baseUrl: string,
): Promise<string[]> {
  if (!getToken()) await authenticate().catch(() => {})
  const token = getToken()
  if (!token) return []

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (apiKey)   headers['x-user-api-key'] = apiKey
  if (provider) headers['x-provider']     = provider
  if (baseUrl)  headers['x-base-url']     = baseUrl

  try {
    const res = await fetch(`${BASE}/models`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.models) ? data.models : []
  } catch {
    return []
  }
}

export async function sendChat(messages: Message[], signal?: AbortSignal): Promise<ChatResponse> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }

  const active = getActiveConfig()
  const extraHeaders: Record<string, string> = {}
  if (active) {
    if (active.apiKey) extraHeaders['x-user-api-key'] = active.apiKey
    extraHeaders['x-provider'] = active.provider
    if (active.baseUrl) extraHeaders['x-base-url'] = active.baseUrl
    if (active.model)   extraHeaders['x-model'] = active.model
  }

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ messages }),
  })

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return sendChat(messages)
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
  }
}

export interface DecodeResult {
  presetName: string
  deviceName: string
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
