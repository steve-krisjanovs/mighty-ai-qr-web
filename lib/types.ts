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
  settings: QrSetting[]
}

export interface ChatMessage extends Message {
  id: string
  qr?: QrResult
}

export interface HistoryItem {
  id: string
  presetName: string
  deviceName: string
  imageBase64: string
  timestamp: number
  qr: QrResult
}

export interface UsageStats {
  generationsUsed: number
  generationsLimit: number
  freeRemaining: number
  hasActiveSubscription: boolean
}
