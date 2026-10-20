import type { Metadata, Viewport } from "next"
import "./globals.css"

export const viewport: Viewport = {
  themeColor:   "#075E54",
  colorScheme:  "light",
  width:        "device-width",
  initialScale: 1,
}

export const metadata: Metadata = {
  title: {
    default:  "ZKWAConnect — WhatsApp Business API Platform",
    template: "%s | ZKWAConnect",
  },
  description:
    "Multi-tenant WhatsApp Business API SaaS. Live inbox, chatbot automation and bulk campaigns. Built for Indian businesses.",
  applicationName: "ZKWAConnect",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.zkwaconnect.in"
  ),
  icons: {
    icon: [
      { url: "/icons/favicon.ico",             sizes: "any",     type: "image/x-icon" },
      { url: "/icons/zkwaconnect-icon-96.png", sizes: "96x96",   type: "image/png"    },
    ],
    apple: [{ url: "/icons/zkwaconnect-icon-192.png", sizes: "192x192" }],
  },
  manifest: "/icons/manifest.webmanifest",
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="msapplication-TileImage" content="/icons/zkwaconnect-icon-144.png" />
        <meta name="msapplication-TileColor" content="#075E54" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
