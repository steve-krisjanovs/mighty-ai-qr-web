import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  // Auto-rotate (EXIF), resize to max 800px, get raw RGBA for jsQR
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  if (!code?.data) return NextResponse.json({ found: false })

  // Crop just the QR matrix area (+ padding) for the history thumbnail
  const loc = code.location
  const pad = 12
  const left   = Math.max(0, Math.round(Math.min(loc.topLeftCorner.x,    loc.bottomLeftCorner.x)  - pad))
  const top    = Math.max(0, Math.round(Math.min(loc.topLeftCorner.y,    loc.topRightCorner.y)    - pad))
  const right  = Math.min(info.width,  Math.round(Math.max(loc.topRightCorner.x,  loc.bottomRightCorner.x) + pad))
  const bottom = Math.min(info.height, Math.round(Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y) + pad))

  const croppedBuffer = await sharp(buffer)
    .rotate()
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer()

  const imageBase64 = `data:image/png;base64,${croppedBuffer.toString('base64')}`

  return NextResponse.json({ found: true, qrString: code.data, imageBase64 })
}
