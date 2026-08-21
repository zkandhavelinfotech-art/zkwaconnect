import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor:         '#075E54',
  colorScheme:        'light',
  width:              'device-width',
  initialScale:       1,
}

export const metadata: Metadata = {
  title: {
    default:  'ZKWAConnect — WhatsApp Business API Platform',
    template: '%s | ZKWAConnect',
  },
  description:
    'ZKWAConnect is a full-stack WhatsApp Business API SaaS platform — ' +
    'campaigns, live inbox, lead pipeline, GST billing and automation flows. ' +
    'By ZKandhavel Infotech Pvt. Ltd.',
  keywords: [
    'WhatsApp Business API', 'WABA', 'ZKWAConnect', 'WhatsApp SaaS',
    'WhatsApp campaigns', 'WhatsApp automation', 'ZKandhavel Infotech',
    'WhatsApp CRM India', 'GST billing', 'lead management',
  ],
  authors:  [{ name: 'ZKandhavel Infotech Pvt. Ltd.', url: 'https://zkwaconnect.in' }],
  creator:  'ZKandhavel Infotech Pvt. Ltd.',
  publisher:'ZKandhavel Infotech Pvt. Ltd.',

  // ── Icons ────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.ico',                             sizes: 'any',    type: 'image/x-icon' },
      { url: '/icons/zkwaconnect-icon-48.png',           sizes: '48x48',  type: 'image/png' },
      { url: '/icons/zkwaconnect-icon-96.png',           sizes: '96x96',  type: 'image/png' },
      { url: '/icons/zkwaconnect-icon-192.png',          sizes: '192x192',type: 'image/png' },
    ],
    apple: [
      { url: '/icons/zkwaconnect-icon-192.png',          sizes: '192x192' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/zkwaconnect-icon-master.svg', color: '#075E54' },
    ],
  },

  // ── PWA manifest ─────────────────────────────────────────────
  manifest: '/icons/manifest.webmanifest',

  // ── Open Graph ───────────────────────────────────────────────
  openGraph: {
    type:        'website',
    locale:      'en_IN',
    url:         'https://app.zkwaconnect.in',
    siteName:    'ZKWAConnect',
    title:       'ZKWAConnect — WhatsApp Business API Platform',
    description: 'Full-stack WhatsApp Business SaaS — campaigns, live inbox, leads, billing.',
    images: [{
      url:    '/icons/zkwaconnect-icon-512.png',
      width:  512,
      height: 512,
      alt:    'ZKWAConnect logo',
    }],
  },

  // ── Twitter / X card ─────────────────────────────────────────
  twitter: {
    card:        'summary',
    title:       'ZKWAConnect — WhatsApp Business API Platform',
    description: 'Full-stack WhatsApp Business SaaS by ZKandhavel Infotech.',
    images:      ['/icons/zkwaconnect-icon-512.png'],
  },

  // ── Other ────────────────────────────────────────────────────
  robots:           { index: false, follow: false }, // private SaaS — no indexing
  applicationName:  'ZKWAConnect',
  category:         'business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preload brand icon */}
        <link rel="preload" href="/icons/zkwaconnect-icon-192.png" as="image" type="image/png"/>
        {/* MS tile */}
        <meta name="msapplication-TileImage"  content="/icons/zkwaconnect-icon-144.png"/>
        <meta name="msapplication-TileColor"  content="#075E54"/>
        <meta name="msapplication-config"     content="none"/>
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
