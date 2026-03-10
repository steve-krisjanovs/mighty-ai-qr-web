import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { webSearch } from '@/lib/server/tavily'

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
    const searchResult = await webSearch(`${importNote} guitar tone song artist`)

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Text extracted from a guitar preset QR code label: "${importNote}"

Web search context:
${searchResult.text.slice(0, 2000)}

If this text refers to a specific song and artist, identify them. Respond ONLY with valid JSON:
{"artist": "Artist Name", "song": "Song Title"}
Or if not identifiable: {"artist": null, "song": null}`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return NextResponse.json({ artist: null, song: null })
    return NextResponse.json(JSON.parse(match[0]))
  } catch {
    return NextResponse.json({ artist: null, song: null })
  }
}
