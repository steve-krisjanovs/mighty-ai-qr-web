import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { canGenerate, incrementGeneration, getStatus } from '@/lib/server/entitlements'
import { runChat, runChatOpenAI } from '@/lib/server/ai-tools'

const serverClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o', gemini: 'gemini-2.0-flash', grok: 'grok-3-mini', mistral: 'mistral-small-latest', groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2', lmstudio: 'llama3.2', openwebui: 'llama3.2',
}

function normalizeBaseUrl(url: string, provider: string): string {
  const needsV1 = ['ollama', 'lmstudio', 'openwebui']
  let normalized = url.replace(/\blocalhost\b/g, 'host.docker.internal')
  if (needsV1.includes(provider) && normalized && !normalized.endsWith('/v1') && !normalized.includes('/v1/')) {
    normalized = normalized.replace(/\/$/, '') + '/v1'
  }
  return normalized
}

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { messages } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  const userApiKey   = (request.headers.get('x-user-api-key') ?? '').trim()
  const userProvider = (request.headers.get('x-provider') ?? '').trim()
  const userBaseUrl  = (request.headers.get('x-base-url') ?? '').trim()
  const userModel    = (request.headers.get('x-model') ?? '').trim()

  const isByok = !!userApiKey || !!userBaseUrl

  if (!isByok && !canGenerate(deviceId)) {
    return NextResponse.json({
      error: 'free_limit_reached',
      message: 'Upgrade to Mighty AI Pro for unlimited tone generation.',
      ...getStatus(deviceId),
    }, { status: 402 })
  }

  try {
    let result

    if (isByok && userProvider === 'anthropic') {
      const byokClient = new Anthropic({ apiKey: userApiKey })
      result = await runChat(byokClient, messages, userModel || undefined)
    } else if (isByok) {
      const baseUrl = normalizeBaseUrl(userBaseUrl, userProvider)
      const model   = userModel || DEFAULT_MODELS[userProvider] || 'llama3.2'
      result = await runChatOpenAI(baseUrl, userApiKey || 'none', model, messages)
    } else {
      result = await runChat(serverClient, messages)
    }

    if (result.qr && !isByok) incrementGeneration(deviceId)

    return NextResponse.json({ ...result, ...(isByok ? {} : getStatus(deviceId)) })
  } catch (err) {
    console.error('[chat] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
