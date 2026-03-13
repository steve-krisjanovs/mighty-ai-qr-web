import { v4 as uuidv4 } from 'uuid'
import type { Message, QrResult } from './types'
import { getActiveConfig, getDefaultDevice } from './storage'

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

export async function sendChat(messages: Message[], signal?: AbortSignal, device?: string): Promise<ChatResponse> {
  let token = getToken()
  if (!token) {
    await authenticate()
    token = getToken()!
  }

  const active = getActiveConfig()
  const extraHeaders: Record<string, string> = {}
  extraHeaders['x-default-device'] = device ?? getDefaultDevice()
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

export async function suggestGuitar(settings: import('./types').QrResult['settings'], deviceName: string): Promise<import('./types').GuitarSetup | null> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken()! }
  const active = getActiveConfig()
  const extraHeaders: Record<string, string> = {}
  if (active) {
    if (active.apiKey) extraHeaders['x-user-api-key'] = active.apiKey
    extraHeaders['x-provider'] = active.provider
    if (active.baseUrl) extraHeaders['x-base-url'] = active.baseUrl
    if (active.model)   extraHeaders['x-model'] = active.model
  }
  try {
    const res = await fetch(`${BASE}/guitar-suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders },
      body: JSON.stringify({ settings, deviceName }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.guitar ?? null
  } catch { return null }
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

export async function convertPreset(qrString: string, targetDevice: string, presetName?: string): Promise<import('./types').QrResult | null> {
  let token = getToken()
  if (!token) { await authenticate(); token = getToken()! }

  const active = getActiveConfig()
  const extraHeaders: Record<string, string> = {}
  extraHeaders['x-default-device'] = targetDevice
  if (active) {
    if (active.apiKey) extraHeaders['x-user-api-key'] = active.apiKey
    extraHeaders['x-provider'] = active.provider
    if (active.baseUrl) extraHeaders['x-base-url'] = active.baseUrl
    if (active.model)   extraHeaders['x-model'] = active.model
  }

  const res = await fetch(`${BASE}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extraHeaders },
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
