import db from './db'

const FREE_LIMIT = parseInt(process.env.FREE_GENERATION_LIMIT ?? '10', 10)

interface DeviceRow {
  device_id: string
  generations_used: number
  has_active_subscription: number
}

function getOrCreate(deviceId: string): DeviceRow {
  const existing = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId) as DeviceRow | undefined
  if (!existing) {
    db.prepare('INSERT INTO devices (device_id) VALUES (?)').run(deviceId)
    return { device_id: deviceId, generations_used: 0, has_active_subscription: 0 }
  }
  return existing
}

export function canGenerate(deviceId: string): boolean {
  const row = getOrCreate(deviceId)
  return row.has_active_subscription === 1 || row.generations_used < FREE_LIMIT
}

export function incrementGeneration(deviceId: string): void {
  db.prepare('UPDATE devices SET generations_used = generations_used + 1 WHERE device_id = ?').run(deviceId)
}

export function setSubscriptionActive(deviceId: string, active: boolean): void {
  getOrCreate(deviceId)
  db.prepare('UPDATE devices SET has_active_subscription = ? WHERE device_id = ?').run(active ? 1 : 0, deviceId)
}

export function getStatus(deviceId: string) {
  const row = getOrCreate(deviceId)
  return {
    generationsUsed: row.generations_used,
    generationsLimit: FREE_LIMIT,
    hasActiveSubscription: row.has_active_subscription === 1,
    freeRemaining: Math.max(0, FREE_LIMIT - row.generations_used),
  }
}
