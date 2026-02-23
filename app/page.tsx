'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { v4 as uuidv4 } from 'uuid'
import { sendChat, initAuth, FreeLimitError } from '@/lib/api'
import {
  loadHistory, saveToHistory, clearHistory,
  loadConversations, createConversation, upsertConversation,
  deleteConversation, autoTitle, relativeTime,
} from '@/lib/storage'
import type { ChatMessage, QrResult, HistoryItem, UsageStats, Conversation } from '@/lib/types'

const SUGGESTIONS = [
  'Kashmir tone from Knebworth 1979',
  'Smooth blues crunch with warm reverb',
  'Modern metal rhythm, tight and aggressive',
]

// ─── Icons ────────────────────────────────────────────────────────────────────

const AppIcon = () => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" />
      <rect x="3.5" y="3.5" width="3" height="3" rx="0.5" fill="#1a73e8" />
      <rect x="12" y="2" width="6" height="6" rx="1.5" fill="white" />
      <rect x="13.5" y="3.5" width="3" height="3" rx="0.5" fill="#1a73e8" />
      <rect x="2" y="12" width="6" height="6" rx="1.5" fill="white" />
      <rect x="3.5" y="13.5" width="3" height="3" rx="0.5" fill="#1a73e8" />
      <rect x="12" y="12" width="2.5" height="2.5" rx="0.5" fill="white" />
      <rect x="15.5" y="12" width="2.5" height="2.5" rx="0.5" fill="white" />
      <rect x="12" y="15.5" width="2.5" height="2.5" rx="0.5" fill="white" />
      <rect x="15.5" y="15.5" width="2.5" height="2.5" rx="0.5" fill="white" />
    </svg>
  </div>
)

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
  </svg>
)

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h18M3 6h18M3 18h18" />
  </svg>
)

const HistoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
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

// ─── QR Card ──────────────────────────────────────────────────────────────────

function QrCard({ qr, className = '' }: { qr: QrResult; className?: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(qr.presetName + ' guitar tone')}`

  const download = () => {
    const a = document.createElement('a')
    a.href = qr.imageBase64
    a.download = `${qr.presetName.replace(/[^a-z0-9]/gi, '_')}.png`
    a.click()
  }

  return (
    <div className={`rounded-2xl border border-white/10 bg-surface-2 overflow-hidden ${className}`}>
      <div className="flex items-center justify-center bg-white p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.imageBase64} alt={qr.presetName} className="h-44 w-44 object-contain" />
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-[#e8eaed] leading-tight">{qr.presetName}</p>
          <p className="text-xs text-[#9aa0a6] mt-0.5">{qr.deviceName}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={download} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-surface-3 py-2 text-sm text-[#e8eaed] hover:bg-[#444] transition-colors">
            <DownloadIcon /> Download
          </button>
          <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-surface-3 py-2 text-sm text-[#e8eaed] hover:bg-[#444] transition-colors">
            <YoutubeIcon /> Reference
          </a>
        </div>
        <div className="border-t border-white/10 pt-3">
          <button onClick={() => setSettingsOpen(o => !o)} className="flex w-full items-center justify-between text-xs text-[#9aa0a6] hover:text-[#e8eaed] transition-colors">
            <span>Tone settings</span>
            <ChevronIcon open={settingsOpen} />
          </button>
          {settingsOpen && (
            <div className="mt-2 space-y-1.5">
              {qr.settings.map((slot, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${slot.enabled ? 'bg-green-400' : 'bg-[#5f6368]'}`} />
                  <div className="min-w-0">
                    <span className="text-[11px] text-[#9aa0a6]">{slot.slot}: </span>
                    <span className="text-[11px] text-[#e8eaed]">{slot.selection}</span>
                    {slot.params && Object.keys(slot.params).length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3">
                        {Object.entries(slot.params).slice(0, 4).map(([k, v]) => (
                          <span key={k} className="text-[10px] text-[#5f6368]">{k}: {v}</span>
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
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  conversations, activeId, onSelect, onNew, onDelete, qrHistory, onQrSelect, visible, onClose,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  qrHistory: HistoryItem[]
  onQrSelect: (qr: QrResult) => void
  visible: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<'chats' | 'qr'>('chats')

  return (
    <>
      {/* Mobile backdrop */}
      {visible && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 z-50 h-full w-[260px] flex-col border-r border-white/10 bg-surface
        flex flex-col transition-transform duration-200
        lg:relative lg:translate-x-0 lg:z-auto
        ${visible ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <AppIcon />
            <span className="text-sm font-medium text-[#e8eaed]">Mighty AI QR</span>
          </div>
          <button onClick={onClose} className="text-[#9aa0a6] hover:text-[#e8eaed] transition-colors lg:hidden">
            <CloseIcon />
          </button>
        </div>

        {/* New chat */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={() => { onNew(); onClose() }}
            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-[#bdc1c6] hover:bg-surface-3 hover:text-[#e8eaed] transition-colors"
          >
            <PlusIcon />
            New chat
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mx-3">
          {(['chats', 'qr'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[#9aa0a6] hover:text-[#bdc1c6]'
              }`}
            >
              {t === 'chats' ? 'Chats' : 'QR Codes'}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {tab === 'chats' ? (
            conversations.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#5f6368]">No conversations yet</p>
            ) : (
              conversations.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onSelect={() => { onSelect(conv.id); onClose() }}
                  onDelete={() => onDelete(conv.id)}
                />
              ))
            )
          ) : (
            qrHistory.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#5f6368]">No QR codes yet</p>
            ) : (
              qrHistory.map(item => (
                <button
                  key={item.id}
                  onClick={() => { onQrSelect(item.qr); onClose() }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-white p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageBase64} alt={item.presetName} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[#e8eaed]">{item.presetName}</p>
                    <p className="text-[10px] text-[#5f6368]">{relativeTime(item.timestamp)}</p>
                  </div>
                </button>
              ))
            )
          )}
        </div>
      </aside>
    </>
  )
}

function ConvItem({ conv, active, onSelect, onDelete }: {
  conv: Conversation; active: boolean; onSelect: () => void; onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className={`group relative flex items-center px-3 py-2.5 cursor-pointer transition-colors ${
        active ? 'bg-surface-2' : 'hover:bg-surface-2'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      {active && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-[#e8eaed]">{conv.title}</p>
        <p className="text-[10px] text-[#5f6368]">{relativeTime(conv.updatedAt)}</p>
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="ml-2 shrink-0 text-[#5f6368] hover:text-red-400 transition-colors"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentQr, setCurrentQr] = useState<QrResult | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageStats>({ generationsUsed: 0, generationsLimit: 10, freeRemaining: 10, hasActiveSubscription: false })
  const [qrHistory, setQrHistory] = useState<HistoryItem[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const convs = loadConversations()
    setConversations(convs)
    setQrHistory(loadHistory())
    initAuth().then(setUsage).catch(() => {})

    // Load most recent conversation if any
    if (convs.length > 0) {
      const latest = convs[0]
      setActiveConvId(latest.id)
      setMessages(latest.messages)
      setCurrentQr(latest.lastQr)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    })
  }, [])

  // Persist conversation whenever messages change
  const persistConversation = useCallback((id: string, msgs: ChatMessage[], lastQr: QrResult | null) => {
    const title = autoTitle(msgs)
    const conv: Conversation = {
      id,
      title,
      messages: msgs,
      lastQr,
      createdAt: conversations.find(c => c.id === id)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }
    upsertConversation(conv)
    setConversations(loadConversations())
  }, [conversations])

  const startNewChat = useCallback(() => {
    const conv = createConversation()
    upsertConversation(conv)
    setConversations(loadConversations())
    setActiveConvId(conv.id)
    setMessages([])
    setCurrentQr(null)
    setError(null)
    setInput('')
  }, [])

  const switchConversation = useCallback((id: string) => {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    setActiveConvId(id)
    setMessages(conv.messages)
    setCurrentQr(conv.lastQr)
    setError(null)
    setInput('')
  }, [conversations])

  const handleDeleteConversation = useCallback((id: string) => {
    deleteConversation(id)
    const remaining = loadConversations()
    setConversations(remaining)
    if (id === activeConvId) {
      if (remaining.length > 0) {
        switchConversation(remaining[0].id)
      } else {
        setActiveConvId(null)
        setMessages([])
        setCurrentQr(null)
      }
    }
  }, [activeConvId, switchConversation])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // Create conversation on first message if none active
    let convId = activeConvId
    if (!convId) {
      const conv = createConversation()
      upsertConversation(conv)
      setConversations(loadConversations())
      setActiveConvId(conv.id)
      convId = conv.id
    }

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)
    scrollToBottom()

    try {
      const history = newMessages.map(({ role, content }) => ({ role, content }))
      const res = await sendChat(history)
      const aiMsg: ChatMessage = { id: uuidv4(), role: 'assistant', content: res.message, qr: res.qr }
      const finalMessages = [...newMessages, aiMsg]
      setMessages(finalMessages)
      setUsage(res.usage)

      let newQr = currentQr
      if (res.qr) {
        newQr = res.qr
        setCurrentQr(res.qr)
        const item = saveToHistory(res.qr)
        setQrHistory(prev => [item, ...prev].slice(0, 20))
      }

      persistConversation(convId!, finalMessages, newQr)
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
  }, [loading, messages, activeConvId, currentQr, usage.generationsLimit, scrollToBottom, persistConversation])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div className="flex h-full bg-bg">

      {/* ── Sidebar ── */}
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={switchConversation}
        onNew={startNewChat}
        onDelete={handleDeleteConversation}
        qrHistory={qrHistory}
        onQrSelect={qr => { setCurrentQr(qr); setSidebarOpen(false) }}
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="flex items-center justify-between border-b border-white/10 bg-surface px-4 py-2.5">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile */}
            <button onClick={() => setSidebarOpen(true)} className="text-[#9aa0a6] hover:text-[#e8eaed] transition-colors lg:hidden">
              <MenuIcon />
            </button>
            <span className="text-sm font-medium text-[#e8eaed] lg:hidden">Mighty AI QR</span>
          </div>

          <div className="flex items-center gap-3">
            {usage.hasActiveSubscription ? (
              <span className="rounded-full bg-blue-600/20 px-2.5 py-0.5 text-xs font-medium text-primary">Pro</span>
            ) : (
              <span className={`text-xs ${usage.freeRemaining <= 2 ? 'text-red-400' : 'text-[#9aa0a6]'}`}>
                {usage.freeRemaining} free remaining
              </span>
            )}
            <button
              onClick={startNewChat}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-[#bdc1c6] hover:bg-surface-3 hover:text-[#e8eaed] transition-colors"
            >
              <PlusIcon />
              New chat
            </button>
          </div>
        </header>

        {/* ── Chat + QR ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Chat */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-6 animate-fade-in">
                  <div className="text-center">
                    <div className="mb-3 text-4xl">🎸</div>
                    <h2 className="text-xl font-medium text-[#e8eaed]">What tone are you after?</h2>
                    <p className="mt-1 text-sm text-[#9aa0a6]">Describe it in plain English, get a scannable QR code for your amp.</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-white/10 bg-surface-2 px-4 py-1.5 text-sm text-[#bdc1c6] hover:bg-surface-3 hover:text-[#e8eaed] transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col animate-slide-up ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
                        {msg.content}
                      </div>
                    ) : (
                      <>
                        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3">
                          <div className="prose-ai">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                        {msg.qr && (
                          <div className="mt-2 w-full max-w-xs lg:hidden animate-fade-in">
                            <QrCard qr={msg.qr} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map(i => <div key={i} className="typing-dot h-2 w-2 rounded-full bg-[#9aa0a6]" />)}
                      <span className="ml-2 text-xs text-[#9aa0a6]">Generating tone…</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-2.5 text-sm text-red-400">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400"><CloseIcon /></button>
              </div>
            )}

            <div className="border-t border-white/10 bg-surface p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-2xl border border-white/10 bg-surface-2 focus-within:border-primary/50 transition-colors">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    placeholder="Describe your tone…"
                    rows={1}
                    className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-sm text-[#e8eaed] placeholder-[#5f6368] outline-none disabled:opacity-50"
                    style={{ maxHeight: '120px', overflowY: 'auto' }}
                  />
                </div>
                <button
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>

          {/* QR Panel — desktop */}
          <div className="hidden w-[360px] shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-bg p-5 lg:flex">
            {!currentQr ? (
              <div className="flex h-full flex-col items-center justify-center text-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 text-[#5f6368]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" rx="0.5" />
                    <rect x="19" y="14" width="2" height="2" rx="0.5" /><rect x="14" y="19" width="2" height="2" rx="0.5" />
                    <rect x="18" y="18" width="3" height="3" rx="0.5" />
                  </svg>
                </div>
                <p className="text-sm text-[#9aa0a6]">QR code will appear here</p>
                <p className="text-xs text-[#5f6368]">Describe your tone in the chat</p>
              </div>
            ) : (
              <div className="animate-fade-in">
                <QrCard qr={currentQr} />
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
