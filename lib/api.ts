import { v4 as uuidv4 } from 'uuid'
import type { Message, QrResult, UsageStats } from './types'

export interface ChatResponse {
  message: string
  qr?: QrResult
  usage: UsageStats
}

const BASE = '/api'

function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('device_id')
  if (!id) {
    id = uuidv4()
    localStorage.setItem('device_id', id)
  }
  return id
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function setToken(token: string) {
  localStorage.setItem('auth_token', token)
}

async function authenticate(): Promise<UsageStats> {
  const deviceId = getDeviceId()
  const res = await fetch(`${BASE}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  const data = await res.json()
  setToken(data.token)
  return {
    generationsUsed: data.generationsUsed ?? 0,
    generationsLimit: data.generationsLimit ?? 10,
    freeRemaining: data.freeRemaining ?? 10,
    hasActiveSubscription: data.hasActiveSubscription ?? false,
  }
}

export async function initAuth(): Promise<UsageStats> {
  const token = getToken()
  if (token) {
    return {
      generationsUsed: 0,
      generationsLimit: 10,
      freeRemaining: 10,
      hasActiveSubscription: false,
    }
  }
  return authenticate()
}

export class FreeLimitError extends Error {}

export async function sendChat(messages: Message[]): Promise<ChatResponse> {
  let token = getToken()
  if (!token) {
    const usage = await authenticate()
    token = getToken()!
    return { message: '', usage }
  }

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  })

  if (res.status === 402) throw new FreeLimitError()

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    await authenticate()
    return sendChat(messages)
  }

  if (!res.ok) throw new Error(`Server error ${res.status}`)

  const data = await res.json()
  return {
    message: data.message ?? '',
    qr: data.qr,
    usage: {
      generationsUsed: data.generationsUsed ?? 0,
      generationsLimit: data.generationsLimit ?? 10,
      freeRemaining: data.freeRemaining ?? 10,
      hasActiveSubscription: data.hasActiveSubscription ?? false,
    },
  }
}
