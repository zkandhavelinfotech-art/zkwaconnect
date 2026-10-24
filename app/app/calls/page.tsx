"use client"
import { useEffect, useState } from "react"

type Number_ = { id: string; phoneNumber: string; displayName: string | null; callingEnabled: boolean; messagingLimit: string | null }
type LogRow = { id: string; direction: string; status: string; durationSeconds: number | null; createdAt: string; error: string | null; agent: string | null
  contact: { id: string; name: string | null; phone: string; callPermission: string | null; callPermissionUntil: string | null } | null }
type Contact = { id: string; name: string | null; phone: string }
type Permission = { status: string; until: string | null; canRequest: boolean; canCall: boolean }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }
const btn = (bg = "#075e54", color = "#fff"): React.CSSProperties => ({ border: bg === "#fff" ? "1px solid #cbd5d3" : 0, borderRadius: 6, padding: "8px 12px", background: bg, color, fontSize: 12, fontWeight: 700, cursor: "pointer" })
const STATUS: Record<string, [string, string]> = { ENDED: ["Completed", "#15803d"], ANSWERED: ["Live", "#15803d"], RINGING: ["Ringing", "#b45309"], MISSED: ["Missed", "#b91c1c"],
  REJECTED: ["Declined", "#b91c1c"], NO_ANSWER: ["No answer", "#b45309"], CANCELLED: ["Cancelled", "#64748b"], FAILED: ["Failed", "#b91c1c"] }

export default function CallsPage() {
  const [numbers, setNumbers] = useState<Number_[]>([])
  const [log, setLog] = useState<LogRow[]>([])
  const [query, setQuery] = useState("")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [picked, setPicked] = useState<Contact | null>(null)
  const [permission, setPermission] = useState<Permission | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState("")

  async function load() {
    const [settings, calls] = await Promise.all([fetch("/api/calls/settings"), fetch("/api/calls")])
    if (settings.ok) setNumbers((await settings.json()).numbers)
    const body = await calls.json()
    if (calls.ok) setLog(body.log); else setError(body.error)
  }
  useEffect(() => {
    load()
    // Opened from the inbox's 📞 button: pre-select that customer.
    const contactId = new URLSearchParams(window.location.search).get("contact")
    if (contactId) fetch(`/api/calls?permission=${contactId}`).then(async response => { const body = await response.json(); if (response.ok) { setPicked(body.contact); setPermission(body) } else setError(body.error) }).catch(() => null)
    const timer = setInterval(load, 15000); return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (query.trim().length < 2) { setContacts([]); return }
    const timer = setTimeout(() => fetch(`/api/contacts?q=${encodeURIComponent(query.trim())}`).then(response => response.json()).then(body => setContacts((body.contacts || []).filter((contact: Contact) => !contact.phone.startsWith("ig:")).slice(0, 8))).catch(() => null), 300)
    return () => clearTimeout(timer)
  }, [query])

  async function toggle(number: Number_) {
    setBusy(number.id); setError(""); setNotice("")
    const response = await fetch("/api/calls/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumberId: number.id, enabled: !number.callingEnabled }) })
    const body = await response.json()
    if (response.ok) { setNotice(body.message); load() } else setError(body.error)
    setBusy("")
  }
  async function pick(contact: Contact) {
    setPicked(contact); setPermission(null); setContacts([]); setQuery(""); setError("")
    const response = await fetch(`/api/calls?permission=${contact.id}`)
    const body = await response.json()
    if (response.ok) setPermission(body); else setError(body.error)
  }
  async function requestPermission() {
    if (!picked) return
    setBusy("permission"); setError(""); setNotice("")
    const response = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "permission", contactId: picked.id }) })
    const body = await response.json()
    if (response.ok) setNotice(body.message); else setError(body.error)
    setBusy("")
  }
  const call = (contact: { id: string; name: string | null; phone: string }) =>
    window.dispatchEvent(new CustomEvent("zk:call", { detail: { contactId: contact.id, name: contact.name || `+${contact.phone}` } }))

  const anyEnabled = numbers.some(number => number.callingEnabled)
  const allowed = permission && (permission.status === "temporary" || permission.status === "permanent")

  return <div>
    <div style={{ marginBottom: 20 }}><h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>WhatsApp Calls</h1>
      <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Customers tap the call button in your WhatsApp chat; you answer here in the browser. Call them back once they allow it.</p></div>
    {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16, marginBottom: 16, alignItems: "start" }}>
      <div style={card}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 4px" }}>Calling on your numbers</h2>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>Meta requires a messaging limit of 2,000+ per day. Keep this page or any ZKWAConnect tab open to hear calls ring; allow the microphone when asked.</p>
        {!numbers.length && <div style={{ fontSize: 13, color: "#64748b" }}>Connect a WhatsApp number first.</div>}
        {numbers.map(number => <div key={number.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #eef2f1" }}>
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>{number.displayName || number.phoneNumber}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{number.phoneNumber}{number.messagingLimit ? ` · limit ${number.messagingLimit}` : ""}</div></div>
          <button type="button" disabled={busy === number.id} onClick={() => toggle(number)} style={number.callingEnabled ? btn("#fff", "#b91c1c") : btn()}>
            {busy === number.id ? "…" : number.callingEnabled ? "Turn off" : "Turn on calling"}</button>
        </div>)}
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 4px" }}>Call a customer</h2>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>WhatsApp only lets you call customers who allowed it (7 days, or always). Ask them in the chat first — 1 request a day, 2 a week.</p>
        <input aria-label="Search contacts" placeholder="Search name or number…" value={query} disabled={!anyEnabled} onChange={event => setQuery(event.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #cbd5d3", borderRadius: 6, fontSize: 13 }} />
        {contacts.map(contact => <button key={contact.id} type="button" onClick={() => pick(contact)} style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #f1f5f9", background: "#fff", padding: "8px 4px", fontSize: 13, cursor: "pointer" }}>
          {contact.name || "No name"} · +{contact.phone}</button>)}
        {!anyEnabled && <div style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>Turn on calling for a number first.</div>}
        {picked && <div style={{ marginTop: 12, padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
          <strong>{picked.name || `+${picked.phone}`}</strong>
          <div style={{ color: "#64748b", margin: "4px 0 10px" }}>{!permission ? "Checking permission…" : allowed ? `✅ Allows calls${permission.until ? ` until ${new Date(permission.until).toLocaleDateString("en-IN")}` : " (always)"}` : "Hasn't allowed calls yet"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allowed ? <button type="button" disabled={!permission?.canCall} onClick={() => call(picked)} style={btn("#16a34a")}>{permission?.canCall ? "📞 Call now" : "Daily call limit reached"}</button>
              : permission && <button type="button" disabled={busy === "permission" || !permission.canRequest} onClick={requestPermission} style={btn()}>{permission.canRequest ? "Ask permission to call" : "Request limit reached — try later"}</button>}
          </div>
        </div>}
      </div>
    </section>

    <section style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #e8efee" }}><h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: 0 }}>Call log</h2></div>
      {log.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
        <thead style={{ background: "#f7faf9", color: "#647b77" }}><tr>{["When", "Customer", "Type", "Status", "Duration", "Agent", ""].map(text => <th key={text} style={{ padding: 11, fontWeight: 600 }}>{text}</th>)}</tr></thead>
        <tbody>{log.map(row => { const [text, color] = STATUS[row.status] || [row.status, "#475569"]
          return <tr key={row.id} style={{ borderTop: "1px solid #edf1f0" }}>
            <td style={{ padding: 11 }}>{new Date(row.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
            <td style={{ padding: 11 }}>{row.contact?.name || (row.contact ? `+${row.contact.phone}` : "-")}</td>
            <td style={{ padding: 11 }}>{row.direction === "INBOUND" ? "↙ Incoming" : "↗ Call-back"}</td>
            <td style={{ padding: 11, color, fontWeight: 700 }} title={row.error || undefined}>{text}</td>
            <td style={{ padding: 11 }}>{row.durationSeconds ? `${Math.floor(row.durationSeconds / 60)}m ${row.durationSeconds % 60}s` : "-"}</td>
            <td style={{ padding: 11 }}>{row.agent || "-"}</td>
            <td style={{ padding: 11 }}>{row.contact && (row.status === "MISSED" || row.status === "NO_ANSWER") && <button type="button" onClick={() => pick(row.contact!)} style={btn("#fff", "#075e54")}>Call back</button>}</td>
          </tr> })}</tbody></table></div> : <div style={{ padding: 18, fontSize: 12, color: "#71817e" }}>No calls yet.</div>}
    </section>
  </div>
}
