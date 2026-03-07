import db from './db'

interface DeviceRow {
  device_id: string
  has_active_subscription: number
}

function getOrCreate(deviceId: string): DeviceRow {
  const existing = db.prepare('SELECT device_id, has_active_subscription FROM devices WHERE device_id = ?').get(deviceId) as DeviceRow | undefined
  if (!existing) {
    db.prepare('INSERT INTO devices (device_id) VALUES (?)').run(deviceId)
    return { device_id: deviceId, has_active_subscription: 0 }
  }
  return existing
}

export function setSubscriptionActive(deviceId: string, active: boolean): void {
  getOrCreate(deviceId)
  db.prepare('UPDATE devices SET has_active_subscription = ? WHERE device_id = ?').run(active ? 1 : 0, deviceId)
}
