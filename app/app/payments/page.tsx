"use client"
import { useEffect, useState } from "react"
import { PaymentAccounts } from "@/components/payments/PaymentAccounts"

type Contact = { id: string; name: string | null; phone: string; email: string | null }
type Payment = { id: string; amount: number | string; description: string | null; method: string; status: string; paymentLinkUrl: string | null; utr: string | null
  submittedAt: string | null; createdAt: string; contact: { name: string | null; phone: string } | null }
type Data = { contacts: Contact[]; payments: Payment[]; providers: { UPI: boolean; RAZORPAY: boolean; CASHFREE: boolean; WHATSAPP_PAY: boolean }; awaiting: number }

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 42, padding: "9px 11px", border: "1px solid #cbd5d3", borderRadius: 6, fontSize: 13, background: "#fff" }
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }
const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#526763", marginBottom: 6 }
const primary: React.CSSProperties = { border: 0, borderRadius: 6, padding: "10px 14px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }
const STATUS: Record<string, [string, string]> = { PENDING: ["Waiting", "#b45309"], APPROVED: ["Paid", "#15803d"], REJECTED: ["Rejected", "#b91c1c"], FAILED: ["Failed", "#b91c1c"], REFUNDED: ["Refunded", "#475569"] }

export default function WhatsAppPaymentsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState({ contactId: "", amount: "", description: "", method: "UPI" as "UPI" | "RAZORPAY" | "CASHFREE" | "WHATSAPP_PAY", orderId: "" })
  const [link, setLink] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function load() {
    const response = await fetch("/api/whatsapp/payments")
    const body = await response.json()
    if (!response.ok) { setError(body.error || "Could not load payments."); return }
    setData(body)
    if (!body.providers[form.method]) setForm(current => ({ ...current, method: (["UPI", "WHATSAPP_PAY", "RAZORPAY", "CASHFREE"] as const).find(key => body.providers[key]) || "UPI" }))
  }
  useEffect(() => {
    load()
    // Pre-fill from an order ("Payment link" on Commerce → Orders).
    const query = new URLSearchParams(window.location.search)
    setForm(current => ({ ...current, contactId: query.get("contact") || "", amount: query.get("amount") || "", description: query.get("description") || "", orderId: query.get("order") || "" }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function call(method: string, body: unknown) {
    setError(""); setNotice("")
    const response = await fetch("/api/whatsapp/payments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) { setError(result.error || "Request failed."); return null }
    setNotice(result.message); load()
    return result
  }

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy("create"); setLink("")
    const result = await call("POST", { contactId: form.contactId, amount: Number(form.amount), description: form.description, method: form.method, ...(form.orderId ? { orderId: form.orderId } : {}) })
    if (result) setLink(result.linkUrl)
    setBusy("")
  }
  async function review(id: string, action: "confirm" | "reject") {
    const reason = action === "reject" ? window.prompt("Reason (sent to the customer):", "Payment not received in our account") : undefined
    if (action === "reject" && reason === null) return
    setBusy(id); await call("PATCH", { id, action, reason: reason || undefined }); setBusy("")
  }

  const awaiting = data?.payments.filter(payment => payment.status === "PENDING" && payment.utr) || []
  const anyProvider = data && Object.values(data.providers).some(Boolean)

  return <div>
    <div style={{ marginBottom: 20 }}><h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Payments</h1>
      <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Collect money from your customers on WhatsApp, straight into your own UPI or gateway account.</p></div>
    {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

    {awaiting.length > 0 && <section style={{ ...card, borderColor: "#fcd34d", background: "#fffbeb", marginBottom: 16 }}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 4px" }}>🔎 Check {awaiting.length} UPI payment{awaiting.length === 1 ? "" : "s"}</h2>
      <p style={{ fontSize: 12, color: "#92400e", margin: "0 0 10px" }}>The customer says they paid. Find the UTR in your bank / UPI app, then confirm. Confirming marks the order paid and thanks the customer on WhatsApp.</p>
      {awaiting.map(payment => <div key={payment.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid #fde68a", fontSize: 13 }}>
        <strong>₹{Number(payment.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
        <span>{payment.contact?.name || payment.contact?.phone}</span><span style={{ color: "#64748b" }}>{payment.description}</span>
        <span>UTR <code style={{ fontSize: 13 }}>{payment.utr}</code></span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" disabled={busy === payment.id} onClick={() => review(payment.id, "confirm")} style={{ ...primary, background: "#15803d" }}>Confirm received</button>
          <button type="button" disabled={busy === payment.id} onClick={() => review(payment.id, "reject")} style={{ ...primary, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" }}>Not received</button>
        </span>
      </div>)}
    </section>}

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16, alignItems: "start" }}>
      <form onSubmit={create} style={card}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 15px", color: "#183633" }}>New payment request</h2>
        <label style={{ display: "block", marginBottom: 12 }}><span style={label}>Contact</span>
          <select required value={form.contactId} onChange={event => setForm({ ...form, contactId: event.target.value })} style={field}>
            <option value="">Select contact</option>{data?.contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name || contact.phone} · {contact.phone}</option>)}
          </select></label>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,.6fr) minmax(150px,1fr)", gap: 11 }}>
          <label><span style={label}>Amount (₹)</span><input required type="number" min="1" max="1000000" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} style={field} /></label>
          <label><span style={label}>For</span><input required minLength={3} maxLength={180} value={form.description} placeholder="Order #1024" onChange={event => setForm({ ...form, description: event.target.value })} style={field} /></label>
        </div>
        <label style={{ display: "block", marginTop: 12 }}><span style={label}>Collect with</span>
          <select value={form.method} onChange={event => setForm({ ...form, method: event.target.value as typeof form.method })} style={field}>
            <option value="UPI" disabled={!data?.providers.UPI}>UPI — GPay / PhonePe / Paytm / QR (you confirm the UTR){data?.providers.UPI ? "" : " — add your UPI ID below"}</option>
            <option value="WHATSAPP_PAY" disabled={!data?.providers.WHATSAPP_PAY}>WhatsApp Pay — &quot;Review and pay&quot; inside the chat, confirmed automatically{data?.providers.WHATSAPP_PAY ? "" : " — set up below"}</option>
            <option value="RAZORPAY" disabled={!data?.providers.RAZORPAY}>Razorpay link — confirmed automatically{data?.providers.RAZORPAY ? "" : " — connect below"}</option>
            <option value="CASHFREE" disabled={!data?.providers.CASHFREE}>Cashfree link — confirmed automatically{data?.providers.CASHFREE ? "" : " — connect below"}</option>
          </select></label>
        <p style={{ fontSize: 11, color: "#71817e", lineHeight: 1.5, margin: "10px 0 0" }}>The customer gets a link on WhatsApp. UPI opens a page with Google Pay, PhonePe, Paytm and QR; they enter the UTR after paying and you confirm it here.</p>
        <button type="submit" disabled={busy === "create" || !anyProvider} style={{ ...primary, marginTop: 14, opacity: anyProvider ? 1 : .6 }}>{busy === "create" ? "Sending…" : "Send payment request"}</button>
        {link && <div style={{ marginTop: 12, fontSize: 12, wordBreak: "break-all" }}>Link: <a href={link} target="_blank" rel="noreferrer" style={{ color: "#087763", fontWeight: 700 }}>{link}</a>{" "}
          <button type="button" onClick={() => navigator.clipboard?.writeText(link)} style={{ border: "1px solid #cbd5d3", borderRadius: 5, padding: "3px 8px", background: "#fff", fontSize: 11, cursor: "pointer" }}>Copy</button></div>}
      </form>
      <PaymentAccounts onChange={load} />
    </section>

    <section style={{ ...card, padding: 0, overflow: "hidden", marginTop: 18 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #e8efee" }}><h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: 0, color: "#183633" }}>Recent requests</h2></div>
      {data?.payments.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
        <thead style={{ background: "#f7faf9", color: "#647b77" }}><tr>{["Date", "Contact", "For", "Method", "Amount", "UTR", "Status", ""].map(text => <th key={text} style={{ padding: 11, fontWeight: 600 }}>{text}</th>)}</tr></thead>
        <tbody>{data.payments.map(payment => { const [text, color] = STATUS[payment.status] || [payment.status, "#475569"]
          return <tr key={payment.id} style={{ borderTop: "1px solid #edf1f0" }}>
            <td style={{ padding: 11 }}>{new Date(payment.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
            <td style={{ padding: 11 }}>{payment.contact?.name || payment.contact?.phone || "-"}</td><td style={{ padding: 11 }}>{payment.description || "-"}</td>
            <td style={{ padding: 11 }}>{payment.method}</td><td style={{ padding: 11 }}>₹{Number(payment.amount).toFixed(2)}</td>
            <td style={{ padding: 11, fontFamily: "monospace" }}>{payment.utr || "-"}</td>
            <td style={{ padding: 11, color, fontWeight: 700 }}>{payment.status === "PENDING" && payment.utr ? "Check UTR" : text}</td>
            <td style={{ padding: 11 }}>{payment.paymentLinkUrl ? <a href={payment.paymentLinkUrl} target="_blank" rel="noreferrer" style={{ color: "#087763" }}>Open</a> : "-"}</td>
          </tr> })}</tbody></table></div> : <div style={{ padding: 18, fontSize: 12, color: "#71817e" }}>No payment requests yet.</div>}
    </section>
  </div>
}
