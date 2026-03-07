import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { decodeQRString } from '@/lib/server/qr-encoder'

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { qrString } = body

  if (!qrString || typeof qrString !== 'string') {
    return NextResponse.json({ error: 'Missing qrString' }, { status: 400 })
  }

  const result = decodeQRString(qrString)
  if (!result) return NextResponse.json({ error: 'Invalid or unsupported QR code' }, { status: 400 })

  return NextResponse.json(result)
}
