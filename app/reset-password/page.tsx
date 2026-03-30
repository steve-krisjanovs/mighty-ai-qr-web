'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) router.replace('/login')
  }, [token, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token: token! })
      if (error) { setError(error.message ?? 'Reset failed'); return }
      setDone(true)
      setTimeout(() => router.replace('/login'), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-fg">Mighty AI</h1>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-6 space-y-5">
          <h2 className="text-base font-semibold text-fg">Set new password</h2>
          {done ? (
            <p className="text-sm text-fg-3">Password updated. Redirecting to sign in…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="New password" required autoComplete="new-password" minLength={8}
                className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
              />
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm new password" required autoComplete="new-password"
                className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity">
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
