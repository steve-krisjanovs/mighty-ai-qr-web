import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { runChat, runChatOpenAI, SYSTEM_PROMPT_FULL } from '@/lib/server/ai-tools'
import { decodeQRString } from '@/lib/server/qr-encoder'
import { DEVICES } from '@/lib/server/nux'

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

export const maxDuration = 300

export async function POST(request: NextRequest) {
  console.log('[convert] request received')
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { qrString, targetDevice, presetName: nameOverride } = body

  if (!qrString || typeof qrString !== 'string' || !targetDevice || typeof targetDevice !== 'string') {
    return NextResponse.json({ error: 'Missing qrString or targetDevice' }, { status: 400 })
  }

  const decoded = decodeQRString(qrString)
  if (!decoded) return NextResponse.json({ error: 'Invalid QR code' }, { status: 400 })

  const targetConfig = DEVICES[targetDevice as keyof typeof DEVICES]
  if (!targetConfig) return NextResponse.json({ error: 'Unknown target device' }, { status: 400 })

  const rawName = (typeof nameOverride === 'string' && nameOverride.trim()) ? nameOverride.trim() : decoded.presetName
  const GENERIC_NAMES = ['my tone', 'custom tone', 'new preset', 'untitled']
  const isGeneric = GENERIC_NAMES.includes(rawName.toLowerCase())
  const displayName = isGeneric ? null : rawName

  const settingsText = decoded.settings.map(s =>
    `- ${s.slot}: ${s.selection}${s.enabled ? '' : ' (off)'}${
      s.params && Object.keys(s.params).length > 0
        ? ' (' + Object.entries(s.params).map(([k, v]) => `${k}: ${v}`).join(', ') + ')'
        : ''
    }`
  ).join('\n')

  const conversionMessage = `Convert this preset to my ${targetConfig.displayName}. Recreate it as faithfully as possible, adapting the effects to what's available on the ${targetConfig.displayName}.

Source preset: "${displayName ?? decoded.presetName}" (from ${decoded.deviceName})
Settings:
${settingsText}

Generate a QR code for the ${targetConfig.displayName} using the closest available settings.${displayName ? ` Use preset name "${displayName}".` : ' Generate a descriptive preset name based on the tone (artist, song, or style).'} IMPORTANT: you MUST call the tool with device="${targetDevice}" — this is required.`

  const userApiKey   = (request.headers.get('x-user-api-key') ?? '').trim()
  const userProvider = (request.headers.get('x-provider') ?? '').trim()
  const userBaseUrl  = (request.headers.get('x-base-url') ?? '').trim()
  const userModel    = (request.headers.get('x-model') ?? '').trim()

  const deviceInstruction = `The user's NUX device for this conversion is "${targetDevice}" (${targetConfig.displayName}). You MUST call the QR generation tool with device="${targetDevice}". Do NOT use any other device ID.\n\n`
  const systemFull = deviceInstruction + SYSTEM_PROMPT_FULL

  const messages = [{ role: 'user' as const, content: conversionMessage }]
  const isByok = !!userApiKey || !!userBaseUrl
  const needsKey = !isByok && !!userProvider && userProvider !== 'anthropic' && userProvider !== 'builtin'

  console.log(`[convert] targetDevice=${targetDevice} provider=${userProvider || 'builtin'} byok=${isByok}`)

  if (needsKey) {
    const providerLabel = userProvider.charAt(0).toUpperCase() + userProvider.slice(1)
    return NextResponse.json({ error: `No API key configured for ${providerLabel}. Add one in Settings or switch back to the free tier.` }, { status: 400 })
  }

  try {
    let result

    if (!isByok) {
      const serverKey = process.env.ANTHROPIC_API_KEY
      if (!serverKey) return NextResponse.json({ error: 'No API key configured. Add your key in Settings.' }, { status: 400 })
      const freeModel = process.env.FREE_MODEL || 'claude-sonnet-4-6'
      console.log(`[convert] using server key, model=${freeModel}`)
      const serverClient = new Anthropic({ apiKey: serverKey })
      result = await runChat(serverClient, messages, freeModel, systemFull)
    } else if (userProvider === 'anthropic') {
      console.log(`[convert] byok anthropic model=${userModel || 'auto'}`)
      const byokClient = new Anthropic({ apiKey: userApiKey })
      result = await runChat(byokClient, messages, userModel || undefined, systemFull)
    } else {
      const baseUrl = normalizeBaseUrl(userBaseUrl, userProvider)
      const model   = userModel || DEFAULT_MODELS[userProvider] || 'llama3.2'
      console.log(`[convert] byok openai-compat provider=${userProvider} model=${model}`)
      result = await runChatOpenAI(baseUrl, userApiKey || 'none', model, messages, systemFull)
    }

    if (!result.qr) {
      console.log('[convert] no QR generated')
      return NextResponse.json({ error: 'No QR code generated. Try again or refine manually.' }, { status: 500 })
    }

    if (result.qr.deviceId && result.qr.deviceId !== targetDevice) {
      console.log(`[convert] wrong device in result: got ${result.qr.deviceId}, expected ${targetDevice}`)
      return NextResponse.json({ error: `Conversion generated wrong device (${result.qr.deviceId}). Try again.` }, { status: 500 })
    }

    console.log('[convert] done')
    return NextResponse.json({ qr: result.qr })
  } catch (err) {
    console.error('[convert] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
