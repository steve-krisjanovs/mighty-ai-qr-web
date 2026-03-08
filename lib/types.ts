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

export interface GuitarSetup {
  pickup?: string       // e.g. "Bridge", "Neck", "Bridge+Neck", "All three"
  pickupType?: string   // e.g. "Humbucker", "Single-coil", "P90", "Humbucker/Single-coil"
  controls?: { label: string; value: number }[]  // e.g. [{ label: "Vol", value: 10 }, { label: "Tone", value: 7 }]
}

export interface QrResult {
  qrString: string
  imageBase64: string
  presetName: string
  deviceName: string
  settings: QrSetting[]
  guitar?: GuitarSetup
  importNote?: string
  imported?: boolean
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

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  lastQr: QrResult | null
  createdAt: number
  updatedAt: number
}
