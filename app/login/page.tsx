'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

type Tab = 'signin' | 'signup'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 23 23">
    <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
    <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
    <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
    <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
  </svg>
)

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [emailConfirm, setEmailConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const redirectTo = searchParams.get('from') ?? '/'

  // If already signed in, redirect
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) router.replace(redirectTo)
    })
  }, [redirectTo, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (forgotMode) {
        await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })
        setForgotSent(true)
        return
      }
      if (tab === 'signin') {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) { setError(error.message ?? 'Sign in failed'); return }
      } else {
        if (email !== emailConfirm) { setError('Email addresses do not match'); return }
        const { error } = await authClient.signUp.email({ email, password, name: name || email.split('@')[0] })
        if (error) { setError(error.message ?? 'Sign up failed'); return }
      }
      router.replace(redirectTo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuth(provider: 'google' | 'microsoft' | 'facebook') {
    setError(null)
    await authClient.signIn.social({ provider, callbackURL: redirectTo })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-surface p-6 space-y-5">

          {/* Top bar: app label + close */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-4">Mighty AI</span>
            <a href="/" aria-label="Close" className="text-fg-4 hover:text-fg transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </a>
          </div>

          {forgotMode ? (
            <>
              <h2 className="text-base font-semibold text-fg">Reset password</h2>
              {forgotSent ? (
                <p className="text-sm text-fg-3">Check your email for a reset link.</p>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Email address" required autoComplete="email"
                    className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
                  />
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {loading ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}
              <button onClick={() => { setForgotMode(false); setForgotSent(false) }} className="text-xs text-fg-4 hover:text-fg-3 transition-colors">
                Back to sign in
              </button>
            </>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex rounded-xl bg-surface-2 p-1 gap-1">
                {(['signin', 'signup'] as Tab[]).map(t => (
                  <button key={t} onClick={() => { setTab(t); setError(null); setEmailConfirm('') }}
                    className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-surface-3 text-fg' : 'text-fg-4 hover:text-fg-3'}`}>
                    {t === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>

              {/* OAuth buttons */}
              <div className="space-y-2">
                <button onClick={() => handleOAuth('google')}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-surface-2 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors">
                  <GoogleIcon /> Continue with Google
                </button>
                <button onClick={() => handleOAuth('microsoft')}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-surface-2 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors">
                  <MicrosoftIcon /> Continue with Microsoft
                </button>
                <button onClick={() => handleOAuth('facebook')}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-surface-2 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors">
                  <FacebookIcon /> Continue with Facebook
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-fg-4">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Email/password form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {tab === 'signup' && (
                  <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Name (optional)" autoComplete="name"
                    className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
                  />
                )}
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Email address" required autoComplete="email"
                  className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
                />
                {tab === 'signup' && (
                  <input
                    type="email" value={emailConfirm} onChange={e => setEmailConfirm(e.target.value)}
                    placeholder="Confirm email address" required autoComplete="off"
                    className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
                  />
                )}
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" required autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {loading ? (tab === 'signin' ? 'Signing in…' : 'Creating account…') : (tab === 'signin' ? 'Sign in' : 'Create account')}
                </button>
              </form>

              {tab === 'signin' && (
                <button onClick={() => { setForgotMode(true); setError(null) }} className="w-full text-center text-xs text-fg-4 hover:text-fg-3 transition-colors">
                  Forgot password?
                </button>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-fg-4 mt-4">
          Continue without an account?{' '}
          <a href="/" className="text-fg-3 hover:text-fg transition-colors underline">Use as guest</a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
