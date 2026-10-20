"use client"
import { useEffect, useRef, useState } from "react"

type Item = { id: string; type: string; title: string; message: string; readAt: string | null; metadata: { url?: string } | null; createdAt: string }

// Top-bar bell: trial/plan reminders, payment approvals, broadcast results, new orders and other workspace alerts.
export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  async function load() {
    const response = await fetch("/api/notifications").catch(() => null)
    if (!response?.ok) return
    const body = await response.json()
    setItems(body.items); setUnread(body.unread)
  }
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  async function markRead(id?: string) {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : {}) }).catch(() => null)
    load()
  }

  return <div ref={box} style={{ position: "relative" }}>
    <button type="button" onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} aria-expanded={open}
      style={{ position: "relative", background: "rgba(255,255,255,.12)", border: 0, borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>
      🔔{unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, background: "#ef4444", color: "#fff",
        fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", padding: "0 4px" }}>{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div role="dialog" aria-label="Notifications" style={{ position: "absolute", right: 0, top: 42, width: "min(360px, calc(100vw - 32px))", maxHeight: 440, overflowY: "auto",
      background: "#fff", color: "#0f172a", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.18)", zIndex: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}>
        <strong style={{ fontSize: 14 }}>Notifications</strong>
        {unread > 0 && <button type="button" onClick={() => markRead()} style={{ border: 0, background: "none", color: "#075e54", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Mark all read</button>}
      </div>
      {!items.length && <div style={{ padding: 20, fontSize: 13, color: "#64748b", textAlign: "center" }}>You&apos;re all caught up.</div>}
      {items.map(item => <a key={item.id} href={item.metadata?.url || "#"} onClick={event => { if (!item.metadata?.url) event.preventDefault(); if (!item.readAt) markRead(item.id) }}
        style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid #f1f5f9", textDecoration: "none", color: "inherit", background: item.readAt ? "#fff" : "#f0fdf4" }}>
        <div style={{ fontSize: 13, fontWeight: item.readAt ? 500 : 700 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 3, lineHeight: 1.45 }}>{item.message}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{new Date(item.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
      </a>)}
    </div>}
  </div>
}
