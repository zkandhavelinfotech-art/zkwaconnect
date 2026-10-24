"use client"
import { useEffect, useState } from "react"
import { UpiAppButtons, type UpiLink } from "@/components/payments/UpiAppButtons"

export function PayActions({ token, upiId, links, qr, submitted }: { token: string; upiId: string; links: UpiLink[]; qr: string | null; submitted: boolean }) {
  const [utr, setUtr] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(submitted ? { ok: true, text: "We've received your UTR. The business will confirm your payment shortly." } : null)
  const [mobile, setMobile] = useState(true)
  useEffect(() => { setMobile(/android|iphone|ipad|ipod/i.test(navigator.userAgent)) }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(`/api/public/pay/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ utr }) })
      const body = await response.json()
      setMessage(response.ok ? { ok: true, text: body.message } : { ok: false, text: body.error })
    } catch { setMessage({ ok: false, text: "Network error. Please try again." }) }
    setBusy(false)
  }

  return <div style={{ marginTop: 18 }}>
    {mobile && <><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>1. Pay with your UPI app</div><UpiAppButtons links={links} /></>}
    {qr && <div style={{ textAlign: "center", marginTop: mobile ? 16 : 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, textAlign: "left" }}>{mobile ? "Or scan from another phone" : "1. Scan with any UPI app"}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="UPI QR code" width={200} height={200} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 6 }} />
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>UPI ID: <strong>{upiId}</strong>{" "}
        <button type="button" onClick={() => navigator.clipboard?.writeText(upiId)} style={{ border: 0, background: "none", color: "#075e54", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Copy</button></div>
    </div>}
    <form onSubmit={submit} style={{ marginTop: 18, borderTop: "1px solid #eef2f1", paddingTop: 16 }}>
      <label htmlFor="utr" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>2. After paying, enter the UTR / UPI reference</label>
      <input id="utr" inputMode="numeric" autoComplete="off" required value={utr} onChange={event => setUtr(event.target.value)} placeholder="12-digit number, e.g. 429183746512"
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1.5px solid #cbd5e1", borderRadius: 8, fontSize: 15, fontFamily: "monospace" }} />
      <div style={{ fontSize: 11, color: "#64748b", margin: "6px 0 10px" }}>Find it in your UPI app under the payment&apos;s details (UTR, UPI Ref No. or Transaction ID).</div>
      <button type="submit" disabled={busy} style={{ width: "100%", border: 0, borderRadius: 10, padding: 13, background: "#075e54", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? .7 : 1 }}>
        {busy ? "Sending…" : "I've paid — submit UTR"}</button>
      {message && <div role={message.ok ? "status" : "alert"} style={{ marginTop: 10, padding: 11, borderRadius: 8, fontSize: 13, background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</div>}
    </form>
  </div>
}
