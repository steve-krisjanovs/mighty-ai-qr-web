export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface QrSetting {
  slot: string
  selection: string
  enabled: boolean
  params?: Record<string, number | string>
}

export interface QrResult {
  qrString: string
  imageBase64: string
  presetName: string
  deviceName: string
  deviceId?: string
  settings: QrSetting[]
  importNote?: string
  imported?: boolean
}

export interface ChatMessage extends Message {
  id: string
  qr?: QrResult
  sources?: { title: string; url: string }[]
}

export interface HistoryItem {
  id: string
  presetName: string
  deviceName: string
  imageBase64: string
  timestamp: number
  qr: QrResult
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  lastQr: QrResult | null
  createdAt: number
  updatedAt: number
}
