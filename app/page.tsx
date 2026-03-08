'use client'

import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { flushSync } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { v4 as uuidv4 } from 'uuid'
import { sendChat, initAuth, fetchModels, decodeQr } from '@/lib/api'
import {
  loadHistory, saveToHistory, deleteHistoryItem, renameHistoryItem, clearAllHistory,
  loadConversations, upsertConversation,
  deleteConversation, clearAllConversations, autoTitle, relativeTime,
  getApiSettings, saveApiSettings, getActiveConfig,
  getTheme, saveTheme,
  type AiProvider, type ProviderConfig, type Theme,
} from '@/lib/storage'
import type { ChatMessage, QrResult, HistoryItem, Conversation } from '@/lib/types'

const ALL_SUGGESTIONS = [
  'Kashmir tone from Knebworth 1979', 'Eruption Eddie Van Halen brown sound',
  'Texas Flood SRV strat bite', 'Hotel California clean chimey lead',
  'Back in Black power chord crunch', 'Sultans of Swing Knopfler fingerpicked',
  'Little Wing Hendrix gentle clean', 'Comfortably Numb solo sustain',
  'Bohemian Rhapsody May mid-gain tone', 'Sweet Child O Mine Slash lead',
  'November Rain ballad clean', 'Master of Puppets tight rhythm',
  'Enter Sandman heavy palm-mute', 'Smells Like Teen Spirit grunge crunch',
  'Purple Rain Prince sustain lead', 'Free Bird dual harmony lead',
  'Highway Star Blackmore overdriven', 'Crazy Train Randy Rhoads',
  'For the Love of God Vai stratospheric', 'Cliffs of Dover Johnson expressive',
  'Europa Santana singing lead', 'Layla Clapton electric slide',
  'While My Guitar Gently Weeps Harrison', 'More Than a Feeling Boston lead',
  'Whole Lotta Love Page crunch riff', 'Stairway to Heaven acoustic intro',
  'Black Dog heavy mid-boosted', 'Paranoid Black Sabbath riff',
  'Iron Man dirty riff tone', 'Smoke on the Water Blackmore',
  'Warm jazz chord clean tone', 'Chicago blues gritty shuffle',
  'Delta blues raw slide tone', 'Classic country chicken-pickin',
  'Nashville sparkle twang clean', 'Funk rhythm staccato chop',
  'Soul Motown smooth chord', 'Reggae skanking choppy clean',
  'Bossa nova fingerpicked clean', 'Gypsy jazz Django rhythm tone',
  'Doom metal heavy sustained', 'Thrash metal tight gallop',
  '80s arena rock big hair solo', '70s classic rock warm crunch',
  '60s British invasion jangle', '50s rockabilly slap-back clean',
  'Shoegaze wall of fuzz reverb', 'Modern progressive metal tight',
  'Lo-fi bedroom indie warm clean', 'Melancholy rainy night sustain',
  'Euphoric stadium anthem crunch', 'Haunting ambient reverb wash',
  'Uplifting bright chimey clean', 'Aggressive punchy attack',
  'Smooth silky clean lead', 'Brooding dark minor crunch',
  'Playful light funk clean', 'Epic cinematic swell',
  'Fender Twin Reverb sparkle', 'Vox AC30 chimey top-boost',
  'Marshall Plexi medium crunch', 'Marshall JCM800 classic lead',
  'Mesa Dual Rectifier heavy chunk', 'Soldano SLO smooth lead',
  'Long hall reverb clean pad', 'Tap tempo delay ambient wash',
  'Chorus shimmer clean arpeggio', 'Tremolo surf guitar wobble',
  'Flanger jet sweep effect', 'Phaser slow rotating sweep',
  'Uni-vibe psychedelic swirl', 'Big Muff fuzz sustain',
  'Tube screamer mid-boost crunch', 'Slapback delay rockabilly',
  '1955 Scotty Moore clean rockabilly', '1965 British Invasion jangle',
  '1969 Woodstock saturated', '1973 glam rock compressed',
  '1978 disco funk clean', '1982 arena rock lead',
  '1987 shred metal high gain', '1991 alternative grunge',
  '2000s post-rock ambient swell', 'Small jazz club warm intimate',
  'Recording studio dry clean direct', 'Outdoor festival wall of sound',
  'Dive bar raw gritty amp', 'Church hall spacious reverb',
  'Violin-like singing lead bend', 'Cello-like warm midrange lead',
  'Bell-like clean piano attack', 'Talking box wah filter sweep',
  'Depeche Mode dark synth-like', 'U2 The Edge dotted delay',
  'Radiohead Jonny Greenwood angular', 'PJ Harvey raw grunge lead',
  'Kurt Cobain in Utero distortion', 'Jack White raw two-piece crunch',
  'John Frusciante funky clean', 'Dave Murray Iron Maiden harmony lead',
  'Alex Lifeson YYZ clean intro', 'Carlos Santana warm singing tone',
]

function getRandomSuggestions(n = 6, exclude: string[] = []): string[] {
  const pool = ALL_SUGGESTIONS.filter(s => !exclude.includes(s))
  const source = pool.length >= n ? pool : [...ALL_SUGGESTIONS]
  const out: string[] = []
  const remaining = [...source]
  while (out.length < n && remaining.length > 0) {
    const i = Math.floor(Math.random() * remaining.length)
    out.push(remaining.splice(i, 1)[0])
  }
  return out
}

const THEMES: { id: Theme; label: string; bg: string; surface: string; fg: string; primary: string; desc: string }[] = [
  { id: 'dark',       label: 'Dark',        bg: '#202124', surface: '#292a2d', fg: '#e8eaed', primary: '#8ab4f8', desc: 'Google dark' },
  { id: 'oled',       label: 'OLED',        bg: '#000000', surface: '#0d0d0d', fg: '#e0e0e0', primary: '#00bcd4', desc: 'Pure black' },
  { id: 'light',      label: 'Light',       bg: '#f0f2f5', surface: '#ffffff', fg: '#202124', primary: '#1a73e8', desc: 'Clean light' },
  { id: 'tweed',      label: 'Tweed',       bg: '#221608', surface: '#2e1e0c', fg: '#f5e6c8', primary: '#d4a843', desc: 'Fender warmth' },
  { id: 'amber',      label: 'Amber',       bg: '#160f00', surface: '#201600', fg: '#ffe4a0', primary: '#ffab40', desc: 'Tube glow' },
  { id: 'british',    label: 'British',     bg: '#0c1a0c', surface: '#142014', fg: '#e2edd6', primary: '#c9a227', desc: 'Marshall green' },
  { id: 'oxblood',    label: 'Oxblood',     bg: '#180808', surface: '#220e0e', fg: '#f5dede', primary: '#e07070', desc: 'Vintage tolex' },
  { id: 'silver',     label: 'Silver Panel',bg: '#1a1c1e', surface: '#26292c', fg: '#dce3e8', primary: '#b8a882', desc: 'Boutique silver' },
  { id: 'pedalboard', label: 'Pedalboard',  bg: '#0f1410', surface: '#171d18', fg: '#c8d4c0', primary: '#5a9e4a', desc: 'Signal chain' },
  { id: 'blackface',  label: 'Blackface',   bg: '#0a0e1a', surface: '#111827', fg: '#d8dff0', primary: '#7eb8d4', desc: 'Fender silver' },
  { id: 'plexi',      label: 'Plexi',       bg: '#1a1200', surface: '#251a00', fg: '#f0e6c8', primary: '#d4930a', desc: 'Marshall gold' },
]

// ─── Icons ────────────────────────────────────────────────────────────────────

const AppIcon = () => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
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
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4l-1.41 1.41L17.17 11H4v2h13.17l-6.58 6.59L12 21l9-9z" transform="rotate(-90 12 12)" />
  </svg>
)

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
)

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const NewChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/>
  </svg>
)

const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
)

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h18M3 6h18M3 18h18" />
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

const FacebookIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
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

const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const VolumeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
)

const VolumeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
  </svg>
)

const EyeIcon = ({ show }: { show: boolean }) => show ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
)

// ─── QR Import Helpers ────────────────────────────────────────────────────────

const NUX_DEVICE_NAMES: Record<number, string> = {
  15: 'Mighty Plug Pro', 19: 'Mighty Lite MkII', 20: 'Mighty 8BT MkII',
  11: 'Mighty Plug', 9: 'Mighty Lite BT', 12: 'Mighty 8BT',
  7: 'Mighty 20BT/40BT', 6: 'Mighty Air',
}

function parseNuxQr(qrString: string): { presetName: string; deviceName: string } | null {
  if (!qrString.startsWith('nux://MightyAmp:')) return null
  try {
    const bytes = Uint8Array.from(atob(qrString.slice(16)), c => c.charCodeAt(0))
    const deviceName = NUX_DEVICE_NAMES[bytes[0]] ?? 'NUX MightyAmp'
    let presetName = 'Imported Preset'
    if (bytes.length >= 115) {
      const raw = bytes.slice(100, 116)
      const end = raw.indexOf(0)
      const name = new TextDecoder().decode(end >= 0 ? raw.slice(0, end) : raw).trim()
      if (name) presetName = name
    }
    return { presetName, deviceName }
  } catch { return null }
}

async function decodeQrFromFile(file: File): Promise<{ qrString: string; imageBase64: string } | null> {
  const jsQR = (await import('jsqr')).default
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(imageData.data, imageData.width, imageData.height)
  if (!code?.data) return null
  const imageBase64 = canvas.toDataURL('image/png')
  return { qrString: code.data, imageBase64 }
}

const OCR_FALSE_FLAGS = [
  'mighty ai', 'mighty amp', 'mightyamp', 'nux', 'plugpro', 'plug pro',
  'generated by', 'scan me', 'scan to', 'qr code', 'www.', 'http',
]

async function ocrImageText(bitmap: ImageBitmap): Promise<string> {
  if (typeof window === 'undefined' || !('TextDetector' in window)) return ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).TextDetector()
    const results: { rawValue: string }[] = await detector.detect(bitmap)
    const filtered = results
      .map(r => r.rawValue.trim())
      .filter(t => {
        if (t.length < 3) return false
        const lower = t.toLowerCase()
        return !OCR_FALSE_FLAGS.some(f => lower.includes(f))
      })
    return filtered.join(' ').trim()
  } catch {
    return ''
  }
}

// ─── QR Image (canvas — bakes header/footer into the PNG) ─────────────────────

const QrImage = forwardRef<HTMLCanvasElement, { imageBase64: string; presetName: string; guitar?: import('@/lib/types').GuitarSetup; size?: number }>(
  function QrImage({ imageBase64, presetName, guitar, size = 176 }, ref) {
    const internalRef = useRef<HTMLCanvasElement>(null)
    const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) ?? internalRef

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const guitarParts = [
        guitar?.pickup ? `${guitar.pickup}${guitar.pickupType ? ` (${guitar.pickupType})` : ''}` : null,
        ...(Array.isArray(guitar?.controls) ? guitar.controls : []).map(c => `${c.label}: ${c.value}/10`),
      ].filter(Boolean) as string[]
      const guitarLine = guitarParts.join('  ·  ')

      const img = new Image()
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1
        const pad = 16
        const headerH = 30
        const footerH = guitarLine ? 46 : 30
        const w = size + pad * 2
        const h = size + headerH + footerH

        canvas.width  = w * dpr
        canvas.height = h * dpr
        canvas.style.width  = `${w}px`
        canvas.style.height = `${h}px`

        ctx.scale(dpr, dpr)

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)

        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.font      = '500 9px system-ui,sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('GENERATED BY MIGHTY AI QR', w / 2, 18)

        ctx.drawImage(img, pad, headerH, size, size)

        ctx.fillStyle = 'rgba(0,0,0,0.42)'
        ctx.font      = '600 11px system-ui,sans-serif'
        ctx.fillText(presetName, w / 2, headerH + size + 18, w - pad * 2)

        if (guitarLine) {
          ctx.fillStyle = 'rgba(0,0,0,0.32)'
          ctx.font      = '500 9px system-ui,sans-serif'
          ctx.fillText(guitarLine, w / 2, headerH + size + 34, w - pad * 2)
        }
      }
      img.src = imageBase64
    }, [imageBase64, presetName, guitar, size, canvasRef])

    const hasGuitar = guitar && (guitar.pickup || guitar.pickupType || (guitar.controls?.length ?? 0) > 0)
    const totalH = size + (hasGuitar ? 76 : 60)
    return <canvas ref={canvasRef} style={{ width: size, height: totalH }} />
  }
)

function useLongPress(onLongPress: () => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moved = useRef(false)
  const fired = useRef(false)

  const start = useCallback(() => {
    moved.current = false
    fired.current = false
    timer.current = setTimeout(() => {
      if (!moved.current) {
        fired.current = true
        onLongPress()
      }
    }, delay)
  }, [onLongPress, delay])

  const cancel = useCallback((e?: React.TouchEvent) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    // suppress the synthetic click that fires after a long press
    if (fired.current && e) e.preventDefault()
  }, [])

  const onMove = useCallback(() => {
    moved.current = true
    cancel()
  }, [cancel])

  return { onTouchStart: start, onTouchEnd: cancel, onTouchMove: onMove }
}

function useQrDownload(canvasRef: React.RefObject<HTMLCanvasElement | null>, presetName: string) {
  return () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${presetName.replace(/[^a-z0-9]/gi, '_')}.png`
    a.click()
  }
}

function useQrShare(canvasRef: React.RefObject<HTMLCanvasElement | null>, presetName: string) {
  return () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const title = `${presetName} — Mighty AI QR`
    const text = `Check out this guitar tone: ${presetName}`
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `${presetName.replace(/[^a-z0-9]/gi, '_')}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title, text }).catch(() => {})
      } else if (navigator.share) {
        navigator.share({ title, text }).catch(() => {})
      } else {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://github.com/steve-krisjanovs/mighty-ai-qr-web')}&quote=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
      }
    }, 'image/png')
  }
}

// ─── QR Card ──────────────────────────────────────────────────────────────────

function QrCard({ qr, description, className = '' }: { qr: QrResult; description?: string; className?: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const download = useQrDownload(canvasRef, qr.presetName)
  const share = useQrShare(canvasRef, qr.presetName)
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(qr.presetName + ' guitar tone')}`

  return (
    <div className={`rounded-2xl border border-white/10 bg-surface-2 overflow-hidden ${className}`}>
      <div className="flex justify-center bg-white p-4">
        <QrImage ref={canvasRef} imageBase64={qr.imageBase64} presetName={qr.presetName} guitar={qr.guitar} />
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-fg leading-tight">{qr.presetName}</p>
          <p className="text-xs text-fg-3 mt-0.5">{qr.deviceName}</p>
          {description && (
            <p className="text-[11px] text-fg-4 leading-relaxed mt-1.5">{description}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={download} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
            <DownloadIcon /> Download
          </button>
          <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
            <YoutubeIcon /> Reference
          </a>
        </div>
        <div className="border-t border-white/10 pt-3">
          <button onClick={() => setSettingsOpen(o => !o)} className="flex w-full items-center justify-between text-xs text-fg-3 hover:text-fg transition-colors">
            <span>Tone settings</span>
            <ChevronIcon open={settingsOpen} />
          </button>
          <div className={`grid transition-all duration-200 ease-in-out ${settingsOpen ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className="space-y-1.5">
                {qr.settings.map((slot, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${slot.enabled ? 'bg-green-400' : 'bg-fg-4'}`} />
                    <div className="min-w-0">
                      <span className="text-[11px] text-fg-3">{slot.slot}: </span>
                      <span className="text-[11px] text-fg">{slot.selection}</span>
                      {slot.params && Object.keys(slot.params).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3">
                          {Object.entries(slot.params).slice(0, 4).map(([k, v]) => (
                            <span key={k} className="text-[10px] text-fg-4">{k}: {v}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Error Explain Modal ──────────────────────────────────────────────────────

const ERROR_EXPLANATIONS: { match: (msg: string) => boolean; title: string; body: string; fix: string }[] = [
  {
    match: m => m.includes('free request limit'),
    title: "Today's free requests used up",
    body: "This app offers a limited number of free AI requests per day shared across all users. Today's quota has been reached.",
    fix: "Add your own API key in Settings to keep going. Anthropic gives free credits on signup at console.anthropic.com — no payment method required.",
  },
  {
    match: m => m.includes('429') || m.includes('quota') || m.includes('rate'),
    title: 'Too many requests or quota exceeded (429)',
    body: 'Your API key has hit a limit. This can mean:\n• You\'ve run out of credits on this account\n• You\'re on a free tier with low rate limits\n• You\'re sending requests too fast',
    fix: 'Check your billing/usage page for this provider and top up credits or upgrade your plan.',
  },
  {
    match: m => m.includes('401') || m.includes('Unauthorized') || m.includes('invalid_api_key') || m.includes('authentication'),
    title: 'Invalid or missing API key (401)',
    body: 'The API key was rejected. This usually means:\n• The key was entered incorrectly\n• The key has been revoked\n• The key belongs to a different provider',
    fix: 'Double-check the key in Settings. Copy it fresh from the provider\'s dashboard.',
  },
  {
    match: m => m.includes('403') || m.includes('Forbidden') || m.includes('permission'),
    title: 'Access denied (403)',
    body: 'Your key doesn\'t have permission to use this model or endpoint.',
    fix: 'Check that your account has access to the selected model, or try a different model.',
  },
  {
    match: m => m.includes('insufficient_quota'),
    title: 'Account has no credits (insufficient_quota)',
    body: 'Your account has a zero balance. Requests will fail until you add credits.',
    fix: 'Add a payment method and purchase credits on the provider\'s billing page.',
  },
  {
    match: m => m.includes('model') && (m.includes('not found') || m.includes('does not exist')),
    title: 'Model not found',
    body: 'The selected model name doesn\'t exist or isn\'t available on your account.',
    fix: 'Open Settings and choose a different model from the dropdown.',
  },
  {
    match: m => m.includes('503') || m.includes('service unavailable'),
    title: 'Local LLM not running (503)',
    body: 'The server at the configured base URL is not available. This usually means:\n• Ollama / LM Studio / Open WebUI is not running\n• The service crashed or hasn\'t started yet',
    fix: 'Start your local LLM server and try again. For Ollama: run `ollama serve`. For LM Studio: open the app and start the local server.',
  },
  {
    match: m => m.includes('502') || m.includes('bad gateway'),
    title: 'Cannot reach local LLM (502)',
    body: 'The request reached a proxy or gateway but it couldn\'t connect to your local LLM behind it.',
    fix: 'Check that your local LLM is running and that the base URL in Settings is correct (including port).',
  },
  {
    match: m => m.includes('504') || m.includes('gateway timeout') || m.includes('timed out') || m.includes('timeout'),
    title: 'Request timed out (504)',
    body: 'The model took too long to respond. This happens with large models or when the machine is under heavy load.',
    fix: 'Try a smaller/faster model, or wait and try again. For Ollama, the first request after startup can be slow while the model loads.',
  },
  {
    match: m => m.includes('500') || m.includes('internal server error'),
    title: 'LLM server error (500)',
    body: 'The local LLM server encountered an internal error. This can happen when:\n• The model doesn\'t support tool/function calling\n• The request format isn\'t compatible with this server\n• The model ran out of context or memory',
    fix: 'Try switching to a model that supports tool calling (e.g. llama3.2, mistral-nemo, qwen2.5). Check your LLM server logs for details.',
  },
  {
    match: m => m.includes('econnrefused') || m.includes('connection refused') || m.includes('fetch failed') || m.includes('enotfound'),
    title: 'Connection refused',
    body: 'Nothing is listening at the configured base URL. The local LLM server is either not running or on a different port.',
    fix: 'Start your local LLM server and verify the base URL in Settings matches the port it\'s running on (e.g. http://localhost:11434/v1 for Ollama).',
  },
]

function getErrorExplanation(msg: string) {
  const lower = msg.toLowerCase()
  return ERROR_EXPLANATIONS.find(e => e.match(lower)) ?? null
}

function ErrorExplainModal({ error, onClose }: { error: string; onClose: () => void }) {
  const explanation = getErrorExplanation(error)
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-fg">{explanation?.title ?? 'Something went wrong'}</p>
            <button onClick={onClose} className="text-fg-4 hover:text-fg-2 transition-colors shrink-0"><CloseIcon /></button>
          </div>
          {explanation ? (
            <>
              <p className="text-xs text-fg-3 whitespace-pre-line">{explanation.body}</p>
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                <p className="text-[11px] font-medium text-primary mb-0.5">How to fix</p>
                <p className="text-[11px] text-fg-3">{explanation.fix}</p>
              </div>
            </>
          ) : (
            <p className="text-xs text-fg-3">{error}</p>
          )}
          <p className="text-[10px] text-fg-4 border-t border-white/5 pt-3">Raw error: {error}</p>
        </div>
      </div>
    </>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ label, onConfirm, onCancel }: {
  label: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up p-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-fg">Delete this?</p>
            <p className="mt-1 text-xs text-fg-3 truncate">{label}</p>
          </div>
          <p className="text-xs text-fg-4">This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-fg-3 hover:text-fg transition-colors">
              Cancel
            </button>
            <button onClick={onConfirm} className="flex-1 rounded-lg bg-surface-3 border border-white/10 py-2.5 text-sm font-medium text-fg hover:bg-surface-2 transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QrModal({ item, onClose, onDeleteRequest, onRename, onRefine }: {
  item: HistoryItem
  onClose: () => void
  onDeleteRequest: () => void
  onRename: (name: string) => void
  onRefine: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.qr.presetName)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const download = useQrDownload(canvasRef, name)
  const share = useQrShare(canvasRef, item.qr.presetName)

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(item.qr.presetName + ' guitar tone')}`

  const commitRename = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== item.qr.presetName) onRename(trimmed)
    setEditing(false)
  }

  useEffect(() => {
    if (editing) nameInputRef.current?.focus()
  }, [editing])

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

          {/* QR Image */}
          <div className="relative flex justify-center bg-white p-4 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/15 hover:bg-black/30 text-black/50 hover:text-black/80 transition-colors"
            >
              <CloseIcon />
            </button>
            <QrImage ref={canvasRef} imageBase64={item.qr.imageBase64} presetName={name} guitar={item.qr.guitar} />
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            <div>
              {editing ? (
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') { setName(item.qr.presetName); setEditing(false) }
                  }}
                  className="w-full rounded-lg border border-primary/50 bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg outline-none"
                />
              ) : (
                <button onClick={() => setEditing(true)} className="text-left group">
                  <p className="text-sm font-medium text-fg group-hover:text-primary transition-colors">
                    {name} <span className="text-[10px] text-fg-4 group-hover:text-fg-3">rename</span>
                  </p>
                </button>
              )}
              <p className="text-xs text-fg-3 mt-0.5">{item.qr.deviceName}</p>
              {item.qr.importNote && (
                <p className="text-xs text-fg-4 italic mt-1">"{item.qr.importNote}"</p>
              )}
            </div>

            <button onClick={onRefine} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 active:opacity-80 transition-colors shadow-sm">
              Refine tone
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={download} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                <DownloadIcon /> Download
              </button>
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                <YoutubeIcon /> Reference
              </a>
              <button onClick={share} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                <FacebookIcon /> Share
              </button>
            </div>

            <div className="border-t border-white/10 pt-3">
              <button onClick={() => setSettingsOpen(o => !o)} className="flex w-full items-center justify-between text-xs text-fg-3 hover:text-fg transition-colors">
                <span>Tone settings</span>
                <ChevronIcon open={settingsOpen} />
              </button>
              <div className={`grid transition-all duration-200 ease-in-out ${settingsOpen ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="space-y-1.5">
                    {item.qr.settings.map((slot, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${slot.enabled ? 'bg-green-400' : 'bg-fg-4'}`} />
                        <div className="min-w-0">
                          <span className="text-[11px] text-fg-3">{slot.slot}: </span>
                          <span className="text-[11px] text-fg">{slot.selection}</span>
                          {slot.params && Object.keys(slot.params).length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-x-3">
                              {Object.entries(slot.params).slice(0, 4).map(([k, v]) => (
                                <span key={k} className="text-[10px] text-fg-4">{k}: {v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button onClick={onDeleteRequest} className="flex w-full items-center justify-center gap-1.5 py-1.5 text-xs text-fg-4 hover:text-fg-2 transition-colors">
              <TrashIcon /> Delete preset
            </button>
          </div>

        </div>
      </div>
    </>
  )
}

// ─── Chat QR Modal ────────────────────────────────────────────────────────────

function ChatQrModal({ qr, description, onClose, onRefine }: { qr: QrResult; description: string; onClose: () => void; onRefine: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const download = useQrDownload(canvasRef, qr.presetName)
  const share = useQrShare(canvasRef, qr.presetName)
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(qr.presetName + ' guitar tone')}`

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

          {/* QR Image */}
          <div className="relative flex justify-center bg-white p-4 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/15 hover:bg-black/30 text-black/50 hover:text-black/80 transition-colors"
            >
              <CloseIcon />
            </button>
            <QrImage ref={canvasRef} imageBase64={qr.imageBase64} presetName={qr.presetName} guitar={qr.guitar} />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            <div>
              <p className="text-sm font-medium text-fg">{qr.presetName}</p>
              <p className="text-xs text-fg-3 mt-0.5">{qr.deviceName}</p>
              {description && (() => {
                const excerpt = description
                  .replace(/#{1,6}\s+[^\n]*/g, '')
                  .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
                  .replace(/`[^`]+`/g, '')
                  .split('\n').map(l => l.trim()).filter(Boolean)[0] ?? ''
                const short = excerpt.length > 160 ? excerpt.slice(0, 157) + '…' : excerpt
                return short ? <p className="text-[11px] text-fg-4 leading-relaxed mt-2">{short}</p> : null
              })()}
            </div>

            <button onClick={onRefine} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 active:opacity-80 transition-colors shadow-sm">
              Refine tone
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={download} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                <DownloadIcon /> Download
              </button>
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                <YoutubeIcon /> Reference
              </a>
              <button onClick={share} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                <FacebookIcon /> Share
              </button>
            </div>

            <div className="border-t border-white/10 pt-3">
              <button onClick={() => setSettingsOpen(o => !o)} className="flex w-full items-center justify-between text-xs text-fg-3 hover:text-fg transition-colors">
                <span>Tone settings</span>
                <ChevronIcon open={settingsOpen} />
              </button>
              <div className={`grid transition-all duration-200 ease-in-out ${settingsOpen ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="space-y-1.5">
                    {qr.settings.map((slot, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${slot.enabled ? 'bg-green-400' : 'bg-fg-4'}`} />
                        <div className="min-w-0">
                          <span className="text-[11px] text-fg-3">{slot.slot}: </span>
                          <span className="text-[11px] text-fg">{slot.selection}</span>
                          {slot.params && Object.keys(slot.params).length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-x-3">
                              {Object.entries(slot.params).slice(0, 4).map(([k, v]) => (
                                <span key={k} className="text-[10px] text-fg-4">{k}: {v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}

// ─── About Modal ──────────────────────────────────────────────────────────────

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/icons/icon-192.png" alt="Mighty AI QR" className="h-12 w-12 rounded-xl shrink-0" />
              <div>
                <p className="text-sm font-semibold text-fg">Mighty AI QR</p>
                <p className="text-[11px] text-fg-4 mt-1 leading-relaxed">
                  Describe a guitar tone in plain English — get a scannable QR code for your NUX MightyAmp, instantly.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 text-fg-4 hover:text-fg transition-colors"><CloseIcon /></button>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-1">
            <p className="text-[11px] font-medium text-fg-3 uppercase tracking-wider">Author</p>
            <a href="https://github.com/steve-krisjanovs/mighty-ai-qr-web" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              github.com/steve-krisjanovs/mighty-ai-qr-web
            </a>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-1">
            <p className="text-[11px] font-medium text-fg-3 uppercase tracking-wider">Credits</p>
            <p className="text-[11px] text-fg-4">QR format based on NUX MightyAmp. Special thanks to:</p>
            <a href="https://github.com/tuntorius/mightier_amp" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              github.com/tuntorius/mightier_amp
            </a>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

const PROVIDERS: { id: AiProvider; label: string; keyPlaceholder: string; defaultBase?: string; defaultModel?: string; local?: boolean; apiKeyUrl?: string; note?: string; builtin?: boolean }[] = [
  { id: 'builtin',   label: 'Free (Built-in)', keyPlaceholder: '', builtin: true, note: 'Powered by Claude Haiku. No key needed. Shared daily limit applies.' },
  { id: 'anthropic', label: 'Anthropic',  keyPlaceholder: 'sk-ant-...',             apiKeyUrl: 'https://console.anthropic.com/settings/keys', note: 'Free credits included on signup.' },
  { id: 'openai',    label: 'OpenAI',     keyPlaceholder: 'sk-...',                  defaultModel: 'gpt-4o', apiKeyUrl: 'https://platform.openai.com/api-keys', note: 'Requires a paid billing plan — no free tier.' },
  { id: 'gemini',    label: 'Gemini',     keyPlaceholder: 'AIza...',                 defaultModel: 'gemini-2.0-flash', defaultBase: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyUrl: 'https://aistudio.google.com/app/apikey', note: 'API billing is separate from Gemini Pro. Enable billing in Google Cloud for full access.' },
  { id: 'grok',      label: 'Grok (xAI)', keyPlaceholder: 'xai-...',                defaultModel: 'grok-3-mini', defaultBase: 'https://api.x.ai/v1', apiKeyUrl: 'https://console.x.ai/', note: 'Free trial credits on signup.' },
  { id: 'mistral',   label: 'Mistral',    keyPlaceholder: 'your Mistral key',        defaultModel: 'mistral-small-latest', defaultBase: 'https://api.mistral.ai/v1', apiKeyUrl: 'https://console.mistral.ai/api-keys', note: 'Free tier available with rate limits.' },
  { id: 'groq',      label: 'Groq',       keyPlaceholder: 'gsk_...',                 defaultModel: 'llama-3.3-70b-versatile', defaultBase: 'https://api.groq.com/openai/v1', apiKeyUrl: 'https://console.groq.com/keys', note: 'Generous free tier. Very fast inference.' },
  { id: 'ollama',    label: 'Ollama',     keyPlaceholder: 'none required',           defaultBase: 'http://localhost:11434/v1',  defaultModel: 'llama3.2', local: true },
  { id: 'openwebui', label: 'Open WebUI', keyPlaceholder: 'your Open WebUI key',     defaultBase: 'http://localhost:3000/openai/v1', defaultModel: 'llama3.2', local: true },
  { id: 'lmstudio',  label: 'LM Studio',  keyPlaceholder: 'lm-studio (any value)',   defaultBase: 'http://localhost:1234/v1',   defaultModel: 'local-model', local: true },
]

const PROVIDER_GROUPS = [
  { label: 'Free Tier', ids: ['builtin'] as AiProvider[] },
  { label: 'Cloud', ids: ['anthropic', 'openai', 'gemini', 'grok', 'mistral', 'groq'] as AiProvider[] },
  { label: 'Local', ids: ['ollama', 'openwebui', 'lmstudio'] as AiProvider[] },
]

function LocalLlmInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-surface shadow-2xl animate-scale-up p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-fg">Local LLMs — Self-Hosting Required</p>
            <button onClick={onClose} className="text-fg-4 hover:text-fg-2 transition-colors shrink-0"><CloseIcon /></button>
          </div>
          <p className="text-xs text-fg-3">Ollama, LM Studio, and Open WebUI run on your own machine. They are only reachable when you self-host this app via Docker on the same network as your LLM server.</p>
          <div className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-medium text-fg-2">How to self-host</p>
            <p className="text-[11px] text-fg-3">Clone the repo, run <code className="font-mono bg-white/5 px-1 rounded">docker compose up -d</code>, and point your browser at the container. Your local LLMs will be reachable at <code className="font-mono bg-white/5 px-1 rounded">localhost</code> URLs.</p>
          </div>
          <p className="text-[11px] text-fg-4">On the public hosted version, requests to localhost addresses will fail — the server has no access to your machine.</p>
        </div>
      </div>
    </>
  )
}

function ProviderDropdown({ value, onChange }: { value: AiProvider; onChange: (p: AiProvider) => void }) {
  const [open, setOpen] = useState(false)
  const [showLocalInfo, setShowLocalInfo] = useState(false)
  const current = PROVIDERS.find(p => p.id === value)!

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
      >
        <span>{current.label}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden">
            {PROVIDER_GROUPS.map(group => (
              <div key={group.label}>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-4">{group.label}</p>
                  {group.label === 'Local' && (
                    <button
                      onClick={e => { e.stopPropagation(); setOpen(false); setShowLocalInfo(true) }}
                      className="text-fg-4 hover:text-fg-2 transition-colors"
                      title="Self-hosting required"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
                {group.ids.map(id => {
                  const p = PROVIDERS.find(x => x.id === id)!
                  return (
                    <button
                      key={id}
                      onClick={() => { onChange(id); setOpen(false) }}
                      className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                        value === id ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                      }`}
                    >
                      {p.label}
                      {value === id && <span className="ml-auto text-primary">✓</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
      {showLocalInfo && <LocalLlmInfoModal onClose={() => setShowLocalInfo(false)} />}
    </div>
  )
}

function BuiltinPill() {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/quota').then(r => r.json()).then(d => setRemaining(d.remaining)).catch(() => {})
  }, [])
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2 px-3 py-1 text-xs text-fg-4 select-none">
      Haiku · Free
      {remaining !== null && (
        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${remaining <= 10 ? 'bg-red-900/40 text-red-400' : 'bg-white/5 text-fg-4'}`}>
          {remaining} left today
        </span>
      )}
    </div>
  )
}

// Self-contained desktop header pill — reads/writes localStorage, fetches models
function HeaderModelPill({ settingsVersion }: { settingsVersion: number }) {
  const [config, setConfig] = useState<ReturnType<typeof getActiveConfig>>(null)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => { setConfig(getActiveConfig()) }, [settingsVersion])
  useEffect(() => {
    if (!config) return
    let cancelled = false
    setModels([])
    setLoadingModels(true)
    fetchModels(config.provider, config.apiKey, config.baseUrl ?? '').then(m => {
      if (!cancelled) { setModels(m); setLoadingModels(false) }
    }).catch(() => { if (!cancelled) setLoadingModels(false) })
    return () => { cancelled = true }
  }, [config?.provider, config?.apiKey, config?.baseUrl])

  const isByok = !!config?.apiKey || !!config?.baseUrl
  if (!config || config.provider === 'builtin' || !isByok) return <BuiltinPill />



  const handleChange = (model: string) => {
    const settings = getApiSettings()
    if (!settings) return
    const providerConf: ProviderConfig = { ...(settings.configs[config.provider] ?? { apiKey: '' }), model }
    saveApiSettings({ ...settings, configs: { ...settings.configs, [config.provider]: providerConf } })
    setConfig(prev => prev ? { ...prev, model } : prev)
  }

  const providerLabel = PROVIDERS.find(p => p.id === config.provider)?.label ?? config.provider

  return <ModelPill value={config.model ?? ''} onChange={handleChange} models={models} loading={loadingModels} providerLabel={providerLabel} />
}

// Compact pill for desktop header — shows current model, click to pick from list
function ModelPill({ value, onChange, models, loading, providerLabel }: { value: string; onChange: (m: string) => void; models: string[]; loading: boolean; providerLabel?: string }) {
  const [open, setOpen] = useState(false)
  const label = value || 'auto'
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2 px-3 py-1 text-xs text-fg-2 hover:border-white/20 hover:text-fg transition-colors"
      >
        {providerLabel && <><span className="shrink-0 text-fg-4">{providerLabel}</span><span className="text-fg-4">·</span></>}
        {loading
          ? <span className="h-2.5 w-2.5 animate-spin rounded-full border border-fg-4 border-t-primary" />
          : <span className="max-w-[120px] truncate">{label}</span>}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-full z-20 mt-1.5 max-h-60 w-56 -translate-x-1/2 overflow-y-auto rounded-lg border border-white/10 bg-surface-2 shadow-xl">
            <button onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false) }} className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${!value ? 'text-primary bg-primary/10' : 'text-fg-4 hover:bg-surface-3 hover:text-fg'}`}>
              (auto / default){!value && <span className="ml-auto text-primary">✓</span>}
            </button>
            {models.map(m => (
              <button key={m} onMouseDown={e => { e.preventDefault(); onChange(m); setOpen(false) }} className={`flex w-full items-center px-3 py-2 text-xs transition-colors ${value === m ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'}`}>
                <span className="truncate">{m}</span>
                {value === m && <span className="ml-auto shrink-0 text-primary">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ModelDropdown({
  value, onChange, models, loading, compact = false,
}: {
  value: string
  onChange: (m: string) => void
  models: string[]
  loading: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)

  // Sync input text when saved value changes (e.g. provider switch)
  useEffect(() => { setQuery(value) }, [value])

  const allModels = value && !models.includes(value) ? [value, ...models] : models
  const isFiltering = query !== '' && query !== value
  const filtered = isFiltering
    ? allModels.filter(m => m.toLowerCase().includes(query.toLowerCase()))
    : allModels

  const handleSelect = (m: string) => {
    onChange(m)
    setQuery(m)
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleBlur = () => {
    // If typed text doesn't match any model, keep it as a custom value
    setTimeout(() => {
      setOpen(false)
      if (query !== value) onChange(query)
    }, 150)
  }

  return (
    <div className="relative">
      <div className={`flex items-center rounded-lg border border-white/10 bg-surface-2 focus-within:border-primary/50 transition-colors ${compact ? 'px-2.5 py-1' : 'px-3 py-2.5'}`}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder="Select or type model…"
          className={`flex-1 bg-transparent placeholder-fg-4 outline-none ${compact ? 'text-xs text-fg-2' : 'text-sm text-fg'}`}
        />
        {loading
          ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fg-4 border-t-primary" />
          : <ChevronIcon open={open} />}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-surface-2 shadow-xl">
            <button
              onMouseDown={e => { e.preventDefault(); handleClear() }}
              className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                !value ? 'text-primary bg-primary/10' : 'text-fg-4 hover:bg-surface-3 hover:text-fg'
              }`}
            >
              (auto / default)
              {!value && <span className="ml-auto text-primary">✓</span>}
            </button>
            {loading && filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-fg-4">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-fg-4">No models found</p>
            ) : (
              filtered.map(m => (
                <button
                  key={m}
                  onMouseDown={e => { e.preventDefault(); handleSelect(m) }}
                  className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                    value === m ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                  }`}
                >
                  <span className="truncate">{m}</span>
                  {value === m && <span className="ml-auto shrink-0 text-primary">✓</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

const NON_CHAT_KEYWORDS = ['vision', 'embed', 'audio', 'whisper', 'tts', 'ocr', 'rerank', 'clip']
function isNonChatModel(model: string) {
  const m = model.toLowerCase()
  return NON_CHAT_KEYWORDS.some(k => m.includes(k))
}

function ModelBar({ settingsVersion, compact = false, inline = false, compactDropdown = false }: { settingsVersion: number; compact?: boolean; inline?: boolean; compactDropdown?: boolean }) {
  const [config, setConfig] = useState<ReturnType<typeof getActiveConfig>>(null)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => { setConfig(getActiveConfig()) }, [settingsVersion])

  useEffect(() => {
    if (!config) return
    let cancelled = false
    setModels([])
    setLoadingModels(true)
    fetchModels(config.provider, config.apiKey, config.baseUrl ?? '').then(m => {
      if (!cancelled) { setModels(m); setLoadingModels(false) }
    }).catch(() => { if (!cancelled) setLoadingModels(false) })
    return () => { cancelled = true }
  }, [config?.provider, config?.apiKey, config?.baseUrl])

  if (!config) return null

  const providerLabel = PROVIDERS.find(p => p.id === config.provider)?.label ?? config.provider

  const handleModelChange = (model: string) => {
    const settings = getApiSettings()
    if (!settings) return
    const providerConf: ProviderConfig = { ...(settings.configs[config.provider] ?? { apiKey: '' }), model }
    saveApiSettings({ ...settings, configs: { ...settings.configs, [config.provider]: providerConf } })
    setConfig((prev): typeof prev => prev ? { ...prev, model } : prev)
  }

  const selectedModel = config.model ?? ''
  const warn = selectedModel && isNonChatModel(selectedModel)

  if (compact) {
    return (
      <div className="px-4 pb-1.5 pt-0.5">
        <ModelDropdown value={selectedModel} onChange={handleModelChange} models={models} loading={loadingModels} compact={compactDropdown} />
        {warn && <p className="mt-1 text-[11px] text-amber-400">"{selectedModel}" may not support chat — select a text generation model.</p>}
      </div>
    )
  }

  const inner = (
    <>
      <div className="flex items-center justify-center gap-2">
        <span className="shrink-0 text-[11px] text-fg-4">{providerLabel}</span>
        <div className="flex-1">
          <ModelDropdown value={selectedModel} onChange={handleModelChange} models={models} loading={loadingModels} compact={compactDropdown} />
        </div>
      </div>
      {warn && <p className="mt-1 text-center text-[11px] text-amber-400">"{selectedModel}" may not support chat — select a text generation model.</p>}
    </>
  )

  if (inline) return <>{inner}</>

  return (
    <div className="border-b border-white/10 bg-surface px-4 py-2">
      {inner}
    </div>
  )
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const saved = getApiSettings()
  const [provider, setProvider] = useState<AiProvider>(saved?.provider ?? 'builtin')
  const [configs, setConfigs] = useState<Partial<Record<AiProvider, ProviderConfig>>>(saved?.configs ?? {})
  const [showKey, setShowKey] = useState(false)
  const [didSave, setDidSave] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showAboutModal, setShowAboutModal] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => getTheme())
  const [themeOpen, setThemeOpen] = useState(false)

  const applyTheme = (t: Theme) => {
    setCurrentTheme(t)
    document.documentElement.dataset.theme = t
    saveTheme(t)
  }

  const current = PROVIDERS.find(p => p.id === provider)!
  const isLocal = current.local ?? false
  const currentConfig = configs[provider] ?? { apiKey: '' }
  const apiKey = currentConfig.apiKey ?? ''
  const baseUrl = currentConfig.baseUrl ?? ''
  const model = currentConfig.model ?? ''

  // Fetch available models whenever provider/baseUrl/apiKey changes
  useEffect(() => {
    let cancelled = false
    setAvailableModels([])
    setLoadingModels(true)
    fetchModels(provider, apiKey, baseUrl).then(models => {
      if (!cancelled) { setAvailableModels(models); setLoadingModels(false) }
    })
    return () => { cancelled = true }
  }, [provider, apiKey, baseUrl])

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => onClose(), 240)
  }

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p)
    const def = PROVIDERS.find(x => x.id === p)
    setConfigs(prev => {
      const existing = prev[p] ?? { apiKey: '' }
      return {
        ...prev,
        [p]: {
          ...existing,
          baseUrl: existing.baseUrl || def?.defaultBase || '',
          model:   existing.model   || def?.defaultModel || '',
        },
      }
    })
  }

  const setApiKey = (val: string) => {
    setConfigs(prev => ({ ...prev, [provider]: { ...prev[provider] ?? {}, apiKey: val } }))
  }

  const setBaseUrl = (val: string) => {
    setConfigs(prev => ({ ...prev, [provider]: { ...prev[provider] ?? { apiKey: '' }, baseUrl: val } }))
  }

  const setModel = (val: string) => {
    setConfigs(prev => ({ ...prev, [provider]: { ...prev[provider] ?? { apiKey: '' }, model: val } }))
  }

  const handleSave = () => {
    saveApiSettings({ provider, configs })
    setDidSave(true)
    setTimeout(() => setDidSave(false), 1500)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={handleClose} />
      <aside className={`fixed right-0 top-0 z-50 flex h-full w-80 flex-col bg-surface shadow-2xl ${closing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-medium text-fg">Settings</h2>
          <button onClick={handleClose} className="text-fg-3 hover:text-fg transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Theme */}
          <div>
            <p className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-2">Theme</p>
            <div className="relative">
              {(() => { const active = THEMES.find(t => t.id === currentTheme)!; return (
                <button
                  onClick={() => setThemeOpen(o => !o)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
                >
                  <div className="flex gap-1 shrink-0">
                    <div style={{ background: active.bg }} className="h-3 w-3 rounded-sm border border-white/10" />
                    <div style={{ background: active.primary }} className="h-3 w-3 rounded-sm" />
                    <div style={{ background: active.fg, opacity: 0.7 }} className="h-3 w-3 rounded-sm" />
                  </div>
                  <span className="flex-1 text-left">{active.label}</span>
                  <span className="text-xs text-fg-4">{active.desc}</span>
                  <ChevronIcon open={themeOpen} />
                </button>
              )})()}
              {themeOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setThemeOpen(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { applyTheme(t.id); setThemeOpen(false) }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                          currentTheme === t.id ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                        }`}
                      >
                        <div className="flex gap-1 shrink-0">
                          <div style={{ background: t.bg }} className="h-3 w-3 rounded-sm border border-white/10" />
                          <div style={{ background: t.primary }} className="h-3 w-3 rounded-sm" />
                          <div style={{ background: t.fg, opacity: 0.7 }} className="h-3 w-3 rounded-sm" />
                        </div>
                        <span className="flex-1 text-left">{t.label}</span>
                        <span className="text-xs opacity-50">{t.desc}</span>
                        {currentTheme === t.id && <span className="ml-auto text-primary shrink-0">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Provider */}
          <div>
            <p className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-3">AI Provider</p>
            <ProviderDropdown value={provider} onChange={handleProviderChange} />
            {current.apiKeyUrl && (
              <a
                href={current.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Get your {current.label} API key
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            )}
            {current.note && (
              <p className="mt-1.5 text-[11px] text-fg-4">{current.note}</p>
            )}
          </div>

          {/* Base URL — local providers + Gemini */}
          {provider !== 'builtin' && (isLocal || provider === 'gemini') && (
            <div>
              <p className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-3">Base URL</p>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={current.defaultBase}
                className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary/50 transition-colors"
              />
              <p className="mt-1.5 text-[11px] text-fg-4">
                {isLocal ? `URL of your local ${current.label} instance (include /v1)` : 'OpenAI-compatible endpoint'}
              </p>
              {isLocal && (
                <p className="mt-1 text-[11px] text-fg-4">Running in Docker? Ollama must bind to all interfaces: set <span className="font-mono text-fg-3">OLLAMA_HOST=0.0.0.0</span> in its service environment.</p>
              )}
            </div>
          )}

          {/* Model */}
          {provider !== 'builtin' && (
            <div>
              <p className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-3">Model</p>
              <ModelDropdown
                value={model}
                onChange={setModel}
                models={availableModels}
                loading={loadingModels}
              />
            </div>
          )}

          {/* API Key */}
          {provider !== 'builtin' && <div>
            <p className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-3">
              API Key {isLocal && <span className="normal-case text-fg-4">(optional for local)</span>}
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={current.keyPlaceholder}
                className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 pr-9 text-sm text-fg placeholder-fg-4 outline-none focus:border-primary/50 transition-colors"
              />
              <button
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-3 transition-colors"
              >
                <EyeIcon show={showKey} />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-fg-4">
              Stored per provider, locally in your browser. Never sent to our servers.
            </p>
          </div>}

          <button
            onClick={handleSave}
            className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
              didSave
                ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                : 'bg-primary text-on-primary hover:opacity-90'
            }`}
          >
            {didSave ? 'Saved' : 'Save'}
          </button>

          {/* About */}
          <div className="border-t border-white/10 pt-4">
            <button
              onClick={() => setShowAboutModal(true)}
              className="flex w-full items-center justify-between hover:text-fg transition-colors"
            >
              <span className="text-xs font-medium text-fg-3 uppercase tracking-wider">About</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </button>
          </div>
          {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}
        </div>
      </aside>
    </>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function QrHistoryItem({ item, onOpen, onDeleteRequest, onRename }: {
  item: HistoryItem; onOpen: () => void; onDeleteRequest: () => void; onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.presetName)
  const inputRef = useRef<HTMLInputElement>(null)
  const longPress = useLongPress(() => { setName(item.presetName); setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()) })

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== item.presetName) onRename(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex w-full items-center gap-2 px-3 py-2.5 bg-surface-2">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-white p-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageBase64} alt={item.presetName} className="h-full w-full object-contain" />
        </div>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 min-w-0 bg-transparent text-xs text-fg outline-none border-b border-primary py-0.5"
        />
      </div>
    )
  }

  return (
    <div className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-surface-2 transition-colors" {...longPress}>
      <button onClick={onOpen} className="flex flex-1 items-center gap-3 min-w-0 text-left">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-white p-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageBase64} alt={item.presetName} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-fg">{item.presetName}</p>
          <p className="text-[10px] text-fg-4">{relativeTime(item.timestamp)}</p>
        </div>
      </button>
      <button onClick={e => { e.stopPropagation(); onDeleteRequest() }} className="flex h-7 w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors">
        <TrashIcon />
      </button>
    </div>
  )
}

function Sidebar({
  conversations, activeId, onSelect, onNew, onDelete, onRenameConv, qrHistory, onQrSelect, onQrDelete, onRenameQr, onDeleteRequest, visible, collapsed, onClose, onCollapse, onQrImported, onSettings, onDeleteAllChats, onDeleteAllQr,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRenameConv: (id: string, name: string) => void
  qrHistory: HistoryItem[]
  onQrSelect: (item: HistoryItem) => void
  onQrDelete: (id: string) => void
  onRenameQr: (id: string, name: string) => void
  onDeleteRequest: (label: string, onConfirm: () => void) => void
  visible: boolean
  collapsed: boolean
  onClose: () => void
  onCollapse: () => void
  onQrImported: (file: File) => void
  onSettings: () => void
  onDeleteAllChats: () => void
  onDeleteAllQr: () => void
}) {
  const [tab, setTab] = useState<'chats' | 'qr'>('chats')
  const scanInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {visible && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 z-50 h-full bg-surface shadow-[4px_0_16px_rgba(0,0,0,0.35)]
        flex flex-col overflow-hidden transition-[transform,width] duration-200
        lg:relative
        ${visible ? 'translate-x-0 w-[260px]' : '-translate-x-full w-[260px]'}
        ${collapsed ? 'lg:w-0 lg:translate-x-0' : 'lg:w-[260px] lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-3 py-3 shrink-0 min-w-[260px]">
          <div className="flex items-center gap-2.5">
            <AppIcon />
            <span className="text-sm font-medium text-fg whitespace-nowrap">Mighty AI QR</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors lg:hidden">
              <CloseIcon />
            </button>
            <button onClick={onCollapse} title="Collapse sidebar" className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          </div>
        </div>

        <div className="flex items-center border-b border-white/10 mx-3">
          {(['chats', 'qr'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-fg-3 hover:text-fg-2'
              }`}
            >
              {t === 'chats' ? 'Chats' : 'QR Codes'}
            </button>
          ))}
          {tab === 'chats' && conversations.length > 0 && (
            <button onClick={onDeleteAllChats} title="Delete all chats" className="ml-1 flex h-7 w-7 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors">
              <TrashIcon />
            </button>
          )}
          {tab === 'qr' && qrHistory.length > 0 && (
            <button onClick={onDeleteAllQr} title="Delete all QR codes" className="ml-1 flex h-7 w-7 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors">
              <TrashIcon />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {tab === 'chats' ? (
            conversations.length === 0
              ? <p className="px-4 py-6 text-center text-xs text-fg-4">No conversations yet</p>
              : conversations.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onSelect={() => { onSelect(conv.id); onClose() }}
                  onDeleteRequest={() => onDeleteRequest(conv.title, () => onDelete(conv.id))}
                  onRename={name => onRenameConv(conv.id, name)}
                />
              ))
          ) : (
            <>
              <input ref={scanInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { onQrImported(f); e.target.value = '' } }} />
              <input ref={importInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { onQrImported(f); e.target.value = '' } }} />
              <div className="px-3 pb-2 flex gap-2">
                <button onClick={() => scanInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                  <CameraIcon /> Scan
                </button>
                <button onClick={() => importInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors">
                  <UploadIcon /> Import
                </button>
              </div>
              {qrHistory.length === 0
                ? <p className="px-4 py-4 text-center text-xs text-fg-4">No QR codes yet</p>
                : qrHistory.map(item => (
                  <QrHistoryItem
                    key={item.id}
                    item={item}
                    onOpen={() => { onQrSelect(item); onClose() }}
                    onDeleteRequest={() => onDeleteRequest(item.presetName, () => onQrDelete(item.id))}
                    onRename={name => onRenameQr(item.id, name)}
                  />
                ))
              }
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function ConvItem({ conv, active, onSelect, onDeleteRequest, onRename }: {
  conv: Conversation; active: boolean; onSelect: () => void; onDeleteRequest: () => void; onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const longPress = useLongPress(() => { setName(conv.title); setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()) })

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== conv.title) onRename(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className={`relative flex items-center px-3 py-2 ${active ? 'bg-surface-2' : ''}`}>
        {active && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 min-w-0 bg-transparent text-xs text-fg outline-none border-b border-primary py-0.5"
        />
      </div>
    )
  }

  return (
    <div
      className={`relative flex items-center px-3 py-2.5 cursor-pointer transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
      onClick={onSelect}
      {...longPress}
    >
      {active && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-fg">{conv.title}</p>
        <p className="text-[10px] text-fg-4">{relativeTime(conv.updatedAt)}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDeleteRequest() }}
        className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition-colors"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

// ─── Suggestion Screen ────────────────────────────────────────────────────────

function SuggestionScreen({ onSend }: { onSend: (text: string) => void }) {
  const [current, setCurrent] = useState<string[]>(ALL_SUGGESTIONS.slice(0, 6))
  useEffect(() => { setCurrent(getRandomSuggestions(6)) }, [])
  const next = () => setCurrent(prev => getRandomSuggestions(6, prev))
  return (
    <div className="flex h-full flex-col justify-end animate-fade-in pb-2 gap-3">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3 text-sm text-fg">
        What tone are you after? Describe an artist, song, genre, or mood and I&apos;ll dial it in.
      </div>
      <div className="flex flex-wrap gap-2">
        {current.map(s => (
          <button key={s} onClick={() => onSend(s)} className="rounded-full border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-fg-3 hover:border-white/20 hover:text-fg transition-colors">{s}</button>
        ))}
      </div>
      <button onClick={next} className="self-start text-[11px] text-fg-4 hover:text-fg-3 transition-colors">
        More suggestions →
      </button>
    </div>
  )
}

// ─── Message Row ──────────────────────────────────────────────────────────────

function MessageRow({ msg, idx, active, onActivate, onDismiss, onEdit, onDelete, onQrOpen, disabled }: {
  msg: ChatMessage
  idx: number
  active: boolean
  onActivate: () => void
  onDismiss: () => void
  onEdit: (idx: number) => void
  onDelete: (idx: number) => void
  onQrOpen: (qr: QrResult, description: string) => void
  disabled?: boolean
}) {
  const longPress = useLongPress(disabled ? () => {} : onActivate)
  const actionsVisible = active && !disabled
  const actionClass = `flex gap-3 transition-opacity duration-150 mb-0.5 ${actionsVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className={`group flex flex-col animate-slide-in-bottom ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      {msg.role === 'user' ? (
        <div className="flex items-end gap-1.5">
          {!disabled && (
            <div className={actionClass} onClick={e => e.stopPropagation()}>
              <button onClick={copy} title="Copy" className="text-fg-4 hover:text-fg-2 transition-colors">
                {copied ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
              </button>
              <button onClick={() => { onEdit(idx); onDismiss() }} title="Edit & resend" className="text-fg-4 hover:text-fg-2 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button onClick={() => { onDelete(idx); onDismiss() }} title="Delete" className="text-fg-4 hover:text-red-400 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          )}
          <div
            {...longPress}
            className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-on-primary select-none"
          >
            {msg.content}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1.5">
            <div
              {...longPress}
              className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3 select-none"
            >
              <div className="prose-ai">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
              <div className="mt-2 flex justify-end">
                <button onClick={copy} title="Copy response" className="text-fg-4 hover:text-fg-2 transition-colors">
                  {copied ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                </button>
              </div>
            </div>
            {!disabled && (
              <div className={actionClass} onClick={e => e.stopPropagation()}>
                <button onClick={copy} title="Copy" className="text-fg-4 hover:text-fg-2 transition-colors">
                  {copied ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                </button>
                <button onClick={() => { onDelete(idx); onDismiss() }} title="Delete" className="text-fg-4 hover:text-red-400 transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            )}
          </div>
          {msg.qr && (
            <div className="mt-2 animate-fade-in space-y-2">
              <button
                onClick={() => onQrOpen(msg.qr!, msg.content)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-3 px-4 py-2 text-sm text-fg hover:bg-[#444] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/>
                  <rect width="5" height="5" x="3" y="16" rx="1"/>
                  <path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/>
                </svg>
                View QR code
              </button>
              {msg.qr.guitar && (msg.qr.guitar.pickup || msg.qr.guitar.pickupType || (msg.qr.guitar.controls?.length ?? 0) > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {(msg.qr.guitar.pickup || msg.qr.guitar.pickupType) && (
                    <span className="rounded-full border border-white/10 bg-surface-2 px-2.5 py-1 text-[11px] text-fg-3">
                      {[msg.qr.guitar.pickup, msg.qr.guitar.pickupType].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {Array.isArray(msg.qr.guitar.controls) && msg.qr.guitar.controls.map(c => (
                    <span key={c.label} className="rounded-full border border-white/10 bg-surface-2 px-2.5 py-1 text-[11px] text-fg-3">
                      {c.label}: {c.value}/10
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentQr, setCurrentQr] = useState<QrResult | null>(null)
  const [currentQrDescription, setCurrentQrDescription] = useState<string>('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showErrorExplain, setShowErrorExplain] = useState(false)
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [qrHistory, setQrHistory] = useState<HistoryItem[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ label: string; onConfirm: () => void } | null>(null)
  const [popupQr, setPopupQr] = useState<{ qr: QrResult; description: string } | null>(null)
  const [showQrPanel, setShowQrPanel] = useState(false)

  const requestDelete = useCallback((label: string, onConfirm: () => void) => {
    setPendingDelete({ label, onConfirm })
  }, [])

  const chatRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const ttsEnabledRef = useRef(false)
  ttsEnabledRef.current = ttsEnabled
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const sendRef = useRef<(text: string) => void>(() => {})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const convs = loadConversations()
    setConversations(convs)
    setQrHistory(loadHistory())
    initAuth().catch(() => {})
    setSuggestions(getRandomSuggestions())
    document.documentElement.dataset.theme = getTheme()
    if (convs.length > 0) {
      const latest = convs[0]
      setActiveConvId(latest.id)
      setMessages(latest.messages)
      setCurrentQr(latest.lastQr)
      const lastQrMsg = [...latest.messages].reverse().find(m => m.qr)
      setCurrentQrDescription(lastQrMsg?.content ?? '')
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    })
  }, [])

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  // Persist conversation — reads from localStorage to avoid stale state
  const persistConversation = useCallback((id: string, msgs: ChatMessage[], lastQr: QrResult | null) => {
    const existing = loadConversations().find(c => c.id === id)
    upsertConversation({
      id,
      title: autoTitle(msgs),
      messages: msgs,
      lastQr,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    setConversations(loadConversations())
  }, [])

  // New chat — just resets UI, conversation only persisted after first message
  const startNewChat = useCallback(() => {
    setActiveConvId(null)
    setMessages([])
    setCurrentQr(null)
    setCurrentQrDescription('')
    setShowQrPanel(false)
    setSuggestions(getRandomSuggestions())
    setError(null)
    setInput('')
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.focus()
      }
    })
  }, [])

  const switchConversation = useCallback((id: string) => {
    const convs = loadConversations()
    const conv = convs.find(c => c.id === id)
    if (!conv) return
    setActiveConvId(id)
    setMessages(conv.messages)
    setCurrentQr(conv.lastQr)
    setShowQrPanel(!!conv.lastQr)
    const lastQrMsg = [...conv.messages].reverse().find(m => m.qr)
    setCurrentQrDescription(lastQrMsg?.content ?? '')
    setError(null)
    setInput('')
  }, [])

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

  const handleDeleteHistoryItem = useCallback((id: string) => {
    deleteHistoryItem(id)
    setQrHistory(prev => prev.filter(i => i.id !== id))
    setSelectedHistoryItem(null)
  }, [])

  const handleEditMsg = useCallback((index: number) => {
    const msg = messages[index]
    setMessages(messages.slice(0, index))
    setInput(msg.content)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
        textareaRef.current.focus()
      }
    })
  }, [messages])

  const handleDeleteMsg = useCallback((index: number) => {
    setMessages(prev => prev.slice(0, index))
  }, [])

  const handleRenameHistoryItem = useCallback((id: string, newName: string) => {
    renameHistoryItem(id, newName)
    setQrHistory(prev => prev.map(i => i.id !== id ? i : { ...i, presetName: newName, qr: { ...i.qr, presetName: newName } }))
    setSelectedHistoryItem(prev => prev?.id !== id ? prev : { ...prev, presetName: newName, qr: { ...prev.qr, presetName: newName } })
  }, [])

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    setConversations(prev => {
      const updated = prev.map(c => c.id !== id ? c : { ...c, title: newTitle, updatedAt: Date.now() })
      const conv = updated.find(c => c.id === id)
      if (conv) upsertConversation(conv)
      return updated
    })
  }, [])

  const refineFromHistoryItem = useCallback((item: HistoryItem) => {
    setSelectedHistoryItem(null)
    setSidebarOpen(false)
    const convId = uuidv4()
    setActiveConvId(convId)
    setCurrentQr(item.qr)
    setError(null)
    setInput('')
    const enabledSettings = item.qr.settings.filter(s => s.enabled)
    const settingsList = enabledSettings.map(s => {
      const paramStr = s.params && Object.keys(s.params).length
        ? ` (${Object.entries(s.params).map(([k, v]) => `${k}: ${v}`).join(', ')})`
        : ''
      return `• ${s.slot}: ${s.selection}${paramStr}`
    }).join('\n')
    const userMsg: ChatMessage = {
      id: uuidv4(), role: 'user',
      content: `I want to refine an existing preset called "${item.qr.presetName}" on my ${item.qr.deviceName}.\n\nCurrent settings:\n${settingsList}`,
    }
    const assistantMsg: ChatMessage = {
      id: uuidv4(), role: 'assistant',
      content: `I can see your "${item.qr.presetName}" preset. What would you like to change about this tone?`,
      qr: item.qr,
    }
    const msgs = [userMsg, assistantMsg]
    setMessages(msgs)
    persistConversation(convId, msgs, item.qr)
    setConversations(loadConversations())
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [persistConversation])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()

    // Assign a conversation ID — create new if needed, but don't persist yet
    let convId = activeConvId
    if (!convId) {
      convId = uuidv4()
      setActiveConvId(convId)
    }

    const userMsg: ChatMessage = { id: uuidv4(), role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    scrollToBottom()

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await sendChat(newMessages.map(({ role, content }) => ({ role, content })), abort.signal)
      const aiMsg: ChatMessage = { id: uuidv4(), role: 'assistant', content: res.message, qr: res.qr }
      if (ttsEnabledRef.current && typeof window !== 'undefined' && window.speechSynthesis) {
        const plain = res.message.replace(/#{1,6} /g, '').replace(/[*_`~>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n+/g, ' ').trim()
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(plain))
      }
      const finalMessages = [...newMessages, aiMsg]
      let newQr = currentQr
      const historyItem = res.qr ? saveToHistory(res.qr) : null
      if (res.qr) newQr = res.qr

      flushSync(() => {
        setMessages(finalMessages)
        if (res.qr) {
          setCurrentQr(res.qr)
          setCurrentQrDescription(res.message)
          setShowQrPanel(true)
          if (historyItem) setQrHistory(prev => [historyItem, ...prev].slice(0, 20))
        }
      })

      persistConversation(convId!, finalMessages, newQr)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') { /* cancelled by user */ }
      else flushSync(() => setError(e instanceof Error ? e.message : 'Something went wrong'))
    } finally {
      abortRef.current = null
      flushSync(() => setLoading(false))
      scrollToBottom()
    }
  }, [loading, messages, activeConvId, currentQr, scrollToBottom, persistConversation])

  sendRef.current = send

  // Force re-render when returning from background — browsers throttle React renders in hidden tabs
  const [, setVisibilityTick] = useState(0)
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') setVisibilityTick(t => t + 1) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    window.speechSynthesis?.cancel()
    const r = new SR()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US'
    r.onstart = () => setIsListening(true)
    r.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((res: any) => res[0].transcript).join('')
      finalTranscriptRef.current = t
      setInput(t)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }
      })
    }
    r.onend = () => {
      setIsListening(false)
      const text = finalTranscriptRef.current.trim()
      finalTranscriptRef.current = ''
      if (text) setTimeout(() => sendRef.current(text), 50)
    }
    r.onerror = () => setIsListening(false)
    recognitionRef.current = r
    r.start()
  }, [isListening])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    resizeTextarea()
  }

  return (
    <div className="flex h-full bg-bg">

      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={switchConversation}
        onNew={startNewChat}
        onDelete={handleDeleteConversation}
        onRenameConv={handleRenameConversation}
        qrHistory={qrHistory}
        onQrSelect={item => { setSelectedHistoryItem(item) }}
        onQrDelete={id => handleDeleteHistoryItem(id)}
        onRenameQr={handleRenameHistoryItem}
        onDeleteRequest={requestDelete}
        visible={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onCollapse={() => setSidebarCollapsed(true)}
        onQrImported={async (file) => {
          const bitmap = await createImageBitmap(file)
          const [scanned, importNote] = await Promise.all([
            decodeQrFromFile(file),
            ocrImageText(bitmap),
          ])
          if (!scanned) return
          const decoded = await decodeQr(scanned.qrString)
          if (!decoded) return
          const qr: QrResult = {
            qrString: scanned.qrString,
            imageBase64: scanned.imageBase64,
            presetName: decoded.presetName,
            deviceName: decoded.deviceName,
            settings: decoded.settings,
            importNote: importNote || undefined,
          }
          const item = saveToHistory(qr)
          setQrHistory(prev => [item, ...prev].slice(0, 20))
          setSelectedHistoryItem(item)
          setSidebarOpen(false)
        }}
        onSettings={() => setShowSettings(true)}
        onDeleteAllChats={() => requestDelete('all conversations', () => {
          clearAllConversations()
          setConversations([])
          setActiveConvId(null)
          setMessages([])
          setCurrentQr(null)
          setCurrentQrDescription('')
        })}
        onDeleteAllQr={() => requestDelete('all QR codes', () => {
          clearAllHistory()
          setQrHistory([])
          setSelectedHistoryItem(null)
        })}
      />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.25)]">

          {/* ── Desktop: flex row, title left · model centre (absolute) · buttons right ── */}
          <div className="hidden md:flex md:items-center relative px-4 py-2.5">
            <div className="flex items-center gap-3">
              <button onClick={() => { sidebarCollapsed ? setSidebarCollapsed(false) : (window.innerWidth >= 1024 ? setSidebarCollapsed(true) : setSidebarOpen(true)) }} className="text-fg-3 hover:text-fg transition-colors"><MenuIcon /></button>
              <button onClick={startNewChat} className="text-sm font-semibold text-fg hover:text-fg-2 transition-colors">Mighty AI QR</button>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2">
              <HeaderModelPill settingsVersion={settingsVersion} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {activeConvId && (
                <button onClick={() => { handleDeleteConversation(activeConvId); startNewChat() }} title="Delete conversation" className="flex items-center justify-center h-8 w-8 rounded-xl text-fg-4 hover:text-red-400 transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              )}
              <button onClick={startNewChat} title="New chat" className="flex items-center justify-center h-8 w-8 rounded-xl bg-surface-2 border border-white/10 text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"><NewChatIcon /></button>
              <button onClick={() => setShowSettings(true)} title="Settings" className="flex items-center justify-center h-8 w-8 rounded-lg text-fg-3 hover:text-fg transition-colors"><GearIcon /></button>
            </div>
          </div>

          {/* ── Mobile: row 1 title + buttons, row 2 full-width model ── */}
          <div className="md:hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                <button onClick={() => setSidebarOpen(true)} className="text-fg-3 hover:text-fg transition-colors"><MenuIcon /></button>
                <button onClick={startNewChat} className="text-sm font-semibold text-fg hover:text-fg-2 transition-colors">Mighty AI QR</button>
              </div>
              <div className="flex items-center gap-2">
                {activeConvId && (
                  <button onClick={() => { handleDeleteConversation(activeConvId); startNewChat() }} title="Delete conversation" className="flex items-center justify-center h-9 w-9 rounded-xl text-fg-4 hover:text-red-400 transition-colors">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                )}
                <button onClick={startNewChat} title="New chat" className="flex items-center justify-center h-9 w-9 rounded-xl bg-surface-2 border border-white/10 text-fg-2 hover:bg-surface-3 hover:text-fg transition-colors"><NewChatIcon /></button>
                <button onClick={() => setShowSettings(true)} title="Settings" className="flex items-center justify-center h-8 w-8 rounded-lg text-fg-3 hover:text-fg transition-colors"><GearIcon /></button>
              </div>
            </div>
            <div className="border-t border-white/10 px-4 py-2">
              <ModelBar settingsVersion={settingsVersion} inline />
            </div>
          </div>

        </header>

        {/* Chat + QR */}
        <div className="flex flex-1 overflow-hidden">

          {/* Chat */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-6" onClick={() => setActiveMessageId(null)}>
              <div className="mx-auto w-full max-w-2xl space-y-4">
              {messages.length === 0 && input.trim() ? (
                <div className="flex h-full flex-col items-center justify-center animate-fade-in">
                  <p className="text-sm text-fg-4">Edit your message below and send to continue from here.</p>
                </div>
              ) : messages.length === 0 ? (
                <SuggestionScreen onSend={send} />
              ) : (
                messages.map((msg, idx) => (
                  <MessageRow
                    key={msg.id}
                    msg={msg}
                    idx={idx}
                    active={activeMessageId === msg.id}
                    onActivate={() => setActiveMessageId(msg.id)}
                    onDismiss={() => setActiveMessageId(null)}
                    onEdit={handleEditMsg}
                    onDelete={handleDeleteMsg}
                    onQrOpen={(qr, description) => setPopupQr({ qr, description })}
                    disabled={loading}
                  />
                ))
              )}
              {loading && (
                <div className="flex justify-start animate-slide-in-bottom">
                  <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map(i => <div key={i} className="typing-dot h-2 w-2 rounded-full bg-fg-3" />)}
                      <span className="ml-2 text-xs text-fg-3">Generating tone…</span>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>

            {error && (
              <div className="relative mx-4 mb-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-2.5 pr-8">
                <button onClick={() => setError(null)} className="absolute top-2.5 right-2.5 text-red-600 hover:text-fg-2"><CloseIcon /></button>
                <span className="text-sm text-red-400">{error}</span>
                {getErrorExplanation(error) && (
                  <button
                    onClick={() => setShowErrorExplain(true)}
                    className="mt-1 block text-[11px] text-red-500/70 hover:text-red-400 underline underline-offset-2"
                  >
                    What does this mean?
                  </button>
                )}
              </div>
            )}

            <div className="border-t border-white/10 bg-surface px-4 pb-5 pt-3">
              <div className="rounded-3xl border border-white/10 bg-surface-2 transition-colors focus-within:border-primary/40">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  placeholder="Describe your tone…"
                  rows={1}
                  className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm text-fg placeholder-fg-4 outline-none disabled:opacity-50"
                  style={{ maxHeight: '120px', overflowY: 'auto' }}
                />
                <div className="flex items-center justify-between px-3 pb-3">
                  <button
                    onClick={() => setTtsEnabled(v => { if (v) window.speechSynthesis?.cancel(); return !v })}
                    title={ttsEnabled ? 'TTS on — click to disable' : 'TTS off — click to enable'}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${ttsEnabled ? 'text-primary hover:opacity-80' : 'text-fg-4 hover:text-fg-3'}`}
                  >
                    {ttsEnabled ? <VolumeIcon /> : <VolumeOffIcon />}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={toggleListening}
                      title={isListening ? 'Stop recording' : 'Voice input'}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${isListening ? 'text-red-400 bg-red-500/10 animate-pulse' : 'text-fg-4 hover:text-fg-3'}`}
                    >
                      <MicIcon />
                    </button>
                    {loading ? (
                      <button
                        onClick={() => { abortRef.current?.abort(); setLoading(false) }}
                        title="Cancel"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary hover:opacity-90 transition-colors"
                      >
                        <StopIcon />
                      </button>
                    ) : (
                      <button
                        onClick={() => send(input)}
                        disabled={!input.trim()}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <SendIcon />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* QR Panel — desktop */}
          {showQrPanel && currentQr && (
            <div className="hidden w-[360px] shrink-0 flex-col overflow-y-auto bg-bg p-5 lg:flex border-l border-white/5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-4">QR Code</p>
                <button onClick={() => setShowQrPanel(false)} title="Close" className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              </div>
              <div className="animate-fade-in">
                <QrCard qr={currentQr} description={currentQrDescription} />
              </div>
            </div>
          )}

        </div>
      </div>

      {popupQr && (
        <ChatQrModal qr={popupQr.qr} description={popupQr.description} onClose={() => { setPopupQr(null); requestAnimationFrame(() => { scrollToBottom(); textareaRef.current?.focus() }) }} onRefine={() => { setPopupQr(null); requestAnimationFrame(() => textareaRef.current?.focus()) }} />
      )}

      {showSettings && <SettingsPanel onClose={() => { setShowSettings(false); setSettingsVersion(v => v + 1) }} />}

      {showErrorExplain && error && (
        <ErrorExplainModal error={error} onClose={() => setShowErrorExplain(false)} />
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          label={pendingDelete.label}
          onConfirm={() => { pendingDelete.onConfirm(); setPendingDelete(null) }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {selectedHistoryItem && (
        <QrModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
          onDeleteRequest={() => requestDelete(selectedHistoryItem.presetName, () => handleDeleteHistoryItem(selectedHistoryItem.id))}
          onRename={name => handleRenameHistoryItem(selectedHistoryItem.id, name)}
          onRefine={() => refineFromHistoryItem(selectedHistoryItem)}
        />
      )}
    </div>
  )
}
