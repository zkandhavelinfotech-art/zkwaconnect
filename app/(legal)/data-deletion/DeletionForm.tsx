"use client"
import { useEffect, useState } from "react"

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 18px", background: "#075e54", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }

export function DeletionForm() {
  const [email, setEmail] = useState("")
  const [details, setDetails] = useState("")
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function check(value: string) {
    const response = await fetch(`/api/public/data-deletion?code=${encodeURIComponent(value.trim())}`)
    const body = await response.json()
    setStatus(response.ok ? { ok: true, text: `${body.code}: ${body.label}` } : { ok: false, text: body.error })
  }
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("code"); if (value) { setCode(value); check(value) } }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(null)
    const response = await fetch("/api/public/data-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, details }) })
    const body = await response.json()
    setMessage(response.ok ? { ok: true, text: body.message } : { ok: false, text: body.error })
    if (response.ok) setCode(body.code)
    setBusy(false)
  }

  const box = (value: { ok: boolean; text: string }) => <div role={value.ok ? "status" : "alert"} style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 14,
    background: value.ok ? "#f0fdf4" : "#fef2f2", color: value.ok ? "#166534" : "#991b1b" }}>{value.text}</div>

  return <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}>
    <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
      <strong>New request</strong>
      <label style={{ display: "block", fontSize: 13, margin: "10px 0 4px" }} htmlFor="del-email">Your email</label>
      <input id="del-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} style={field} />
      <label style={{ display: "block", fontSize: 13, margin: "10px 0 4px" }} htmlFor="del-details">Details (optional): workspace, phone number, business</label>
      <textarea id="del-details" rows={3} maxLength={1000} value={details} onChange={event => setDetails(event.target.value)} style={field} />
      <button type="submit" disabled={busy} style={{ ...button, marginTop: 10 }}>{busy ? "Sending…" : "Request deletion"}</button>
      {message && box(message)}
    </form>
    <form onSubmit={event => { event.preventDefault(); check(code) }} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
      <strong>Check status</strong>
      <label style={{ display: "block", fontSize: 13, margin: "10px 0 4px" }} htmlFor="del-code">Confirmation code</label>
      <input id="del-code" required value={code} onChange={event => setCode(event.target.value)} placeholder="DEL-…" style={{ ...field, fontFamily: "monospace" }} />
      <button type="submit" style={{ ...button, marginTop: 10 }}>Check</button>
      {status && box(status)}
    </form>
  </div>
}
