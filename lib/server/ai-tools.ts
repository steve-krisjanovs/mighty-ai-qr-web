import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { generateQR } from './qr-encoder'
import type { ProPresetParams } from './nux'

export const generateQRTool: Anthropic.Tool = {
  name: 'generateQR',
  description: `Generate a NUX MightyAmp-compatible QR code from structured tone parameters.
Call this whenever the user asks for a tone, preset, or patch.
All parameter values (gain, master, bass, mid, treble, etc.) are integers 0-100.
Always default to device "plugpro" unless the user specifies otherwise.`,
  input_schema: {
    type: 'object' as const,
    required: ['device', 'preset_name', 'amp', 'cabinet', 'noise_gate', 'master_db'],
    properties: {
      device: { type: 'string', enum: ['plugpro', 'space', 'litemk2', '8btmk2', 'plugair_v1', 'plugair_v2', 'lite', '8bt', '2040bt'], description: 'Target NUX device. Default: plugpro' },
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

export const SYSTEM_PROMPT = `You are Mighty AI, a guitar tone expert and NUX MightyAmp specialist.
You help guitarists dial in perfect tones from natural language descriptions — artist names, songs, genres, moods.

When a user asks for a tone, ALWAYS call the generateQR tool to produce a scannable QR code.
After calling the tool, respond conversationally — describe what you chose and why in 2-3 sentences.
Keep it concise and guitar-focused. Don't explain the technical bytes.

IMPORTANT: Only ever generate ONE tone per message. You can only call the tool once per response.
If the user asks for multiple tones (e.g. "give me three options"), generate the best single option now and tell them to ask for the next one. For example: "Here's my top pick — ask me for another variation if you'd like a different take."
Never promise to generate multiple tones in one go.

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
- Clean/jazz: JazzClean or TwinRvb, gain 10-25, Bright=1
- Blues/crunch: DeluxeRvb or BritBlues, gain 35-55
- Classic rock: Plexi100 or Plexi45, gain 50-68
- British rock: Brit800, gain 55-72
- High gain/metal: DualRect, DIEVH4, Slo100, UberHiGain, gain 70-90
- Acoustic: OptimaAir amp + GHBIRDPro cab

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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  message: string
  qr?: Awaited<ReturnType<typeof generateQR>>
}

export async function runChat(client: Anthropic, messages: ChatMessage[], model = 'claude-sonnet-4-6'): Promise<ChatResult> {
  const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))

  const response = await client.messages.create({
    model, max_tokens: 1024, system: SYSTEM_PROMPT, tools: [generateQRTool], messages: anthropicMessages,
  })

  if (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Expected tool_use block')

    const params = toolUse.input as ProPresetParams
    const qrResult = await generateQR(params)

    const followUp = await client.messages.create({
      model, max_tokens: 512, system: SYSTEM_PROMPT, tools: [generateQRTool],
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

const generateQRToolOpenAI: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: { name: generateQRTool.name, description: generateQRTool.description, parameters: generateQRTool.input_schema as Record<string, unknown> },
}

export async function runChatOpenAI(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[]): Promise<ChatResult> {
  const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey }
  if (baseUrl) clientOpts.baseURL = baseUrl

  const client = new OpenAI(clientOpts)
  const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const response = await client.chat.completions.create({ model, max_tokens: 1024, messages: openAIMessages, tools: [generateQRToolOpenAI], tool_choice: 'auto' })
  const choice = response.choices[0]

  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0]
    if (toolCall.type !== 'function') throw new Error('Expected function tool call')
    const params = JSON.parse(toolCall.function.arguments) as ProPresetParams
    const qrResult = await generateQR(params)

    const followUp = await client.chat.completions.create({
      model, max_tokens: 512,
      messages: [ ...openAIMessages, choice.message, { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, preset_name: qrResult.presetName }) } ],
      tools: [generateQRToolOpenAI],
    })
    const msg = followUp.choices[0].message
    return { message: textContent(msg), qr: qrResult }
  }

  return { message: textContent(choice.message) }
}

// Some reasoning models (e.g. gpt-oss, DeepSeek-R1) return empty content with text in a
// non-standard `reasoning` field. Fall back to it when content is empty.
function textContent(msg: { content?: string | null; [k: string]: unknown }): string {
  if (msg.content) return msg.content
  const r = (msg as Record<string, unknown>).reasoning
  return typeof r === 'string' ? r : ''
}
