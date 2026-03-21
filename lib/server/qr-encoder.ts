import QRCode from 'qrcode'
import type { ProPresetParams, DeviceType } from './nux'
import { DEVICES } from './nux'
import {
  AMP_NAMES, CAB_NAMES, EFX_NAMES, REVERB_NAMES, DELAY_NAMES, MOD_NAMES, COMP_NAMES,
  PLUG_AIR_V1_AMP_NAMES, PLUG_AIR_V2_AMP_NAMES, PLUG_AIR_CAB_NAMES, PLUG_AIR_EFX_NAMES,
  PLUG_AIR_V1_MOD_NAMES, PLUG_AIR_V2_MOD_NAMES, PLUG_AIR_DELAY_NAMES,
  PLUG_AIR_V1_REVERB_NAMES, PLUG_AIR_V2_REVERB_NAMES,
  LITE_AMP_NAMES, LITE_MOD_NAMES, LITE_AMBIENCE_NAMES, LITE_8BT_DELAY_NAMES, LITE_8BT_REVERB_NAMES,
  BT2040_AMP_NAMES, BT2040_MOD_NAMES, BT2040_DELAY_NAMES, BT2040_REVERB_NAMES,
} from './names'

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
  data[9] = headByte(p.cabinet!.id,         true)

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

  data[78] = encodeDbPro(p.cabinet!.level_db)
  data[79] = encodeParam(p.cabinet!.low_cut_hz, 20, 300)
  data[80] = Math.round(Math.max(0, Math.min(100, p.cabinet!.high_cut)))
  data[84] = encodeDbPro(p.master_db)

  const defaultChain = [5, 1, 6, 2, 3, 9, 4, 8, 7]
  defaultChain.forEach((fxid, i) => { data[89 + i] = fxid })

  return data
}

// Standard device enable byte: 0x7f = on, 0x00 = off (separate from type byte)
function stdEnable(on: boolean): number { return on ? 0x7f : 0x00 }

// PlugAir v1 and v2 — 40 bytes
// Byte layout from PresetDataIndexPlugAir:
//  0=ng_enable 1=ng_threshold 2=ng_sustain
//  3=efx_enable 4=efx_type 5=efx_p1 6=efx_p2 7=efx_p3
//  8=amp_enable 9=amp_type 10=amp_gain 11=amp_level 12=amp_bass 13=amp_mid 14=amp_treble 15=amp_tone
//  16=cab_enable 17=cab_type 18=cab_gain
//  19=mod_enable 20=mod_type 21=mod_rate 22=mod_depth 23=mod_mix
//  24=delay_enable 25=delay_type 26=delay_time 27=delay_feedback 28=delay_mix
//  29=reverb_enable 30=reverb_type 31=reverb_decay 32=reverb_damp 33=reverb_mix
function buildPlugAirPayload(p: ProPresetParams): Buffer {
  const data = Buffer.alloc(40, 0)

  data[0]  = stdEnable(p.noise_gate.enabled)
  data[1]  = p.noise_gate.sensitivity
  data[2]  = p.noise_gate.decay

  data[3]  = stdEnable(p.efx?.enabled ?? false)
  data[4]  = p.efx?.id ?? 0
  data[5]  = p.efx?.p1 ?? 0
  data[6]  = p.efx?.p2 ?? 0
  data[7]  = p.efx?.p3 ?? 0

  data[8]  = 0x7f  // amp always on
  data[9]  = p.amp.id
  data[10] = p.amp.gain
  data[11] = p.amp.master
  data[12] = p.amp.bass
  data[13] = p.amp.mid
  data[14] = p.amp.treble
  data[15] = p.amp.param6 ?? 0  // tone / presence

  data[16] = 0x7f  // cab always on
  data[17] = p.cabinet?.id ?? 0
  data[18] = encodeDbPro(p.cabinet?.level_db ?? 0)  // cabinet level dB → 0-100

  data[19] = stdEnable(p.modulation?.enabled ?? false)
  data[20] = p.modulation?.id ?? 0
  data[21] = p.modulation?.p1 ?? 0
  data[22] = p.modulation?.p2 ?? 0
  data[23] = p.modulation?.p3 ?? 0

  data[24] = stdEnable(p.delay?.enabled ?? false)
  data[25] = p.delay?.id ?? 0
  data[26] = p.delay?.p1 ?? 0
  data[27] = p.delay?.p2 ?? 0
  data[28] = p.delay?.p3 ?? 0

  data[29] = stdEnable(p.reverb?.enabled ?? false)
  data[30] = p.reverb?.id ?? 0
  data[31] = p.reverb?.p1 ?? 0
  data[32] = p.reverb?.p2 ?? 0
  data[33] = p.reverb?.p3 ?? 0

  return data
}

// Lite BT — 40 bytes
// Byte layout from PresetDataIndexLite:
//  0=ng_enable 1=ng_threshold 2=ng_sustain
//  3=amp_type 4-6=subtypes 7=amp_gain 8=amp_level 9=amp_bass 10=amp_mid 11=amp_treble 12=amp_tone
//  13=mod_enable 14=mod_type 15=mod_rate 16=mod_depth 17=mod_mix
//  18=ambience_enable 19=ambience_type (0-3=delays, 10-13=reverbs)
//  20=reverb_type 21=reverb_decay 22=reverb_mix
//  23=delay_type 24=delay_time 25=delay_feedback 26=delay_mix
//  32=reverb_enable(unused for lite ambience) 33=delay_enable(unused for lite ambience)
// Lite has a single ambience slot: reverb takes priority over delay if both enabled.
function buildLitePayload(p: ProPresetParams): Buffer {
  const data = Buffer.alloc(40, 0)

  data[0]  = stdEnable(p.noise_gate.enabled)
  data[1]  = p.noise_gate.sensitivity
  data[2]  = p.noise_gate.decay

  // AmpClean: amp_type=0, only gain/level/tone used
  data[3]  = 0
  data[7]  = p.amp.gain
  data[8]  = p.amp.master
  data[12] = p.amp.param6 ?? 50  // tone

  data[13] = stdEnable(p.modulation?.enabled ?? false)
  data[14] = p.modulation?.id ?? 0
  data[15] = p.modulation?.p1 ?? 0
  data[16] = p.modulation?.p2 ?? 0

  // Ambience: one slot — reverb takes priority over delay
  if (p.reverb?.enabled) {
    data[18] = 0x7f
    data[19] = (p.reverb.id) + 10  // Lite reverb IDs in ambience = id+10 (Room=10, Hall=11…)
    data[21] = p.reverb.p1 ?? 0    // decay → reverbdecay
    data[22] = p.reverb.p2 ?? 0    // mix   → reverbmix
  } else if (p.delay?.enabled) {
    data[18] = 0x7f
    data[19] = p.delay.id           // delay nuxIndex 0-3 → efxtype
    data[24] = p.delay.p1 ?? 0     // time
    data[25] = p.delay.p2 ?? 0     // feedback
    data[26] = p.delay.p3 ?? 0     // mix
  }

  return data
}

// Mighty 8BT — 40 bytes (same index constants as Lite, but separate delay + reverb slots)
// delay: enable=33, type=23, params=24/25/26
// reverb: enable=32, type=20, params=21/22
function build8BTPayload(p: ProPresetParams): Buffer {
  const data = Buffer.alloc(40, 0)

  data[0]  = stdEnable(p.noise_gate.enabled)
  data[1]  = p.noise_gate.sensitivity
  data[2]  = p.noise_gate.decay

  data[3]  = 0
  data[7]  = p.amp.gain
  data[8]  = p.amp.master
  data[12] = p.amp.param6 ?? 50  // tone
  data[34] = 50  // miclevel default
  data[35] = 50  // micambsend default

  data[13] = stdEnable(p.modulation?.enabled ?? false)
  data[14] = p.modulation?.id ?? 0
  data[15] = p.modulation?.p1 ?? 0
  data[16] = p.modulation?.p2 ?? 0

  // Separate reverb slot
  data[20] = p.reverb?.id ?? 0
  data[21] = p.reverb?.p1 ?? 0    // decay
  data[22] = p.reverb?.p2 ?? 0    // mix
  data[32] = stdEnable(p.reverb?.enabled ?? false)

  // Separate delay slot
  data[23] = p.delay?.id ?? 0
  data[24] = p.delay?.p1 ?? 0     // time
  data[25] = p.delay?.p2 ?? 0     // feedback
  data[26] = p.delay?.p3 ?? 0     // mix
  data[33] = stdEnable(p.delay?.enabled ?? false)

  return data
}

// Mighty 20/40BT — 40 bytes
// Byte layout from PresetDataIndex2040BT:
//  0=ng_enable 1=ng_threshold
//  2=wah_enable 3=wah_pedal
//  4=amp_type 5=amp_gain 6=amp_level 7=amp_bass 8=amp_mid 9=amp_high
//  10=mod_enable 11=mod_type 12=mod_rate 13=mod_depth 14=mod_mix
//  15=delay_enable 16=delay_type 17=delay_time 18=delay_feedback 19=delay_mix
//  20=reverb_enable 21=reverb_type 22=reverb_decay 23=reverb_damp 24=reverb_mix
function build2040BTPayload(p: ProPresetParams): Buffer {
  const data = Buffer.alloc(40, 0)

  data[0]  = stdEnable(p.noise_gate.enabled)
  data[1]  = p.noise_gate.sensitivity

  data[2]  = stdEnable(p.wah?.enabled ?? false)
  data[3]  = p.wah?.pedal ?? 50

  data[4]  = 0  // amp type always 0
  data[5]  = p.amp.gain
  data[6]  = p.amp.master
  data[7]  = p.amp.bass
  data[8]  = p.amp.mid
  data[9]  = p.amp.treble  // amp_high

  data[10] = stdEnable(p.modulation?.enabled ?? false)
  data[11] = p.modulation?.id ?? 0
  data[12] = p.modulation?.p1 ?? 0
  data[13] = p.modulation?.p2 ?? 0
  data[14] = p.modulation?.p3 ?? 0

  data[15] = stdEnable(p.delay?.enabled ?? false)
  data[16] = p.delay?.id ?? 0
  data[17] = p.delay?.p1 ?? 0
  data[18] = p.delay?.p2 ?? 0
  data[19] = p.delay?.p3 ?? 0

  data[20] = stdEnable(p.reverb?.enabled ?? false)
  data[21] = p.reverb?.id ?? 0
  data[22] = p.reverb?.p1 ?? 0  // decay
  data[23] = p.reverb?.p2 ?? 0  // damp
  data[24] = p.reverb?.p3 ?? 0  // mix

  return data
}

function buildStandardPayload(p: ProPresetParams, device: DeviceType): Buffer {
  switch (device) {
    case 'plugair_v1':
    case 'plugair_v2':
    case 'mightyair_v1':
    case 'mightyair_v2':
      return buildPlugAirPayload(p)
    case 'lite':
      return buildLitePayload(p)
    case '8bt':
      return build8BTPayload(p)
    case '2040bt':
      return build2040BTPayload(p)
    default:
      throw new Error(`Unknown standard device: ${device}`)
  }
}

export function buildQRString(p: ProPresetParams): string {
  const device = DEVICES[p.device ?? 'plugpro']
  if (!device) throw new Error(`Unknown device: ${p.device}`)
  const payload = device.format === 'pro' ? buildProPayload(p) : buildStandardPayload(p, p.device)
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
  deviceId?: string
  settings: SettingRow[]
}

function buildSettings(p: ProPresetParams): SettingRow[] {
  const device = p.device ?? 'plugpro'
  const fmt = DEVICES[device]?.format ?? 'pro'
  if (fmt !== 'pro') return buildStandardSettings(p)

  const rows: SettingRow[] = []

  rows.push({
    slot: 'Amp', selection: AMP_NAMES[p.amp.id] ?? `Amp #${p.amp.id}`, enabled: true,
    params: { Gain: p.amp.gain, Master: p.amp.master, Bass: p.amp.bass, Mid: p.amp.mid, Treble: p.amp.treble,
      ...(p.amp.param6 !== undefined ? { Presence: p.amp.param6 } : {}) },
  })
  if (p.cabinet) rows.push({
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

function buildStandardSettings(p: ProPresetParams): SettingRow[] {
  const rows: SettingRow[] = []
  const d = p.device

  // Amp name maps
  const ampNames = (d === 'plugair_v1' || d === 'mightyair_v1') ? PLUG_AIR_V1_AMP_NAMES
    : (d === 'plugair_v2' || d === 'mightyair_v2') ? PLUG_AIR_V2_AMP_NAMES
    : d === '2040bt' ? BT2040_AMP_NAMES
    : LITE_AMP_NAMES

  rows.push({
    slot: 'Amp', selection: ampNames[p.amp.id] ?? `Amp #${p.amp.id}`, enabled: true,
    params: {
      Gain: p.amp.gain, Level: p.amp.master,
      ...(p.amp.bass  ? { Bass: p.amp.bass }   : {}),
      ...(p.amp.mid   ? { Mid: p.amp.mid }     : {}),
      ...(p.amp.treble? { Treble: p.amp.treble }: {}),
      ...(p.amp.param6 !== undefined ? { Tone: p.amp.param6 } : {}),
    },
  })

  // Cabinet (PlugAir only)
  if ((d === 'plugair_v1' || d === 'plugair_v2' || d === 'mightyair_v1' || d === 'mightyair_v2') && p.cabinet) {
    rows.push({
      slot: 'Cabinet', selection: PLUG_AIR_CAB_NAMES[p.cabinet.id] ?? `Cab #${p.cabinet.id}`, enabled: true,
      params: { 'Level (dB)': p.cabinet.level_db },
    })
  }

  rows.push({
    slot: 'Noise Gate', selection: 'Noise Gate', enabled: p.noise_gate.enabled,
    params: { Threshold: p.noise_gate.sensitivity, ...(p.noise_gate.decay ? { Decay: p.noise_gate.decay } : {}) },
  })

  // Wah (20/40BT only)
  if (d === '2040bt' && p.wah) {
    rows.push({ slot: 'Wah', selection: 'Wah', enabled: p.wah.enabled, params: { Pedal: p.wah.pedal } })
  }

  // EFX (PlugAir only)
  if ((d === 'plugair_v1' || d === 'plugair_v2' || d === 'mightyair_v1' || d === 'mightyair_v2') && p.efx) {
    rows.push({
      slot: 'EFX', selection: PLUG_AIR_EFX_NAMES[p.efx.id] ?? `EFX #${p.efx.id}`, enabled: p.efx.enabled,
      params: { P1: p.efx.p1, P2: p.efx.p2, ...(p.efx.p3 !== undefined ? { P3: p.efx.p3 } : {}) },
    })
  }

  // Modulation
  if (p.modulation) {
    const modNames = (d === 'plugair_v1' || d === 'mightyair_v1') ? PLUG_AIR_V1_MOD_NAMES
      : d === 'plugair_v2' ? PLUG_AIR_V2_MOD_NAMES
      : d === '2040bt' ? BT2040_MOD_NAMES
      : LITE_MOD_NAMES
    rows.push({
      slot: 'Modulation', selection: modNames[p.modulation.id] ?? `Mod #${p.modulation.id}`, enabled: p.modulation.enabled,
      params: { Rate: p.modulation.p1, Depth: p.modulation.p2 },
    })
  }

  // Delay
  if (p.delay) {
    const delayNames = (d === 'plugair_v1' || d === 'plugair_v2' || d === 'mightyair_v1' || d === 'mightyair_v2') ? PLUG_AIR_DELAY_NAMES
      : d === '2040bt' ? BT2040_DELAY_NAMES
      : LITE_8BT_DELAY_NAMES
    rows.push({
      slot: d === 'lite' ? 'Ambience (Delay)' : 'Delay',
      selection: delayNames[p.delay.id] ?? `Delay #${p.delay.id}`, enabled: p.delay.enabled,
      params: { Time: p.delay.p1, Feedback: p.delay.p2, Mix: p.delay.p3 ?? 0 },
    })
  }

  // Reverb
  if (p.reverb) {
    const reverbNames = (d === 'plugair_v1' || d === 'mightyair_v1') ? PLUG_AIR_V1_REVERB_NAMES
      : d === 'plugair_v2' ? PLUG_AIR_V2_REVERB_NAMES
      : d === '2040bt' ? BT2040_REVERB_NAMES
      : LITE_8BT_REVERB_NAMES
    rows.push({
      slot: d === 'lite' ? 'Ambience (Reverb)' : 'Reverb',
      selection: reverbNames[p.reverb.id] ?? `Reverb #${p.reverb.id}`, enabled: p.reverb.enabled,
      params: { Decay: p.reverb.p1, Mix: p.reverb.p2, ...(p.reverb.p3 !== undefined ? { Damp: p.reverb.p3 } : {}) },
    })
  }

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

  return { qrString, imageBase64, presetName: p.preset_name, deviceName: device.displayName, deviceId: p.device, settings: buildSettings(p) }
}

function decodeDbPro(b: number): number { return Math.round((b / 100) * 24 - 12) }
function decodeHead(b: number): { id: number; enabled: boolean } {
  return { id: b & 0x3F, enabled: (b & 0x40) === 0 }
}

const QR_ID_DISPLAY: Record<number, string> = {
  15: 'Mighty Plug Pro', 19: 'Mighty Lite MkII', 20: 'Mighty 8BT MkII',
  11: 'Mighty Plug / Air', 9: 'Mighty Lite BT', 12: 'Mighty 8BT', 7: 'Mighty 20/40BT',
}

const QR_ID_VERSION_TO_DEVICE: Record<string, DeviceType> = {
  '15_1': 'plugpro',
  '19_1': 'litemk2',
  '20_1': '8btmk2',
  '11_0': 'plugair_v1',
  '11_2': 'plugair_v2',
  '9_1':  'lite',
  '12_1': '8bt',
  '7_1':  '2040bt',
}

function stdEnabled(b: number): boolean { return b !== 0x00 }

function decodeStandardSettings(d: Buffer, deviceId: DeviceType): SettingRow[] {
  const settings: SettingRow[] = []

  if (deviceId === 'plugair_v1' || deviceId === 'plugair_v2' || deviceId === 'mightyair_v1' || deviceId === 'mightyair_v2') {
    const ampNames = deviceId === 'plugair_v2' ? PLUG_AIR_V2_AMP_NAMES : PLUG_AIR_V1_AMP_NAMES
    const modNames = deviceId === 'plugair_v2' ? PLUG_AIR_V2_MOD_NAMES : PLUG_AIR_V1_MOD_NAMES
    const revNames = deviceId === 'plugair_v2' ? PLUG_AIR_V2_REVERB_NAMES : PLUG_AIR_V1_REVERB_NAMES
    settings.push({ slot: 'Amp', enabled: true, selection: ampNames[d[9]] ?? `Amp #${d[9]}`,
      params: { Gain: d[10], Level: d[11], Bass: d[12], Mid: d[13], Treble: d[14], ...(d[15] ? { Tone: d[15] } : {}) } })
    settings.push({ slot: 'Cabinet', enabled: stdEnabled(d[16]), selection: PLUG_AIR_CAB_NAMES[d[17]] ?? `Cab #${d[17]}`,
      params: { Level: d[18] } })
    settings.push({ slot: 'Noise Gate', enabled: stdEnabled(d[0]), selection: 'Noise Gate',
      params: { Threshold: d[1], Sustain: d[2] } })
    if (stdEnabled(d[3]))  settings.push({ slot: 'EFX', enabled: true, selection: PLUG_AIR_EFX_NAMES[d[4]] ?? `EFX #${d[4]}`,
      params: { P1: d[5], P2: d[6], P3: d[7] } })
    if (stdEnabled(d[19])) settings.push({ slot: 'Modulation', enabled: true, selection: modNames[d[20]] ?? `Mod #${d[20]}`,
      params: { Rate: d[21], Depth: d[22], Mix: d[23] } })
    if (stdEnabled(d[24])) settings.push({ slot: 'Delay', enabled: true, selection: PLUG_AIR_DELAY_NAMES[d[25]] ?? `Delay #${d[25]}`,
      params: { Time: d[26], Feedback: d[27], Mix: d[28] } })
    if (stdEnabled(d[29])) settings.push({ slot: 'Reverb', enabled: true, selection: revNames[d[30]] ?? `Reverb #${d[30]}`,
      params: { Decay: d[31], Damp: d[32], Mix: d[33] } })

  } else if (deviceId === 'lite') {
    settings.push({ slot: 'Amp', enabled: true, selection: LITE_AMP_NAMES[0],
      params: { Gain: d[7], Level: d[8], Tone: d[12] } })
    settings.push({ slot: 'Noise Gate', enabled: stdEnabled(d[0]), selection: 'Noise Gate',
      params: { Threshold: d[1], Sustain: d[2] } })
    if (stdEnabled(d[13])) settings.push({ slot: 'Modulation', enabled: true, selection: LITE_MOD_NAMES[d[14]] ?? `Mod #${d[14]}`,
      params: { Rate: d[15], Depth: d[16] } })
    if (stdEnabled(d[18])) {
      const ambType = d[19]
      if (ambType >= 10) {
        const revId = ambType - 10
        settings.push({ slot: 'Reverb', enabled: true, selection: LITE_AMBIENCE_NAMES[ambType] ?? `Reverb #${revId}`,
          params: { Decay: d[21], Mix: d[22] } })
      } else {
        settings.push({ slot: 'Delay', enabled: true, selection: LITE_AMBIENCE_NAMES[ambType] ?? `Delay #${ambType}`,
          params: { Time: d[24], Feedback: d[25], Mix: d[26] } })
      }
    }

  } else if (deviceId === '8bt') {
    settings.push({ slot: 'Amp', enabled: true, selection: LITE_AMP_NAMES[0],
      params: { Gain: d[7], Level: d[8], Tone: d[12] } })
    settings.push({ slot: 'Noise Gate', enabled: stdEnabled(d[0]), selection: 'Noise Gate',
      params: { Threshold: d[1], Sustain: d[2] } })
    if (stdEnabled(d[13])) settings.push({ slot: 'Modulation', enabled: true, selection: LITE_MOD_NAMES[d[14]] ?? `Mod #${d[14]}`,
      params: { Rate: d[15], Depth: d[16] } })
    if (stdEnabled(d[32])) settings.push({ slot: 'Reverb', enabled: true, selection: LITE_8BT_REVERB_NAMES[d[20]] ?? `Reverb #${d[20]}`,
      params: { Decay: d[21], Mix: d[22] } })
    if (stdEnabled(d[33])) settings.push({ slot: 'Delay', enabled: true, selection: LITE_8BT_DELAY_NAMES[d[23]] ?? `Delay #${d[23]}`,
      params: { Time: d[24], Feedback: d[25], Mix: d[26] } })

  } else if (deviceId === '2040bt') {
    settings.push({ slot: 'Amp', enabled: true, selection: BT2040_AMP_NAMES[0],
      params: { Gain: d[5], Level: d[6], Bass: d[7], Mid: d[8], Treble: d[9] } })
    settings.push({ slot: 'Noise Gate', enabled: stdEnabled(d[0]), selection: 'Noise Gate',
      params: { Threshold: d[1] } })
    if (stdEnabled(d[2]))  settings.push({ slot: 'Wah', enabled: true, selection: 'Wah Pedal', params: { Pedal: d[3] } })
    if (stdEnabled(d[10])) settings.push({ slot: 'Modulation', enabled: true, selection: BT2040_MOD_NAMES[d[11]] ?? `Mod #${d[11]}`,
      params: { Rate: d[12], Depth: d[13], Mix: d[14] } })
    if (stdEnabled(d[15])) settings.push({ slot: 'Delay', enabled: true, selection: BT2040_DELAY_NAMES[d[16]] ?? `Delay #${d[16]}`,
      params: { Time: d[17], Feedback: d[18], Mix: d[19] } })
    if (stdEnabled(d[20])) settings.push({ slot: 'Reverb', enabled: true, selection: BT2040_REVERB_NAMES[d[21]] ?? `Reverb #${d[21]}`,
      params: { Decay: d[22], Damp: d[23], Mix: d[24] } })
  }

  return settings
}

export function decodeQRString(qrString: string): { presetName: string; deviceName: string; deviceId?: string; settings: SettingRow[] } | null {
  if (!qrString.startsWith('nux://MightyAmp:')) return null
  try {
    const buf = Buffer.from(qrString.slice(16), 'base64')
    const deviceName = QR_ID_DISPLAY[buf[0]] ?? 'NUX MightyAmp'
    const deviceId = QR_ID_VERSION_TO_DEVICE[`${buf[0]}_${buf[1]}`]

    if (buf.length < 115) {
      const d = buf.slice(2)
      const settings = deviceId ? decodeStandardSettings(d, deviceId) : []
      return { presetName: 'Imported Preset', deviceName, deviceId, settings }
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

    return { presetName, deviceName, deviceId, settings }
  } catch { return null }
}
