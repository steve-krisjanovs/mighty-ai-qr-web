import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ artist: null, song: null }, { status: 401 })

  const { importNote } = await request.json()
  if (!importNote || typeof importNote !== 'string' || importNote.trim().length < 3) {
    return NextResponse.json({ artist: null, song: null })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ artist: null, song: null })

  try {
    const webSearchToolVersion = process.env.WEB_SEARCH_TOOL_VERSION ?? 'web_search_20250305'
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: webSearchToolVersion, name: 'web_search' }] as any,
      messages: [{
        role: 'user',
        content: `Text extracted from a guitar preset QR code label: "${importNote}"

Search the web if needed, then identify if this refers to a specific song and artist. Respond ONLY with valid JSON:
{"artist": "Artist Name", "song": "Song Title"}
Or if not identifiable: {"artist": null, "song": null}`,
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const text = textBlock?.type === 'text' ? textBlock.text : ''
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return NextResponse.json({ artist: null, song: null })
    return NextResponse.json(JSON.parse(match[0]))
  } catch {
    return NextResponse.json({ artist: null, song: null })
  }
}
