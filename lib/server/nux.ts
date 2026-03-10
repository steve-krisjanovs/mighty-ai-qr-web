export type DeviceType =
  | 'plugpro'
  | 'space'
  | 'plugair_v1'
  | 'plugair_v2'
  | 'mightyair'
  | 'litemk2'
  | '8btmk2'
  | 'lite'
  | '8bt'
  | '2040bt'

export interface DeviceConfig {
  deviceQRId: number
  deviceQRVersion: number
  payloadBytes: number
  format: 'pro' | 'standard'
  displayName: string
}

export const DEVICES: Record<DeviceType, DeviceConfig> = {
  plugpro:    { deviceQRId: 15, deviceQRVersion: 1, payloadBytes: 113, format: 'pro',      displayName: 'Mighty Plug Pro' },
  space:      { deviceQRId: 15, deviceQRVersion: 1, payloadBytes: 113, format: 'pro',      displayName: 'Mighty Space' },
  litemk2:    { deviceQRId: 19, deviceQRVersion: 1, payloadBytes: 113, format: 'pro',      displayName: 'Mighty Lite MkII' },
  '8btmk2':   { deviceQRId: 20, deviceQRVersion: 1, payloadBytes: 113, format: 'pro',      displayName: 'Mighty 8BT MkII' },
  plugair_v1: { deviceQRId: 11, deviceQRVersion: 0, payloadBytes: 40,  format: 'standard', displayName: 'Mighty Plug (v1)' },
  plugair_v2: { deviceQRId: 11, deviceQRVersion: 2, payloadBytes: 40,  format: 'standard', displayName: 'Mighty Plug (v2)' },
  mightyair:  { deviceQRId: 6,  deviceQRVersion: 0, payloadBytes: 40,  format: 'standard', displayName: 'Mighty Air' },
  lite:       { deviceQRId: 9,  deviceQRVersion: 1, payloadBytes: 40,  format: 'standard', displayName: 'Mighty Lite BT' },
  '8bt':      { deviceQRId: 12, deviceQRVersion: 1, payloadBytes: 40,  format: 'standard', displayName: 'Mighty 8BT' },
  '2040bt':   { deviceQRId: 7,  deviceQRVersion: 1, payloadBytes: 40,  format: 'standard', displayName: 'Mighty 20/40BT' },
}

export interface AmpParams {
  id: number
  gain: number
  master: number
  bass: number
  mid: number
  treble: number
  param6?: number
  param7?: number
}

export interface CabinetParams {
  id: number
  level_db: number
  low_cut_hz: number
  high_cut: number
}

export interface NoiseGateParams {
  enabled: boolean
  sensitivity: number
  decay: number
}

export interface EffectParams {
  id: number
  enabled: boolean
  p1: number
  p2: number
  p3?: number
  p4?: number
  p5?: number
}

export interface EQParams {
  id: number
  enabled: boolean
  bands: number[]
}

export interface GuitarSetup {
  pickup?: string       // e.g. "Bridge", "Neck", "Bridge+Neck", "All three"
  pickupType?: string   // e.g. "Humbucker", "Single-coil", "P90", "Humbucker/Single-coil"
  controls?: { label: string; value: number }[]
}

export interface WahParams {
  enabled: boolean
  pedal: number
}

export interface ProPresetParams {
  device: DeviceType
  preset_name: string
  amp: AmpParams
  cabinet?: CabinetParams
  noise_gate: NoiseGateParams
  wah?: WahParams
  efx?: EffectParams
  compressor?: EffectParams
  modulation?: EffectParams
  delay?: EffectParams
  reverb?: EffectParams
  eq?: EQParams
  master_db: number
  guitar?: GuitarSetup
}
