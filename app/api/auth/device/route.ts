import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/server/jwt'
import { getStatus } from '@/lib/server/entitlements'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { deviceId } = body

  if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 8) {
    return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 })
  }

  const status = getStatus(deviceId)
  const token = signToken({ deviceId })

  return NextResponse.json({ token, ...status })
}
