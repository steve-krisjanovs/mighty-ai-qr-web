import { v4 as uuidv4 } from 'uuid'
import type { HistoryItem, QrResult } from './types'

const KEY = 'qr_history'
const MAX = 20

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveToHistory(qr: QrResult): HistoryItem {
  const item: HistoryItem = {
    id: uuidv4(),
    presetName: qr.presetName,
    deviceName: qr.deviceName,
    imageBase64: qr.imageBase64,
    timestamp: Date.now(),
    qr,
  }
  const history = [item, ...loadHistory()].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(history))
  return item
}

export function clearHistory() {
  localStorage.removeItem(KEY)
}
