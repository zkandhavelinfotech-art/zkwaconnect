"use client"
import { useEffect, useState } from "react"
import { CostComparator, type ModeOption } from "./CostComparator"

type Data = {
  mode: string; modeInfo: { label: string; summary: string }; usesWallet: boolean; currency: string; balance: number; minTopup: number; lowBalanceThreshold: number
  ratesNote: string; options: ModeOption[]; usage: Record<"MARKETING" | "UTILITY" | "AUTHENTICATION", number>
  transactions: { id: string; type: string; amount: number; balanceAfter: number; reason: string; category: string | null; createdAt: string }[]
}
type Invoice = { id: string; invoiceNumber: string; total: number | string }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginBottom: 18 }
const money = (value: number, currency: string) => `${currency === "INR" ? "₹" : `${currency} `}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const TYPE: Record<string, [string, string]> = { TOPUP: ["Top-up", "#166534"], DEBIT: ["Message", "#475569"], REFUND: ["Refund", "#0369a1"], ADJUSTMENT: ["Adjustment", "#7c3aed"] }

// Billing → "Messaging costs": the workspace's charging option, wallet + top-up, and the comparison of options.
export function MessagingCosts({ onInvoice, refreshKey }: { onInvoice: (invoice: Invoice) => void; refreshKey: number }) {
  const [data, setData] = useState<Data | null>(null)
  const [amount, setAmount] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch("/api/billing/messaging").then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load messaging costs.")
      setData(body); setAmount(current => Math.max(current, body.minTopup))
    }).catch(reason => setError(reason.message))
  }, [refreshKey])

  async function topUp(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/billing/messaging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create the top-up.")
      onInvoice(body.invoice)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the top-up.") }
    finally { setBusy(false) }
  }

  if (!data) return error ? <section style={card}><div role="alert" style={{ color: "#9f2d22", fontSize: 13 }}>{error}</div></section> : null
  const low = data.usesWallet && data.balance < data.lowBalanceThreshold
  const rows = showAll ? data.transactions : data.transactions.slice(0, 8)

  return <section id="messaging" style={card}>
    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "0 0 4px", color: "#102a2a" }}>💬 Messaging costs</h2>
    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>WhatsApp charges per template message (marketing, utility, authentication). Here&apos;s how your workspace pays for them.</p>
    {error && <div role="alert" style={{ padding: 10, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 12, marginBottom: 18 }}>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Your option</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{data.modeInfo.label}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{data.modeInfo.summary}</div>
        {data.mode === "DIRECT" && <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "#075e54", fontWeight: 700 }}>Add a payment method in WhatsApp Manager ↗</a>}
      </div>
      {data.usesWallet && <div style={{ border: `1px solid ${low ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 8, padding: 14, background: low ? "#fff7f7" : "#fff" }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Wallet balance</div>
        <div style={{ fontFamily: "Sora,sans-serif", fontSize: 26, fontWeight: 800, color: low ? "#b91c1c" : "#075e54", marginTop: 4 }}>{money(data.balance, data.currency)}</div>
        {low && <div style={{ fontSize: 12, color: "#b91c1c" }}>Low balance — broadcasts pause and templates stop when it runs out.</div>}
        <form onSubmit={topUp} style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {[1000, 5000, 10000].map(preset => <button type="button" key={preset} onClick={() => setAmount(Math.max(preset, data.minTopup))} style={{ border: `1px solid ${amount === preset ? "#075e54" : "#cbd5d3"}`,
            borderRadius: 14, background: amount === preset ? "#f0faf6" : "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>{money(preset, data.currency).replace(".00", "")}</button>)}
          <input aria-label="Top-up amount" type="number" min={data.minTopup} step={1} value={amount} onChange={event => setAmount(Math.round(Number(event.target.value) || 0))}
            style={{ width: 100, border: "1px solid #cbd5d3", borderRadius: 6, padding: "6px 8px", fontSize: 13 }} />
          <button type="submit" disabled={busy || amount < data.minTopup} style={{ border: 0, borderRadius: 6, padding: "8px 12px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {busy ? "Creating…" : "Top up with UPI"}</button>
        </form>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Minimum {money(data.minTopup, data.currency).replace(".00", "")} + GST. Credits are added when your payment is approved.</div>
      </div>}
    </div>

    <h3 style={{ fontSize: 13, fontWeight: 800, color: "#183633", margin: "0 0 4px" }}>{data.options.length > 1 ? "Compare options" : "Your monthly estimate"}</h3>
    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Pre-filled with your last 30 days ({data.usage.MARKETING + data.usage.UTILITY + data.usage.AUTHENTICATION} template messages). Change the numbers to try other volumes.{data.ratesNote ? ` ${data.ratesNote}` : ""}</p>
    <CostComparator options={data.options} initial={data.usage} currency={data.currency} current={data.mode} />
    {data.options.length > 1 && <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0" }}>Want a different option? Contact support — your account manager can switch it.</p>}

    {data.usesWallet && <>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: "#183633", margin: "20px 0 8px" }}>Wallet history</h3>
      {data.transactions.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
        <thead style={{ color: "#64748b" }}><tr>{["Date", "Type", "Details", "Amount", "Balance"].map(text => <th key={text} style={{ padding: "6px 8px", fontWeight: 600 }}>{text}</th>)}</tr></thead>
        <tbody>{rows.map(row => { const [label, color] = TYPE[row.type] || [row.type, "#475569"]
          return <tr key={row.id} style={{ borderTop: "1px solid #edf1f0" }}>
            <td style={{ padding: "6px 8px", color: "#64748b", whiteSpace: "nowrap" }}>{new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
            <td style={{ padding: "6px 8px", color, fontWeight: 700 }}>{label}</td>
            <td style={{ padding: "6px 8px" }}>{row.reason}{row.category ? <span style={{ color: "#94a3b8" }}> · {row.category.toLowerCase()}</span> : null}</td>
            <td style={{ padding: "6px 8px", fontWeight: 700, color: row.amount < 0 ? "#b91c1c" : "#166534", whiteSpace: "nowrap" }}>{row.amount > 0 ? "+" : ""}{money(row.amount, data.currency)}</td>
            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{money(row.balanceAfter, data.currency)}</td></tr> })}</tbody></table></div>
        : <p style={{ fontSize: 12, color: "#94a3b8" }}>No wallet activity yet.</p>}
      {data.transactions.length > 8 && <button onClick={() => setShowAll(value => !value)} style={{ border: 0, background: "none", color: "#075e54", fontWeight: 700, fontSize: 12, cursor: "pointer", marginTop: 6 }}>
        {showAll ? "Show less" : `Show all ${data.transactions.length}`}</button>}
    </>}
  </section>
}
