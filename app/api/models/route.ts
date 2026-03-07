import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'

const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

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

export async function GET(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const provider = (request.headers.get('x-provider') ?? '').trim()
  const baseUrl  = (request.headers.get('x-base-url') ?? '').trim()
  const apiKey   = (request.headers.get('x-user-api-key') ?? '').trim()

  if (provider === 'anthropic') {
    return NextResponse.json({ models: ANTHROPIC_MODELS })
  }

  try {
    const normalizedUrl = normalizeBaseUrl(baseUrl, provider)
    const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey: apiKey || 'none' }
    if (normalizedUrl) clientOpts.baseURL = normalizedUrl

    const client = new OpenAI(clientOpts)
    const list = await client.models.list()
    const models = list.data.map(m => m.id).sort()
    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ models: [] })
  }
}
