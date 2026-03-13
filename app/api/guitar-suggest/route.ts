import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import type { SettingRow } from '@/lib/server/qr-encoder'
import type { GuitarSetup } from '@/lib/server/nux'

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', gemini: 'gemini-2.0-flash', grok: 'grok-3-mini', mistral: 'mistral-small-latest', groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2', lmstudio: 'llama3.2', openwebui: 'llama3.2',
}

function normalizeBaseUrl(url: string, provider: string): string {
  const needsV1 = ['ollama', 'lmstudio', 'openwebui']
  let normalized = process.env.RUNNING_IN_DOCKER === 'true'
    ? url.replace(/\blocalhost\b/g, 'host.docker.internal')
    : url
  if (needsV1.includes(provider) && normalized && !normalized.endsWith('/v1') && !normalized.includes('/v1/')) {
    normalized = normalized.replace(/\/$/, '') + '/v1'
  }
  return normalized
}

const GUITAR_TOOL: Anthropic.Tool = {
  name: 'set_guitar_setup',
  description: 'Return guitar setup recommendations for the given tone',
  input_schema: {
    type: 'object' as const,
    properties: {
      pickup:     { type: 'string', description: 'Selected pickup(s), e.g. "Bridge", "Neck", "Bridge+Neck", "All three"' },
      pickupType: { type: 'string', description: 'Pickup type, e.g. "Humbucker", "Single-coil", "P90"' },
      controls:   {
        type: 'array',
        description: 'Vol and tone knob values (0-10). For single pickup: "Vol", "Tone". For two pickups: "Neck Vol", "Bridge Tone", etc.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'number', minimum: 0, maximum: 10 },
          },
          required: ['label', 'value'],
        },
      },
    },
    required: ['pickup', 'pickupType', 'controls'],
  },
}

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { settings, deviceName } = body as { settings: SettingRow[]; deviceName: string }

  if (!Array.isArray(settings)) return NextResponse.json({ error: 'Missing settings' }, { status: 400 })

  const settingsText = settings.map(s =>
    `- ${s.slot}: ${s.selection}${s.enabled ? '' : ' (off)'}${
      s.params && Object.keys(s.params).length > 0
        ? ' (' + Object.entries(s.params).map(([k, v]) => `${k}: ${v}`).join(', ') + ')'
        : ''
    }`
  ).join('\n')

  const prompt = `Based on these ${deviceName} amp settings, recommend which guitar pickup to select, the ideal pickup type, and Vol/Tone knob values (0-10).\n\nSettings:\n${settingsText}\n\nCall set_guitar_setup with your recommendations.`

  const userApiKey   = (request.headers.get('x-user-api-key') ?? '').trim()
  const userProvider = (request.headers.get('x-provider') ?? '').trim()
  const userBaseUrl  = (request.headers.get('x-base-url') ?? '').trim()
  const userModel    = (request.headers.get('x-model') ?? '').trim()
  const isByok = !!userApiKey || !!userBaseUrl

  try {
    let guitar: GuitarSetup | null = null

    const runAnthropicSuggest = async (client: Anthropic, model?: string) => {
      const res = await client.messages.create({
        model: model ?? 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        tools: [GUITAR_TOOL],
        tool_choice: { type: 'tool', name: 'set_guitar_setup' },
        messages: [{ role: 'user', content: prompt }],
      })
      const toolUse = res.content.find(b => b.type === 'tool_use')
      if (toolUse && toolUse.type === 'tool_use') return toolUse.input as GuitarSetup
      return null
    }

    if (!isByok) {
      const serverKey = process.env.ANTHROPIC_API_KEY
      if (!serverKey) return NextResponse.json({ error: 'No API key configured.' }, { status: 400 })
      const freeModel = process.env.FREE_MODEL || 'claude-haiku-4-5-20251001'
      guitar = await runAnthropicSuggest(new Anthropic({ apiKey: serverKey }), freeModel)
    } else if (!userProvider || userProvider === 'anthropic') {
      guitar = await runAnthropicSuggest(new Anthropic({ apiKey: userApiKey }), userModel || undefined)
    } else {
      // OpenAI-compatible providers — request JSON directly
      const baseUrl = normalizeBaseUrl(userBaseUrl, userProvider)
      const model = userModel || DEFAULT_MODELS[userProvider] || 'llama3.2'
      const { OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey: userApiKey || 'none', baseURL: baseUrl })
      const res = await client.chat.completions.create({
        model,
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a guitar tone expert. Respond only with valid JSON matching: { "pickup": string, "pickupType": string, "controls": [{ "label": string, "value": number }] }' },
          { role: 'user', content: prompt },
        ],
      })
      try {
        const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
        if (parsed.pickup) guitar = parsed as GuitarSetup
      } catch { /* ignore parse errors */ }
    }

    if (!guitar) return NextResponse.json({ error: 'No suggestions generated.' }, { status: 500 })
    return NextResponse.json({ guitar })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
