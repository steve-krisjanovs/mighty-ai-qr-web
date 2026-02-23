'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { v4 as uuidv4 } from 'uuid'
import { sendChat, initAuth, FreeLimitError } from '@/lib/api'
import { loadHistory, saveToHistory, clearHistory } from '@/lib/storage'
import type { ChatMessage, QrResult, HistoryItem, UsageStats } from '@/lib/types'

const SUGGESTIONS = [
  'Kashmir tone from Knebworth 1979',
  'Smooth blues crunch with warm reverb',
  'Modern metal rhythm, tight and aggressive',
]

// ─── Icons ───────────────────────────────────────────────────────────────────

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
  </svg>
)

const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
  </svg>
)

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)

const YoutubeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.97C18.88 4 12 4 12 4s-6.88 0-8.59.45A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.4a2.78 2.78 0 001.95-1.97A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentQr, setCurrentQr] = useState<QrResult | null>(null)
  const [usage, setUsage] = useState<UsageStats>({ generationsUsed: 0, generationsLimit: 10, freeRemaining: 10, hasActiveSubscription: false })
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setHistory(loadHistory())
    initAuth().then(setUsage).catch(() => {})
  }, [])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    })
  }, [])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)
    scrollToBottom()

    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }))
      const res = await sendChat(history)
      const aiMsg: ChatMessage = { id: uuidv4(), role: 'assistant', content: res.message, qr: res.qr }
      setMessages(prev => [...prev, aiMsg])
      setUsage(res.usage)
      if (res.qr) {
        setCurrentQr(res.qr)
        setSettingsOpen(false)
        const item = saveToHistory(res.qr)
        setHistory(prev => [item, ...prev].slice(0, 20))
      }
    } catch (e) {
      if (e instanceof FreeLimitError) {
        setError(`Free limit of ${usage.generationsLimit} generations reached.`)
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }, [loading, messages, usage.generationsLimit, scrollToBottom])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const downloadQr = () => {
    if (!currentQr) return
    const a = document.createElement('a')
    a.href = currentQr.imageBase64
    a.download = `${currentQr.presetName.replace(/[^a-z0-9]/gi, '_')}.png`
    a.click()
  }

  const youtubeUrl = currentQr
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(currentQr.presetName + ' guitar tone')}`
    : '#'

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-violet-900/20 bg-surface/60 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white shadow-lg">
            QR
          </div>
          <div>
            <h1 className="gradient-text text-base font-bold leading-none">Mighty AI QR</h1>
            <p className="text-[10px] text-purple-400/60">NUX MightyAmp tone generator</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {usage.hasActiveSubscription ? (
            <span className="rounded-full bg-violet-900/40 px-2.5 py-0.5 text-xs font-medium text-violet-300">Pro</span>
          ) : (
            <span className={`text-xs ${usage.freeRemaining <= 2 ? 'text-red-400' : 'text-purple-400/60'}`}>
              {usage.freeRemaining} free remaining
            </span>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-800/30 bg-surface-2 px-3 py-1.5 text-xs text-purple-300 transition-all hover:border-violet-600/50 hover:bg-surface-3 hover:text-white"
          >
            <HistoryIcon />
            History
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Chat Panel ── */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-violet-900/20">

          {/* Messages */}
          <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 animate-fade-in">
                <div className="text-center">
                  <div className="mb-3 text-4xl">🎸</div>
                  <h2 className="gradient-text text-xl font-bold">What tone are you after?</h2>
                  <p className="mt-1 text-sm text-purple-400/50">Describe it in plain English, get a scannable QR code for your amp.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-violet-800/40 bg-surface-2 px-4 py-1.5 text-sm text-purple-300 transition-all hover:border-violet-500/60 hover:bg-surface-3 hover:text-white"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex animate-slide-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-gradient-to-br from-violet-600 to-violet-700 px-4 py-2.5 text-sm text-white shadow-lg glow-violet-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%]">
                      <div className="rounded-2xl rounded-bl-sm border border-violet-900/30 bg-surface-2 px-4 py-3">
                        <div className="prose-ai">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                      {msg.qr && (
                        <p className="mt-1.5 px-1 text-[11px] text-purple-400/50">
                          ✦ QR code generated — see panel →
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="rounded-2xl rounded-bl-sm border border-violet-900/30 bg-surface-2 px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="typing-dot h-2 w-2 rounded-full bg-violet-500" />
                    ))}
                    <span className="ml-2 text-xs text-purple-400/50">Generating tone...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-2.5 text-sm text-red-400">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400"><CloseIcon /></button>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-violet-900/20 bg-surface/40 p-4 backdrop-blur-sm">
            <div className="flex items-end gap-3">
              <div className="flex-1 rounded-2xl border border-violet-800/30 bg-surface-2 focus-within:border-violet-600/60 focus-within:glow-violet transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  placeholder="Describe your tone... (Enter to send, Shift+Enter for newline)"
                  rows={1}
                  className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-sm text-white placeholder-purple-400/30 outline-none disabled:opacity-50"
                  style={{ maxHeight: '120px', overflowY: 'auto' }}
                />
              </div>
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-lg transition-all hover:opacity-90 hover:shadow-violet-500/30 disabled:opacity-40 glow-violet-sm"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>

        {/* ── QR Panel ── */}
        <div className="hidden w-[380px] shrink-0 flex-col overflow-y-auto bg-bg p-5 lg:flex">
          {!currentQr ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-violet-900/30 text-violet-900/40">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" rx="0.5" />
                  <rect x="19" y="14" width="2" height="2" rx="0.5" /><rect x="14" y="19" width="2" height="2" rx="0.5" />
                  <rect x="18" y="18" width="3" height="3" rx="0.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-purple-400/40">Your QR code will appear here</p>
              <p className="mt-1 text-xs text-purple-400/25">Describe your tone in the chat</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">

              {/* Preset header */}
              <div>
                <h2 className="gradient-text text-lg font-bold leading-tight">{currentQr.presetName}</h2>
                <p className="mt-0.5 text-xs text-purple-400/50">{currentQr.deviceName}</p>
              </div>

              {/* QR image */}
              <div className="gradient-border">
                <div className="gradient-border-inner flex items-center justify-center p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentQr.imageBase64}
                    alt={currentQr.presetName}
                    className="h-48 w-48 rounded-lg"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={downloadQr}
                  className="flex items-center justify-center gap-2 rounded-xl border border-violet-800/40 bg-surface-2 py-2.5 text-sm text-purple-300 transition-all hover:border-violet-600/60 hover:bg-surface-3 hover:text-white"
                >
                  <DownloadIcon />
                  Download
                </button>
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 py-2.5 text-sm text-red-400 transition-all hover:border-red-700/60 hover:bg-red-950/40 hover:text-red-300"
                >
                  <YoutubeIcon />
                  Reference
                </a>
              </div>

              {/* Tone settings */}
              <div className="rounded-xl border border-violet-900/25 bg-surface-2 overflow-hidden">
                <button
                  onClick={() => setSettingsOpen(o => !o)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-purple-300 hover:text-white transition-colors"
                >
                  <span>Tone Settings</span>
                  <ChevronIcon open={settingsOpen} />
                </button>
                {settingsOpen && (
                  <div className="border-t border-violet-900/25 px-4 py-3 space-y-1.5">
                    {currentQr.settings.map((slot, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${slot.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                        <div className="min-w-0">
                          <span className="text-[11px] text-purple-400/50">{slot.slot}: </span>
                          <span className="text-[11px] text-purple-200">{slot.selection}</span>
                          {slot.params && Object.keys(slot.params).length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-x-3">
                              {Object.entries(slot.params).slice(0, 4).map(([k, v]) => (
                                <span key={k} className="text-[10px] text-purple-400/40">{k}: {v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>

      {/* ── History Drawer ── */}
      {showHistory && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-violet-900/30 bg-surface shadow-2xl shadow-violet-950/50 animate-fade-in">
            <div className="flex items-center justify-between border-b border-violet-900/20 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Generation History</h2>
              <div className="flex items-center gap-3">
                {history.length > 0 && (
                  <button
                    onClick={() => { clearHistory(); setHistory([]) }}
                    className="text-xs text-purple-400/50 hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button onClick={() => setShowHistory(false)} className="text-purple-400/50 hover:text-white transition-colors">
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {history.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center">
                  <p className="text-sm text-purple-400/30">No history yet</p>
                  <p className="mt-1 text-xs text-purple-400/20">Generated QR codes will appear here</p>
                </div>
              ) : (
                history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { setCurrentQr(item.qr); setShowHistory(false); setSettingsOpen(false) }}
                    className="flex w-full items-center gap-3 rounded-xl border border-violet-900/20 bg-surface-2 p-3 text-left transition-all hover:border-violet-700/40 hover:bg-surface-3"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageBase64} alt={item.presetName} className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{item.presetName}</p>
                      <p className="text-xs text-purple-400/40">{item.deviceName}</p>
                      <p className="text-[10px] text-purple-400/25">{new Date(item.timestamp).toLocaleDateString()}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
