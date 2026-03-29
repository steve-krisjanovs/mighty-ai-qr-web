import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { runChat, SYSTEM_PROMPT_FULL } from '@/lib/server/ai-tools'
import { DEVICES } from '@/lib/server/nux'
import { checkAndIncrementQuota } from '@/lib/server/quota'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  console.log('[chat] request received')
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) { console.log('[chat] unauthorized'); return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await request.json()
  const { messages } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  const defaultDevice = (request.headers.get('x-default-device') ?? 'plugpro').trim()

  const deviceDisplayName = DEVICES[defaultDevice as keyof typeof DEVICES]?.displayName ?? defaultDevice
  const deviceInstruction = `The user's NUX device is "${defaultDevice}" (${deviceDisplayName}). You MUST call the generateQR tool with device="${defaultDevice}". Do NOT use any other device ID — ignore any device mentioned in the conversation history.\n\n`
  const systemFull = deviceInstruction + SYSTEM_PROMPT_FULL

  // Rewrite assistant messages: replace any stale device display name with the current one.
  // Sorted longest-first to avoid partial matches (e.g. "Mighty Plug Pro" before "Mighty Plug").
  const allDeviceNames = (Object.values(DEVICES) as { displayName: string }[]).map(d => d.displayName)
  allDeviceNames.sort((a, b) => b.length - a.length)
  const staleDeviceNames = allDeviceNames.filter(n => n !== deviceDisplayName)
  const rewriteDevice = (content: string) =>
    staleDeviceNames.reduce((s, name) => s.replaceAll(name, deviceDisplayName), content)

  const messagesWithHint: { role: 'user' | 'assistant'; content: string }[] = messages.map((m: { role: 'user' | 'assistant'; content: string }) =>
    m.role === 'assistant' ? { ...m, content: rewriteDevice(m.content) } : m
  )

  // Also inject a hard device constraint into the last user message
  const lastUserIdx = messagesWithHint.map(m => m.role).lastIndexOf('user')
  if (lastUserIdx !== -1) {
    const existingPresetName = [...messagesWithHint].reverse().find((m: {role: string; content: string}) => m.role === 'assistant' && m.content.includes('"'))?.content.match(/"([^"]+)"/)?.[1]
    const nameHint = existingPresetName ? ` Keep the preset_name as "${existingPresetName}".` : ''
    messagesWithHint[lastUserIdx] = {
      ...messagesWithHint[lastUserIdx],
      content: messagesWithHint[lastUserIdx].content + `\n\n[IMPORTANT: Use device="${defaultDevice}" in the generateQR tool call.${nameHint}]`,
    }
  }

  console.log(`[chat] msgs=${messages.length}`)

  try {
    const serverKey = process.env.ANTHROPIC_API_KEY
    if (!serverKey) {
      return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 })
    }
    const quota = checkAndIncrementQuota()
    if (!quota.allowed) {
      return NextResponse.json({
        error: "Today's free request limit has been reached. Come back tomorrow!",
      }, { status: 429 })
    }
    const freeModel = process.env.FREE_MODEL || 'claude-sonnet-4-6'
    console.log(`[chat] model=${freeModel}`)
    const client = new Anthropic({ apiKey: serverKey })
    const result = await runChat(client, messagesWithHint, freeModel, systemFull)

    console.log(`[chat] done`)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[chat] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
