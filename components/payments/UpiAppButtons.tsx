"use client"
import { useEffect, useState } from "react"

export type UpiLink = { app: string; label: string; android: string; ios: string }

const COLORS: Record<string, string> = { gpay: "#1a73e8", phonepe: "#5f259f", paytm: "#00baf2", bhim: "#334155" }

// "Pay with Google Pay / PhonePe / Paytm / other UPI app" buttons (open the app on the phone with the amount filled in).
export function UpiAppButtons({ links }: { links: UpiLink[] }) {
  const [ios, setIos] = useState(false)
  useEffect(() => { setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)) }, [])
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
    {links.map(link => <a key={link.app} href={ios ? link.ios : link.android}
      style={{ display: "block", textAlign: "center", padding: "12px 8px", borderRadius: 10, background: COLORS[link.app] || "#334155", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
      {link.label}</a>)}
  </div>
}
