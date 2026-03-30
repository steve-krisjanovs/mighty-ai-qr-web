import { type NextRequest } from 'next/server'
import { auth } from './auth'
import { getDeviceIdFromRequest } from './jwt'

export type Owner = { id: string; type: 'user' | 'device' }

/**
 * Resolve the owner of a request.
 * Prefers a better-auth session (authenticated user) over the device JWT.
 * Returns null if neither is present or valid.
 */
export async function getOwner(request: NextRequest): Promise<Owner | null> {
  // Try better-auth session first
  const session = await auth.api.getSession({ headers: request.headers })
  if (session?.user?.id) return { id: session.user.id, type: 'user' }

  // Fall back to device JWT
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (deviceId) return { id: deviceId, type: 'device' }

  return null
}
