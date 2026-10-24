"use client"
import { useEffect, useState } from "react"

type Partner = { id: string; name: string; slug: string; status: string; model: "WHOLESALE" | "COMMISSION"; discountPercent: number; commissionPercent: number; walletBalance: number
  customDomain: string | null; domainVerifiedAt: string | null; note: string | null; createdAt: string; clients: number; owners: { name: string; email: string }[]
  ledger: { id: string; type: string; amount: number; description: string; createdAt: string }[] }

const muted = "rgba(255,255,255,.55)"
const panel: React.CSSProperties = { background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 16, marginBottom: 14 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "rgba(255,255,255,.06)", color: "#e2e8f0" }
const btn = (bg = "#25d366", color = "#053d36"): React.CSSProperties => ({ border: 0, borderRadius: 6, padding: "7px 11px", background: bg, color, fontSize: 12, fontWeight: 800, cursor: "pointer" })
const inr = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [money, setMoney] = useState<Record<string, { amount: string; note: string }>>({})

  async function load() {
    const response = await fetch("/api/admin/partners")
    const body = await response.json()
    if (response.ok) setPartners(body.partners); else setError(body.error)
  }
  useEffect(() => { load() }, [])

  async function send(method: string, body: unknown) {
    setError(""); setNotice("")
    const response = await fetch("/api/admin/partners", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json()
    if (response.ok) { setNotice(result.message); load() } else setError(result.error)
  }

  return <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", padding: "24px clamp(16px,4vw,40px)", fontFamily: "DM Sans,system-ui,sans-serif" }}>
    <a href="/admin/dashboard" style={{ color: "#86efac", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>← Admin dashboard</a>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, margin: "8px 0 4px" }}>Partners</h1>
    <p style={{ fontSize: 13, color: muted, margin: "0 0 16px" }}>Agencies that run client workspaces under their own brand. <strong>Wholesale</strong>: they prepay a wallet and buy client plans at a discount. <strong>Commission</strong>: clients pay you; the partner earns a share, which you pay out and record here.</p>
    {error && <div role="alert" style={{ padding: 11, background: "rgba(239,68,68,.15)", color: "#fca5a5", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "rgba(34,197,94,.15)", color: "#86efac", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}
    {!partners.length && <div style={panel}>No partner applications yet. Partners apply at <code>/partner</code>.</div>}

    {partners.map(partner => { const m = money[partner.id] || { amount: "", note: "" }
      return <section key={partner.id} style={{ ...panel, borderColor: partner.status === "PENDING" ? "rgba(250,204,21,.5)" : undefined }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <strong style={{ fontSize: 16 }}>{partner.name}</strong><code style={{ color: muted }}>{partner.slug}</code>
          <span style={{ fontSize: 11, border: "1px solid rgba(255,255,255,.3)", borderRadius: 8, padding: "1px 7px" }}>{partner.status}</span>
          <span style={{ color: muted, fontSize: 12 }}>{partner.owners.map(owner => `${owner.name} <${owner.email}>`).join(", ")} · {partner.clients} client{partner.clients === 1 ? "" : "s"} · applied {new Date(partner.createdAt).toLocaleDateString("en-IN")}</span>
        </div>
        {partner.note && <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>“{partner.note}”</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10, fontSize: 13 }}>
          <select aria-label="Programme" value={partner.model} onChange={event => send("PUT", { id: partner.id, model: event.target.value })} style={input}>
            <option value="WHOLESALE">Wholesale</option><option value="COMMISSION">Commission</option></select>
          {partner.model === "WHOLESALE"
            ? <label>Discount % <input type="number" min={0} max={90} defaultValue={partner.discountPercent} onBlur={event => Number(event.target.value) !== partner.discountPercent && send("PUT", { id: partner.id, discountPercent: Number(event.target.value) })} style={{ ...input, width: 70 }} /></label>
            : <label>Commission % <input type="number" min={0} max={90} defaultValue={partner.commissionPercent} onBlur={event => Number(event.target.value) !== partner.commissionPercent && send("PUT", { id: partner.id, commissionPercent: Number(event.target.value) })} style={{ ...input, width: 70 }} /></label>}
          <span>{partner.model === "WHOLESALE" ? "Wallet" : "Owed to partner"}: <strong>{inr(partner.walletBalance)}</strong></span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {partner.status !== "ACTIVE" && <button type="button" onClick={() => send("PUT", { id: partner.id, status: "ACTIVE" })} style={btn()}>{partner.status === "PENDING" ? "Approve" : "Re-activate"}</button>}
            {partner.status === "ACTIVE" && <button type="button" onClick={() => window.confirm(`Suspend ${partner.name}? Their branding stops and they can't add clients.`) && send("PUT", { id: partner.id, status: "SUSPENDED" })} style={btn("transparent", "#fca5a5")}>Suspend</button>}
          </span>
        </div>
        {partner.customDomain && <div style={{ fontSize: 12, marginTop: 8 }}>Own domain <code>{partner.customDomain}</code>: {partner.domainVerifiedAt ? "✅ DNS verified" : "⏳ DNS not verified yet"} — add it as a custom domain on Railway so it gets HTTPS.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <input type="number" placeholder="₹ amount" aria-label="Amount" value={m.amount} onChange={event => setMoney({ ...money, [partner.id]: { ...m, amount: event.target.value } })} style={{ ...input, width: 110 }} />
          <input placeholder="Note (UTR, reason…)" aria-label="Note" value={m.note} onChange={event => setMoney({ ...money, [partner.id]: { ...m, note: event.target.value } })} style={{ ...input, flex: "1 1 200px" }} />
          {partner.model === "COMMISSION" && <button type="button" onClick={() => send("POST", { id: partner.id, type: "PAYOUT", amount: Number(m.amount), note: m.note })} style={btn()}>Record payout</button>}
          <button type="button" onClick={() => send("POST", { id: partner.id, type: "ADJUSTMENT", amount: Number(m.amount), note: m.note })} style={btn("transparent", "#e2e8f0")}>Adjust balance (±)</button>
        </div>
        {!!partner.ledger.length && <details style={{ marginTop: 8, fontSize: 12 }}><summary style={{ cursor: "pointer", color: muted }}>Recent money movements</summary>
          {partner.ledger.map(row => <div key={row.id} style={{ padding: "3px 0" }}>{new Date(row.createdAt).toLocaleDateString("en-IN")} · {row.type} · <strong style={{ color: row.amount < 0 ? "#fca5a5" : "#86efac" }}>{inr(row.amount)}</strong> · {row.description}</div>)}
        </details>}
      </section> })}
  </div>
}
