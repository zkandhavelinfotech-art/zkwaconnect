"use client"
import { useEffect, useState } from "react"

type Account = { provider: string; configurationName: string | null; gateway: string | null; upiId: string | null; payeeName: string | null; keyId: string | null; production: boolean | null; hasSecret: boolean }

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 38, padding: "8px 10px", border: "1px solid #cbd5d3", borderRadius: 6, fontSize: 13 }
const small: React.CSSProperties = { border: 0, borderRadius: 6, padding: "8px 12px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }

// Payments → where customers pay: the business's own UPI ID and (optional) Razorpay / Cashfree accounts.
export function PaymentAccounts({ onChange }: { onChange: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [webhooks, setWebhooks] = useState<Record<string, string>>({})
  const [open, setOpen] = useState("")
  const [form, setForm] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const response = await fetch("/api/whatsapp/payments/accounts")
    const body = await response.json()
    if (response.ok) { setAccounts(body.accounts); setWebhooks(body.webhooks) }
    else setMessage({ ok: false, text: body.error })
  }
  useEffect(() => { load() }, [])
  const get = (provider: string) => accounts.find(account => account.provider === provider)

  function edit(provider: string) {
    const account = get(provider)
    setForm(provider === "UPI" ? { upiId: account?.upiId || "", payeeName: account?.payeeName || "" }
      : provider === "WHATSAPP_PAY" ? { configurationName: account?.configurationName || "", gateway: account?.gateway || "razorpay" } : provider === "RAZORPAY" ? { keyId: account?.keyId || "" } : { clientId: account?.keyId || "", production: account?.production === false ? "no" : "yes" })
    setOpen(provider); setMessage(null)
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    const body = open === "UPI" ? { provider: "UPI", upiId: form.upiId, payeeName: form.payeeName }
      : open === "WHATSAPP_PAY" ? { provider: "WHATSAPP_PAY", configurationName: form.configurationName, gateway: form.gateway || "razorpay" }
      : open === "RAZORPAY" ? { provider: "RAZORPAY", keyId: form.keyId, keySecret: form.keySecret, webhookSecret: form.webhookSecret }
      : { provider: "CASHFREE", clientId: form.clientId, clientSecret: form.clientSecret, webhookSecret: form.webhookSecret, production: form.production !== "no" }
    const response = await fetch("/api/whatsapp/payments/accounts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json()
    setMessage(response.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })
    if (response.ok) { setOpen(""); load(); onChange() }
  }
  async function remove(provider: string) {
    if (!window.confirm("Remove this payment account? New requests can't use it.")) return
    const response = await fetch(`/api/whatsapp/payments/accounts?provider=${provider}`, { method: "DELETE" })
    const result = await response.json()
    setMessage(response.ok ? { ok: true, text: result.message } : { ok: false, text: result.error }); load(); onChange()
  }
  const input = (key: string, placeholder: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <input aria-label={placeholder} placeholder={placeholder} value={form[key] || ""} onChange={event => setForm({ ...form, [key]: event.target.value })} style={field} {...extra} />

  const rows = [
    { provider: "UPI", title: "UPI ID", detail: (a?: Account) => a ? `${a.upiId} · ${a.payeeName}` : "Not added — customers pay to this UPI ID with GPay, PhonePe, Paytm or QR" },
    { provider: "WHATSAPP_PAY", title: "WhatsApp Pay (optional)", detail: (a?: Account) => a ? `${a.configurationName} · ${a.gateway}` : "Customers pay inside the chat (India; needs a gateway linked in WhatsApp Manager)" },
    { provider: "RAZORPAY", title: "Razorpay (optional)", detail: (a?: Account) => a ? `${a.keyId}${a.hasSecret ? "" : " · secret missing"}` : "Cards, netbanking & UPI with automatic confirmation" },
    { provider: "CASHFREE", title: "Cashfree (optional)", detail: (a?: Account) => a ? `${a.keyId} · ${a.production === false ? "test mode" : "live"}` : "Alternative gateway with automatic confirmation" },
  ]

  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 4px", color: "#183633" }}>Payment accounts</h2>
    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>Your customers pay you directly. Use a business / merchant UPI ID for the best success rate.</p>
    {rows.map(row => { const account = get(row.provider)
      return <div key={row.provider} style={{ padding: "10px 0", borderTop: "1px solid #eef2f1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{account ? "✅" : "➕"} {row.title}</div>
            <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-word" }}>{row.detail(account)}</div></div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => edit(row.provider)} style={{ ...small, background: account ? "#fff" : "#075e54", color: account ? "#075e54" : "#fff", border: "1px solid #075e54" }}>{account ? "Edit" : "Add"}</button>
            {account && <button type="button" onClick={() => remove(row.provider)} aria-label={`Remove ${row.title}`} style={{ ...small, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" }}>✕</button>}
          </div>
        </div>
        {open === row.provider && <form onSubmit={save} style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {row.provider === "UPI" && <>{input("upiId", "yourbusiness@okhdfcbank", { required: true })}{input("payeeName", "Name shown to the payer", { required: true, maxLength: 50 })}</>}
          {row.provider === "WHATSAPP_PAY" && <>{input("configurationName", "Payment configuration name (from WhatsApp Manager)", { required: true, maxLength: 60 })}
            <select aria-label="Gateway" value={form.gateway || "razorpay"} onChange={event => setForm({ ...form, gateway: event.target.value })} style={field}>
              {[["razorpay", "Razorpay"], ["payu", "PayU"], ["billdesk", "BillDesk"], ["zaakpay", "Zaakpay"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>WhatsApp Manager → Account tools → <strong>Payment configurations</strong> → add one, link your gateway account and copy its exact name here. Only for Indian WhatsApp numbers; status updates arrive automatically.</div></>}
          {row.provider === "RAZORPAY" && <>{input("keyId", "Key ID (rzp_live_…)", { required: true })}{input("keySecret", account?.hasSecret ? "Key secret (leave blank to keep)" : "Key secret", { type: "password", required: !account?.hasSecret })}
            {input("webhookSecret", account?.hasSecret ? "Webhook secret (leave blank to keep)" : "Webhook secret", { type: "password" })}
            <div style={{ fontSize: 11, color: "#64748b" }}>Razorpay Dashboard → Webhooks → URL <code style={{ wordBreak: "break-all" }}>{webhooks.RAZORPAY}</code>, event <code>payment_link.paid</code>, same secret as above.</div></>}
          {row.provider === "CASHFREE" && <>{input("clientId", "Client ID (App ID)", { required: true })}{input("clientSecret", account?.hasSecret ? "Client secret (leave blank to keep)" : "Client secret", { type: "password", required: !account?.hasSecret })}
            {input("webhookSecret", "Webhook secret (optional — defaults to client secret)", { type: "password" })}
            <select aria-label="Mode" value={form.production || "yes"} onChange={event => setForm({ ...form, production: event.target.value })} style={field}><option value="yes">Live</option><option value="no">Test (sandbox)</option></select>
            <div style={{ fontSize: 11, color: "#64748b" }}>Cashfree → Developers → Webhooks → URL <code style={{ wordBreak: "break-all" }}>{webhooks.CASHFREE}</code></div></>}
          <div style={{ display: "flex", gap: 6 }}><button type="submit" style={small}>Save</button>
            <button type="button" onClick={() => setOpen("")} style={{ ...small, background: "#fff", color: "#475569", border: "1px solid #cbd5d3" }}>Cancel</button></div>
        </form>}
      </div> })}
    {message && <div role={message.ok ? "status" : "alert"} style={{ marginTop: 8, padding: 9, borderRadius: 6, fontSize: 12, background: message.ok ? "#eaf8f1" : "#fff1f0", color: message.ok ? "#176b4b" : "#9f2d22" }}>{message.text}</div>}
  </section>
}
