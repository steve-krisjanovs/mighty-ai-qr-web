import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mighty AI QR',
  description: 'Generate NUX MightyAmp QR codes from natural language tone descriptions',
  manifest: '/manifest.json',
  icons: { apple: '/icons/icon-192.png', icon: '/icons/icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#202124',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  )
}
