import type { Metadata, Viewport } from 'next'
import { Montserrat } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Rowly Studios',
  description: 'Rowly Studios talent and client portal',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RS App',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

// Viewport is emitted manually in <head> below so we can add
// `interactive-widget=resizes-content` (not yet in Next's Viewport type).
// Only themeColor goes through Next's helper.
export const viewport: Viewport = {
  themeColor: '#1A3C6B',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={montserrat.variable}>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RS App" />
        <meta name="theme-color" content="#1A3C6B" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
