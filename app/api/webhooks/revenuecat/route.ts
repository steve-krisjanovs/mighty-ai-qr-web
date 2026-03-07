import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { setSubscriptionActive } from '@/lib/server/entitlements'

const ACTIVE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED'])
const INACTIVE_EVENTS = new Set(['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIBER_ALIAS'])

export async function POST(request: NextRequest) {
  const body = await request.json()

  const secret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (secret) {
    const signature = request.headers.get('x-revenuecat-signature')
    if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const { event } = body
  if (!event?.type || !event?.app_user_id) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const deviceId = event.app_user_id as string
  if (ACTIVE_EVENTS.has(event.type)) {
    setSubscriptionActive(deviceId, true)
  } else if (INACTIVE_EVENTS.has(event.type)) {
    setSubscriptionActive(deviceId, false)
  }

  return NextResponse.json({ received: true })
}
