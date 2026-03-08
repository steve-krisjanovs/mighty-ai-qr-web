import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { generateQR } from './qr-encoder'
import type { ProPresetParams } from './nux'

export const generateQRTool: Anthropic.Tool = {
  name: 'generateQR',
  description: `Generate a NUX MightyAmp-compatible QR code from structured tone parameters.
Call this whenever the user asks for a tone, preset, or patch.
All parameter values (gain, master, bass, mid, treble, etc.) are integers 0-100.
Use the device specified in the system prompt unless the user requests a different one.`,
  input_schema: {
    type: 'object' as const,
    required: ['device', 'preset_name', 'amp', 'cabinet', 'noise_gate', 'master_db'],
    properties: {
      device: { type: 'string', enum: ['plugpro', 'space', 'litemk2', '8btmk2', 'plugair_v1', 'plugair_v2', 'lite', '8bt', '2040bt'], description: 'Target NUX device. Use the default from the system prompt unless the user specifies otherwise.' },
      preset_name: { type: 'string', description: 'Short descriptive name for the preset' },
      amp: {
        type: 'object', required: ['id', 'gain', 'master', 'bass', 'mid', 'treble'],
        properties: {
          id: { type: 'number' }, gain: { type: 'number', minimum: 0, maximum: 100 },
          master: { type: 'number', minimum: 0, maximum: 100 }, bass: { type: 'number', minimum: 0, maximum: 100 },
          mid: { type: 'number', minimum: 0, maximum: 100 }, treble: { type: 'number', minimum: 0, maximum: 100 },
          param6: { type: 'number' }, param7: { type: 'number' },
        },
      },
      cabinet: {
        type: 'object', required: ['id', 'level_db', 'low_cut_hz', 'high_cut'],
        properties: {
          id: { type: 'number' }, level_db: { type: 'number', minimum: -12, maximum: 12 },
          low_cut_hz: { type: 'number', minimum: 20, maximum: 300 }, high_cut: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
      noise_gate: {
        type: 'object', required: ['enabled', 'sensitivity', 'decay'],
        properties: { enabled: { type: 'boolean' }, sensitivity: { type: 'number', minimum: 0, maximum: 100 }, decay: { type: 'number', minimum: 0, maximum: 100 } },
      },
      efx:        { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' }, p5: { type: 'number' } } },
      compressor: { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      modulation: { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      delay:      { type: 'object', required: ['id', 'enabled', 'p1', 'p2', 'p3'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      reverb:     { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      eq:         { type: 'object', required: ['id', 'enabled', 'bands'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, bands: { type: 'array', items: { type: 'number', minimum: -15, maximum: 15 } } } },
      master_db:  { type: 'number', minimum: -12, maximum: 12 },
      guitar: {
        type: 'object',
        description: 'Recommended guitar setup to complement this tone',
        properties: {
          pickup:     { type: 'string', description: 'Selected pickup(s), e.g. "Bridge", "Neck", "Bridge+Neck", "All three"' },
          pickupType: { type: 'string', description: 'Pickup type, e.g. "Humbucker", "Single-coil", "P90", "Humbucker/Single-coil"' },
          controls: {
            type: 'array',
            description: 'Volume and tone knob recommendations. Use specific labels when multiple pickups are active, e.g. "Neck Vol", "Bridge Tone". For single pickup: "Vol", "Tone". Omit controls that don\'t apply (e.g. Tele bridge has no tone knob).',
            items: {
              type: 'object',
              required: ['label', 'value'],
              properties: {
                label: { type: 'string' },
                value: { type: 'number', minimum: 0, maximum: 10 },
              },
            },
          },
        },
      },
    },
  },
}

const SHARED_HEADER = `You are Mighty AI, a guitar and bass tone expert and NUX MightyAmp specialist.
You help musicians dial in perfect tones from natural language descriptions — artist names, songs, genres, moods.

When a user asks for a tone, ALWAYS call the generateQR tool to produce a scannable QR code.
After calling the tool, respond conversationally — describe what you chose and why in 2-3 sentences.
Keep it concise and tone-focused. Don't explain the technical bytes.

IMPORTANT: Only ever generate ONE tone per message. You can only call the tool once per response.
If the user asks for multiple tones (e.g. "give me three options"), generate the best single option now and tell them to ask for the next one. For example: "Here's my top pick — ask me for another variation if you'd like a different take."
Never promise to generate multiple tones in one go.

CRITICAL — Effects that define a tone MUST be included:
If fuzz, distortion, overdrive, wah, chorus, or any other effect is the defining characteristic of the requested tone, you MUST include it in the tool call with enabled: true. Omitting the key effect produces a wrong patch. When in doubt, include the effect — a patch with an imperfect effect is always better than one missing it entirely.

NUX PlugPro Amp models (use the nuxIndex number):
1=JazzClean (Roland JC-120), 2=DeluxeRvb (Fender Deluxe Reverb), 3=BassMate (bass),
4=Tweedy (Fender Tweed), 5=TwinRvb (Fender Twin), 6=HiWire (Hiwatt DR-103),
7=CaliCrunch (Mesa Mk I), 8=ClassA15 (Vox AC15), 9=ClassA30 (Vox AC30),
10=Plexi100 (Marshall Super Lead 100W), 11=Plexi45 (Marshall Plexi 45W),
12=Brit800 (Marshall JCM800), 13=Pl1987x50 (Marshall 1987x 50W),
14=Slo100 (Soldano SLO-100), 15=FiremanHBE (Engl Fireman),
16=DualRect (Mesa Dual Rectifier), 17=DIEVH4 (EVH 5150 III),
18=VibroKing (Fender Vibroking), 19=Budda (Budda Superdrive),
20=MrZ38 (Dr. Z MAZ 38), 21=SuperRvb (Fender Super Reverb),
22=BritBlues (Marshall Bluesbreaker), 23=MatchD30 (Matchless DC-30),
24=Brit2000 (Marshall DSL/TSL), 25=UberHiGain (Framus Cobra),
28=OptimaAir (acoustic), 29=Stageman (acoustic stage)

PlugPro Cabinets (nuxIndex):
1=JZ120Pro, 2=DR112Pro, 3=TR212Pro, 4=HIWIRE412, 5=CALI112, 6=A112,
7=GB412Pro, 8=M1960AX, 9=M1960AV, 10=M1960TV, 11=SLO412, 12=FIREMAN412,
13=RECT412, 14=DIE412, 15=MATCH212, 16=UBER412, 18=A212Pro, 19=M1960AHW,
20=M1936, 21=BUDDA112, 22=Z212, 23=SUPERVERB410, 24=VIBROKING310,
32=GHBIRDPro (acoustic), 33=GJ15Pro, 34=MD45Pro

PlugPro EFX pedals (nuxIndex):
1=Distortion+, 2=RC Boost, 3=AC Boost, 4=Dist One (RAT), 5=T Screamer (TS-808),
6=Blues Drive (BD-2), 7=Morning Drive (JHS), 8=Eat Dist (Big Muff),
9=Red Dirt, 10=Crunch, 11=Muff Fuzz, 12=Katana boost, 13=ST Singer (Zendrive)

PlugPro Reverbs: 1=Room, 2=Hall, 3=Plate, 4=Spring, 5=Shimmer, 6=Damp
PlugPro Delays:  1=Analog, 2=Digital, 3=Mod, 4=Tape Echo, 5=Pan, 6=Phi
PlugPro Mods:    1=CE-1, 2=CE-2, 3=ST Chorus, 4=Vibrato, 5=Detune, 6=Flanger,
                 7=Phase 90, 8=Phase 100, 9=SCF, 10=U-Vibe, 11=Tremolo, 12=Rotary

Tone vocabulary guide:
- Clean/jazz: JazzClean or TwinRvb, gain 10-25
- Blues/crunch: DeluxeRvb or BritBlues, gain 35-55
- Classic rock: Plexi100 or Plexi45, gain 50-68
- British rock: Brit800, gain 55-72
- High gain/metal: DualRect, DIEVH4, Slo100, UberHiGain, gain 70-90
- Acoustic: OptimaAir amp + GHBIRDPro cab

Bass tone guide (use amp id=3 BassMate for all bass patches):
- Clean bass: BassMate, gain 20-35, cab DR112Pro or TR212Pro
- Driven/gritty bass: BassMate, gain 50-65, efx Blues Drive (id=6) or T Screamer (id=5) enabled
- Heavy fuzz bass (e.g. Beastie Boys, Muse, Jack White): BassMate, gain 60-75, efx Muff Fuzz (id=11) or Eat Dist (id=8) enabled with p1 (fuzz) 70-90, p2 (tone) 50-70
- Punk/aggressive bass: BassMate, gain 65-80, efx Dist One (id=4) or Crunch (id=10) enabled
For bass, the guitar field should describe bass pickup position (Bridge, Neck) and pickup type (e.g. "Split-coil/P-bass", "Dual-coil/J-bass").

Always pair the amp with a matching cabinet. Match Marshall amps to Marshall cabs (M1960AX/AV).
Match Fender amps to Fender-style cabs (DR112Pro, TR212Pro). Mesa to RECT412 etc.
Default master_db to 0. Enable noise_gate for any gain above 50.

Always include a guitar setup recommendation in the guitar field:
- pickup: which pickup(s) to select ("Bridge", "Neck", "Middle", "Bridge+Neck", "Bridge+Middle", "Neck+Middle", "All three")
- pickupType: the ideal pickup type for this tone ("Humbucker", "Single-coil", "P90", "Humbucker/Single-coil")
- controls: volume and tone knob settings (0–10). Rules:
  - Single pickup active: use labels "Vol" and "Tone"
  - Two pickups active (e.g. Bridge+Neck on a Les Paul): use "Neck Vol", "Neck Tone", "Bridge Vol", "Bridge Tone"
  - Omit controls that don't exist on common guitars (e.g. Telecaster bridge pickup has no tone knob)
  - Vol 10 is standard; roll back to 7–8 for mild breakup cleanup with a hot amp
  - Tone 10 = full bright, 5–7 = warm/rounded, 0–3 = very dark/muffled`

export const SYSTEM_PROMPT_FULL = SHARED_HEADER + `

EFX pedal selection guide:
- RC Boost / AC Boost / Katana (id=2,3,12): clean boost — push an amp into natural breakup without coloring tone; use p1=60-80 for subtle drive
- Blues Drive BD-2 (id=6): transparent, dynamic overdrive — blues, light crunch, country; p1=gain 40-65, p2=tone 50-70
- Morning Drive (id=7): warm transparent overdrive — roots rock, classic rock leads; p1=gain 45-65
- T Screamer TS-808 (id=5): mid-hump overdrive — blues leads, classic rock; or stack into high-gain amp (p1=gain 30-45) to tighten and focus it
- Red Dirt (id=9): mid-gain all-rounder overdrive — versatile crunch, country lead
- Dist One RAT (id=4): aggressive gritty distortion — punk, indie, alternative, hard rock; p1=distortion 60-80
- Crunch (id=10): natural amp-style crunch — British hard rock
- Distortion+ (id=1): MXR-style hard clipping — hard rock, heavy crunch
- Eat Dist Big Muff (id=8): thick sustained fuzz — grunge, stoner rock, shoegaze, heavy fuzz bass; p1=sustain 70-90, p2=tone 40-70
- Muff Fuzz (id=11): fuzz, slightly brighter voicing — psychedelic rock, Hendrix fuzz, heavy bass; p1=fuzz 70-90
- ST Singer Zendrive (id=13): smooth vocal overdrive — Santana, smooth woman-tone lead; p1=drive 40-60, p2=tone 50

EFX stacking strategy:
- T Screamer (gain 30-40, tone 50) → high-gain amp = tighter, punchier high gain (classic metal/thrash trick)
- Clean boost → edge-of-breakup amp = pushed blues tone with amp character
- Fuzz (Big Muff/Muff Fuzz) → relatively clean amp = best fuzz tone; do NOT stack fuzz into an already-distorted amp

Compressor usage (enable for these styles):
- Country, funk, clean single-coil, fingerpicking, slap bass: id=1, p1 (sensitivity)=55, p2 (level)=65
- Sustain on clean leads: id=1, p1=40, p2=70
- Skip compressor for high-gain tones (noise gate handles dynamics there)

EQ usage (add when amp EQ alone isn't enough):
- Metal/djent scooped: cut mids (bands 3-4 at -5 to -8), slight bass/treble boost — bands array e.g. [2, 0, -6, -6, 3]
- Blues/rock lead mid-boost: bands 3-4 at +3 to +5 — e.g. [0, 0, 4, 4, 0]
- Acoustic warmth: gentle treble roll-off — e.g. [0, 0, 0, -2, -4]
- Only enable EQ when it meaningfully changes the character; leave disabled for tones where the amp EQ suffices

Modulation guide (add when it defines the style):
- CE-1 / CE-2 (id=1,2): 80s clean chorus, new wave, soft rock — p1=rate 30-50, p2=depth 40-60
- ST Chorus (id=3): lush chorus — Nirvana clean, 90s alternative; p1=rate 40, p2=depth 60
- Flanger (id=6): jet-sweep — Van Halen, hard rock intro; p1=rate 30-50, p2=depth 60-80
- Phase 90 / Phase 100 (id=7,8): phasing — 70s rock, funk, Hendrix, early EVH; p1=rate 40-60
- U-Vibe (id=10): rotary/chorus vibe — Hendrix, SRV, psychedelic; p1=rate 40-55, p2=depth 65
- Tremolo (id=11): amplitude tremolo — surf, country, vintage rock; p1=rate 50-70, p2=depth 55-75
- Rotary (id=12): Leslie cabinet — organ-style, Beatles psychedelic; p1=speed 40-60
- Vibrato (id=4): pitch vibrato — surf, whammy-arm effect; p1=rate 40, p2=depth 50
- Detune (id=5): subtle doubling — wide stereo clean tones; p1=depth 20-40
- Skip modulation for high-gain metal and most heavy tones unless specifically requested`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  message: string
  qr?: Awaited<ReturnType<typeof generateQR>>
}

export async function runChat(client: Anthropic, messages: ChatMessage[], model = 'claude-sonnet-4-6', systemPrompt = SYSTEM_PROMPT_FULL): Promise<ChatResult> {
  const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))

  const response = await client.messages.create({
    model, max_tokens: 1024, system: systemPrompt, tools: [generateQRTool], messages: anthropicMessages,
  })

  if (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Expected tool_use block')

    const params = toolUse.input as ProPresetParams
    const qrResult = await generateQR(params)

    const followUp = await client.messages.create({
      model, max_tokens: 512, system: systemPrompt, tools: [generateQRTool],
      messages: [
        ...anthropicMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ success: true, preset_name: qrResult.presetName }) }] },
      ],
    })

    const textBlock = followUp.content.find(b => b.type === 'text')
    return { message: textBlock?.type === 'text' ? textBlock.text : '', qr: qrResult }
  }

  const textBlock = response.content.find(b => b.type === 'text')
  return { message: textBlock?.type === 'text' ? textBlock.text : '' }
}

const VALID_DEVICES = new Set(['plugpro','space','litemk2','8btmk2','plugair_v1','plugair_v2','lite','8bt','2040bt'])

function n(v: unknown, fallback: number): number {
  const x = Number(v)
  return isFinite(x) ? x : fallback
}

function b(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 1) return true
  if (v === 'false' || v === 0) return false
  return fallback
}

// Normalises raw LLM tool-call arguments into a valid ProPresetParams.
// Local models often ignore the JSON schema and use different field names.
function coerceParams(raw: Record<string, unknown>): ProPresetParams {
  const amp = (raw.amp as Record<string, unknown>) ?? {}
  const cab = (raw.cabinet as Record<string, unknown>) ?? {}
  const ng  = (raw.noise_gate as Record<string, unknown>) ?? {}

  const coerced: ProPresetParams = {
    device:      VALID_DEVICES.has(raw.device as string) ? raw.device as ProPresetParams['device'] : 'plugpro',
    preset_name: (raw.preset_name as string) || 'My Tone',
    amp: {
      id:     n(amp.id ?? amp.nuxIndex, 2),
      gain:   n(amp.gain, 50),
      master: n(amp.master ?? amp.volume ?? amp.master_volume, 70),
      bass:   n(amp.bass, 50),
      mid:    n(amp.mid, 50),
      treble: n(amp.treble, 50),
      ...(amp.param6  !== undefined ? { param6: n(amp.param6, 50) }  : {}),
      ...(amp.param7  !== undefined ? { param7: n(amp.param7, 50) }  : {}),
    },
    cabinet: {
      id:          n(cab.id ?? cab.nuxIndex, 2),
      level_db:    n(cab.level_db ?? cab.level, 0),
      low_cut_hz:  n(cab.low_cut_hz ?? cab.low_cut, 80),
      high_cut:    n(cab.high_cut, 50),
    },
    noise_gate: {
      enabled:     b(ng.enabled ?? ng.active, false),
      sensitivity: n(ng.sensitivity ?? ng.threshold, 50),
      decay:       n(ng.decay ?? ng.release, 50),
    },
    master_db: n(raw.master_db, 0),
  }

  // Optional effects — only include if present and has an id
  for (const key of ['efx','compressor','modulation','delay','reverb'] as const) {
    const e = raw[key] as Record<string, unknown> | undefined
    if (!e || n(e.id, 0) === 0) continue
    ;(coerced as unknown as Record<string, unknown>)[key] = {
      id: n(e.id, 1), enabled: b(e.enabled ?? e.active, false),
      p1: n(e.p1 ?? e.param1, 50), p2: n(e.p2 ?? e.param2, 50),
      ...(e.p3 !== undefined ? { p3: n(e.p3, 50) } : {}),
      ...(e.p4 !== undefined ? { p4: n(e.p4, 50) } : {}),
      ...(e.p5 !== undefined ? { p5: n(e.p5, 50) } : {}),
    }
  }

  if (raw.guitar && typeof raw.guitar === 'object') {
    const g = raw.guitar as Record<string, unknown>
    let controls = g.controls
    // Some models return controls as an object {label: value} instead of [{label, value}]
    if (controls && !Array.isArray(controls) && typeof controls === 'object') {
      controls = Object.entries(controls as Record<string, unknown>).map(([label, value]) => ({ label, value: n(value, 5) }))
    }
    coerced.guitar = { ...g, controls } as ProPresetParams['guitar']
  }

  return coerced
}

const generateQRToolOpenAI: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: { name: generateQRTool.name, description: generateQRTool.description, parameters: generateQRTool.input_schema as Record<string, unknown> },
}

export async function runChatOpenAI(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[], systemPrompt = SYSTEM_PROMPT_FULL): Promise<ChatResult> {
  const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey, timeout: 5 * 60 * 1000, maxRetries: 0 }
  if (baseUrl) clientOpts.baseURL = baseUrl

  const client = new OpenAI(clientOpts)
  const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.chat.completions.create as any)({ model, max_tokens: 1024, messages: openAIMessages, tools: [generateQRToolOpenAI], tool_choice: 'auto', extra_body: { keep_alive: -1 } })
  const choice = response.choices[0]

  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0]
    if (toolCall.type !== 'function') throw new Error('Expected function tool call')
    const params = coerceParams(JSON.parse(toolCall.function.arguments))
    const qrResult = await generateQR(params)

    // Some models include a clean description alongside the tool call — use it to skip the follow-up.
    // Ignore it if it looks like verbose reasoning (too long or contains thinking patterns).
    const inlineText = textContent(choice.message)
    const looksLikeReasoning = inlineText.length > 400 || (inlineText.match(/\?/g) ?? []).length > 2
    if (inlineText && !looksLikeReasoning) return { message: inlineText, qr: qrResult }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const followUp = await (client.chat.completions.create as any)({
      model, max_tokens: 512,
      messages: [ ...openAIMessages, choice.message, { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, preset_name: qrResult.presetName }) } ],
      tools: [generateQRToolOpenAI],
      extra_body: { keep_alive: -1 },
    })
    const msg = followUp.choices[0].message
    return { message: textContent(msg), qr: qrResult }
  }

  const text = textContent(choice.message)

  // Fallback: some local models embed the JSON tool call in content text
  const embedded = extractEmbeddedToolCall(text)
  if (embedded) {
    const params = coerceParams(embedded)
    const qrResult = await generateQR(params)
    const followUp = await client.chat.completions.create({
      model, max_tokens: 512,
      messages: [ ...openAIMessages, { role: 'assistant', content: text }, { role: 'user', content: 'The QR code was generated successfully. Now describe the tone you created in 2-3 sentences.' } ],
    })
    return { message: textContent(followUp.choices[0].message), qr: qrResult }
  }

  return { message: text }
}

// Some reasoning models (e.g. gpt-oss, DeepSeek-R1) return empty content with text in a
// non-standard `reasoning` field. Fall back to it when content is empty.
function textContent(msg: { content?: string | null }): string {
  if (msg.content) return msg.content
  const r = (msg as unknown as Record<string, unknown>).reasoning
  return typeof r === 'string' ? r : ''
}

// Some local models embed the tool call JSON directly in the content text instead of using
// the tool_calls field. Try to extract it so we can still generate the QR.
function extractEmbeddedToolCall(text: string): Record<string, unknown> | null {
  // Find the outermost JSON object in the text
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) {
      try {
        const obj = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>
        // Must look like a generateQR call — needs at least amp and preset_name
        if (obj.amp && (obj.preset_name || obj.device)) return obj
      } catch { return null }
    }}
  }
  return null
}
