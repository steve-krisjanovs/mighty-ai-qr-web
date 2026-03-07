import QRCode from 'qrcode'
import type { ProPresetParams } from './nux'
import { DEVICES } from './nux'
import { AMP_NAMES, CAB_NAMES, EFX_NAMES, REVERB_NAMES, DELAY_NAMES, MOD_NAMES, COMP_NAMES } from './names'

function encodeParam(value: number, inMin: number, inMax: number): number {
  const clamped = Math.max(inMin, Math.min(inMax, value))
  return Math.round(((clamped - inMin) / (inMax - inMin)) * 100)
}

function encodeDbPro(db: number): number { return encodeParam(db, -12, 12) }
function encodeDbEQ(db: number): number  { return encodeParam(db, -15, 15) }

function headByte(nuxIndex: number, enabled: boolean): number {
  return nuxIndex | (enabled ? 0x00 : 0x40)
}

function buildProPayload(p: ProPresetParams): Buffer {
  const data = Buffer.alloc(113, 0)

  data[1] = headByte(p.compressor?.id ?? 1, p.compressor?.enabled ?? false)
  data[2] = headByte(p.efx?.id ?? 1,        p.efx?.enabled ?? false)
  data[3] = headByte(p.amp.id,              true)
  data[4] = headByte(p.eq?.id ?? 1,         p.eq?.enabled ?? false)
  data[5] = headByte(1,                     p.noise_gate.enabled)
  data[6] = headByte(p.modulation?.id ?? 2, p.modulation?.enabled ?? false)
  data[7] = headByte(p.delay?.id ?? 2,      p.delay?.enabled ?? false)
  data[8] = headByte(p.reverb?.id ?? 1,     p.reverb?.enabled ?? false)
  data[9] = headByte(p.cabinet.id,          true)

  if (p.compressor?.enabled) {
    data[15] = p.compressor.p1
    data[16] = p.compressor.p2
    if (p.compressor.p3 !== undefined) data[17] = p.compressor.p3
    if (p.compressor.p4 !== undefined) data[18] = p.compressor.p4
  }

  if (p.efx?.enabled) {
    data[20] = p.efx.p1
    data[21] = p.efx.p2
    if (p.efx.p3 !== undefined) data[22] = p.efx.p3
    if (p.efx.p4 !== undefined) data[23] = p.efx.p4
    if (p.efx.p5 !== undefined) data[24] = p.efx.p5
  }

  data[27] = p.amp.gain
  data[28] = p.amp.master
  data[29] = p.amp.bass
  data[30] = p.amp.mid
  data[31] = p.amp.treble
  if (p.amp.param6 !== undefined) data[32] = p.amp.param6
  if (p.amp.param7 !== undefined) data[33] = p.amp.param7

  if (p.eq?.enabled && p.eq.bands.length > 0) {
    p.eq.bands.forEach((db, i) => { data[36 + i] = encodeDbEQ(db) })
  }

  data[49] = p.noise_gate.sensitivity
  data[50] = p.noise_gate.decay

  if (p.modulation?.enabled) {
    data[54] = p.modulation.p1
    data[55] = p.modulation.p2
    if (p.modulation.p3 !== undefined) data[56] = p.modulation.p3
    if (p.modulation.p4 !== undefined) data[57] = p.modulation.p4
  }

  if (p.delay?.enabled) {
    data[61] = p.delay.p1
    data[62] = p.delay.p2
    data[63] = p.delay.p3 ?? 0
    if (p.delay.p4 !== undefined) data[64] = p.delay.p4
  }

  if (p.reverb?.enabled) {
    data[70] = p.reverb.p1
    data[71] = p.reverb.p2
    if (p.reverb.p3 !== undefined) data[72] = p.reverb.p3
    if (p.reverb.p4 !== undefined) data[73] = p.reverb.p4
  }

  data[78] = encodeDbPro(p.cabinet.level_db)
  data[79] = encodeParam(p.cabinet.low_cut_hz, 20, 300)
  data[80] = Math.round(Math.max(0, Math.min(100, p.cabinet.high_cut)))
  data[84] = encodeDbPro(p.master_db)

  const defaultChain = [5, 1, 6, 2, 3, 9, 4, 8, 7]
  defaultChain.forEach((fxid, i) => { data[89 + i] = fxid })

  return data
}

export function buildQRString(p: ProPresetParams): string {
  const device = DEVICES[p.device ?? 'plugpro']
  if (!device) throw new Error(`Unknown device: ${p.device}`)
  if (device.format !== 'pro') throw new Error(`Device ${p.device} uses standard (40-byte) format — not yet implemented`)
  const payload = buildProPayload(p)
  const full = Buffer.concat([Buffer.from([device.deviceQRId, device.deviceQRVersion]), payload])
  return 'nux://MightyAmp:' + full.toString('base64')
}

export interface SettingRow {
  slot: string
  selection: string
  params: Record<string, number | string>
  enabled: boolean
}

export interface QRResult {
  qrString: string
  imageBase64: string
  presetName: string
  deviceName: string
  settings: SettingRow[]
  guitar?: import('./nux').GuitarSetup
}

function buildSettings(p: ProPresetParams): SettingRow[] {
  const rows: SettingRow[] = []

  rows.push({
    slot: 'Amp', selection: AMP_NAMES[p.amp.id] ?? `Amp #${p.amp.id}`, enabled: true,
    params: { Gain: p.amp.gain, Master: p.amp.master, Bass: p.amp.bass, Mid: p.amp.mid, Treble: p.amp.treble,
      ...(p.amp.param6 !== undefined ? { Presence: p.amp.param6 } : {}) },
  })
  rows.push({
    slot: 'Cabinet', selection: CAB_NAMES[p.cabinet.id] ?? `Cab #${p.cabinet.id}`, enabled: true,
    params: { 'Level (dB)': p.cabinet.level_db, 'Low Cut (Hz)': p.cabinet.low_cut_hz, 'High Cut': p.cabinet.high_cut },
  })
  rows.push({
    slot: 'Noise Gate', selection: 'NoiseGatePro', enabled: p.noise_gate.enabled,
    params: { Sensitivity: p.noise_gate.sensitivity, Decay: p.noise_gate.decay },
  })
  if (p.efx) rows.push({
    slot: 'EFX', selection: EFX_NAMES[p.efx.id] ?? `EFX #${p.efx.id}`, enabled: p.efx.enabled,
    params: { P1: p.efx.p1, P2: p.efx.p2, ...(p.efx.p3 !== undefined ? { P3: p.efx.p3 } : {}) },
  })
  if (p.compressor) rows.push({
    slot: 'Compressor', selection: COMP_NAMES[p.compressor.id] ?? `Comp #${p.compressor.id}`, enabled: p.compressor.enabled,
    params: { P1: p.compressor.p1, P2: p.compressor.p2 },
  })
  if (p.modulation) rows.push({
    slot: 'Modulation', selection: MOD_NAMES[p.modulation.id] ?? `Mod #${p.modulation.id}`, enabled: p.modulation.enabled,
    params: { Rate: p.modulation.p1, Depth: p.modulation.p2 },
  })
  if (p.delay) rows.push({
    slot: 'Delay', selection: DELAY_NAMES[p.delay.id] ?? `Delay #${p.delay.id}`, enabled: p.delay.enabled,
    params: { Time: p.delay.p1, Feedback: p.delay.p2, Mix: p.delay.p3 ?? 0 },
  })
  if (p.reverb) rows.push({
    slot: 'Reverb', selection: REVERB_NAMES[p.reverb.id] ?? `Reverb #${p.reverb.id}`, enabled: p.reverb.enabled,
    params: { Decay: p.reverb.p1, Level: p.reverb.p2,
      ...(p.reverb.p3 !== undefined ? { P3: p.reverb.p3 } : {}),
      ...(p.reverb.p4 !== undefined ? { P4: p.reverb.p4 } : {}) },
  })
  rows.push({ slot: 'Master Vol', selection: `${p.master_db >= 0 ? '+' : ''}${p.master_db} dB`, enabled: true, params: {} })

  return rows
}

export async function generateQR(p: ProPresetParams): Promise<QRResult> {
  const qrString = buildQRString(p)
  const device   = DEVICES[p.device ?? 'plugpro']

  const imageBase64 = await QRCode.toDataURL(qrString, {
    errorCorrectionLevel: 'H',
    width: 500,
    margin: 4,
    color: { dark: '#000000', light: '#ffffff' },
  })

  return { qrString, imageBase64, presetName: p.preset_name, deviceName: device.displayName, settings: buildSettings(p), guitar: p.guitar }
}

function decodeDbPro(b: number): number { return Math.round((b / 100) * 24 - 12) }
function decodeHead(b: number): { id: number; enabled: boolean } {
  return { id: b & 0x3F, enabled: (b & 0x40) === 0 }
}

const QR_ID_DISPLAY: Record<number, string> = {
  15: 'Mighty Plug Pro', 19: 'Mighty Lite MkII', 20: 'Mighty 8BT MkII',
  11: 'Mighty Plug', 9: 'Mighty Lite BT', 12: 'Mighty 8BT', 7: 'Mighty 20/40BT', 6: 'Mighty Air',
}

export function decodeQRString(qrString: string): { presetName: string; deviceName: string; settings: SettingRow[] } | null {
  if (!qrString.startsWith('nux://MightyAmp:')) return null
  try {
    const buf = Buffer.from(qrString.slice(16), 'base64')
    const deviceName = QR_ID_DISPLAY[buf[0]] ?? 'NUX MightyAmp'

    if (buf.length < 115) {
      return { presetName: 'Imported Preset', deviceName, settings: [] }
    }

    const d = buf.slice(2)
    const nameRaw = d.slice(98, 114)
    const nullIdx = nameRaw.indexOf(0)
    const presetName = nameRaw.slice(0, nullIdx >= 0 ? nullIdx : undefined).toString('ascii').trim() || 'Imported Preset'

    const amp    = decodeHead(d[3])
    const cab    = decodeHead(d[9])
    const ng     = decodeHead(d[5])
    const efx    = decodeHead(d[2])
    const comp   = decodeHead(d[1])
    const mod    = decodeHead(d[6])
    const delay  = decodeHead(d[7])
    const reverb = decodeHead(d[8])
    const masterDb = decodeDbPro(d[84])

    const settings: SettingRow[] = [
      { slot: 'Amp', enabled: true, selection: AMP_NAMES[amp.id] ?? `Amp #${amp.id}`,
        params: { Gain: d[27], Master: d[28], Bass: d[29], Mid: d[30], Treble: d[31], ...(d[32] ? { Presence: d[32] } : {}) } },
      { slot: 'Cabinet', enabled: true, selection: CAB_NAMES[cab.id] ?? `Cab #${cab.id}`,
        params: { 'Level (dB)': decodeDbPro(d[78]), 'Low Cut': d[79], 'High Cut': d[80] } },
      { slot: 'Noise Gate', enabled: ng.enabled, selection: 'NoiseGatePro',
        params: { Sensitivity: d[49], Decay: d[50] } },
    ]

    if (efx.id > 0)   settings.push({ slot: 'EFX', enabled: efx.enabled, selection: EFX_NAMES[efx.id] ?? `EFX #${efx.id}`, params: { P1: d[20], P2: d[21], P3: d[22] } })
    if (comp.id > 0)  settings.push({ slot: 'Compressor', enabled: comp.enabled, selection: COMP_NAMES[comp.id] ?? `Comp #${comp.id}`, params: { P1: d[15], P2: d[16] } })
    if (mod.id > 0)   settings.push({ slot: 'Modulation', enabled: mod.enabled, selection: MOD_NAMES[mod.id] ?? `Mod #${mod.id}`, params: { Rate: d[54], Depth: d[55], P3: d[56] } })
    if (delay.id > 0) settings.push({ slot: 'Delay', enabled: delay.enabled, selection: DELAY_NAMES[delay.id] ?? `Delay #${delay.id}`, params: { Time: d[61], Feedback: d[62], Mix: d[63] } })
    if (reverb.id > 0) settings.push({ slot: 'Reverb', enabled: reverb.enabled, selection: REVERB_NAMES[reverb.id] ?? `Reverb #${reverb.id}`, params: { Decay: d[70], Level: d[71] } })

    settings.push({ slot: 'Master Vol', enabled: true, selection: `${masterDb >= 0 ? '+' : ''}${masterDb} dB`, params: {} })

    return { presetName, deviceName, settings }
  } catch { return null }
}
