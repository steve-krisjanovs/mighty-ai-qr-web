import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { runChat, runChatOpenAI, SYSTEM_PROMPT_FULL } from '@/lib/server/ai-tools'
import { checkAndIncrementQuota } from '@/lib/server/quota'

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

export const maxDuration = 300 // 5 minutes — local LLMs (e.g. 20B models) can be slow

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { messages } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  const userApiKey      = (request.headers.get('x-user-api-key') ?? '').trim()
  const userProvider    = (request.headers.get('x-provider') ?? '').trim()
  const userBaseUrl     = (request.headers.get('x-base-url') ?? '').trim()
  const userModel       = (request.headers.get('x-model') ?? '').trim()
  const defaultDevice   = (request.headers.get('x-default-device') ?? 'plugpro').trim()

  const deviceInstruction = `The user's default NUX device is "${defaultDevice}". Always use this device when generating QR codes unless the user explicitly asks for a different one.\n\n`
  const systemFull = deviceInstruction + SYSTEM_PROMPT_FULL

  const isByok = !!userApiKey || !!userBaseUrl

  try {
    let result

    if (!isByok) {
      const serverKey = process.env.ANTHROPIC_API_KEY
      if (!serverKey) {
        return NextResponse.json({ error: 'No API key configured. Add your key in Settings.' }, { status: 400 })
      }
      const quota = checkAndIncrementQuota()
      if (!quota.allowed) {
        return NextResponse.json({
          error: "Today's free request limit has been reached. Add your own API key in Settings to keep going — Anthropic gives free credits on signup.",
        }, { status: 429 })
      }
      const freeModel = process.env.FREE_MODEL || 'claude-sonnet-4-6'
      const serverClient = new Anthropic({ apiKey: serverKey })
      result = await runChat(serverClient, messages, freeModel, systemFull)
    } else if (userProvider === 'anthropic') {
      const byokClient = new Anthropic({ apiKey: userApiKey })
      result = await runChat(byokClient, messages, userModel || undefined, systemFull)
    } else {
      const baseUrl = normalizeBaseUrl(userBaseUrl, userProvider)
      const model   = userModel || DEFAULT_MODELS[userProvider] || 'llama3.2'
      result = await runChatOpenAI(baseUrl, userApiKey || 'none', model, messages, systemFull)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[chat] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
