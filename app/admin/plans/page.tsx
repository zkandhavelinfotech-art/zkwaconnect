"use client"
import { useEffect, useState } from "react"

type Feature = { key: string; label: string; group: string; description: string }
type Plan = { id: string; slug: string; name: string; description: string | null; monthlyPrice: number; annualPrice: number | null; maxUsers: number | null
  maxPhoneNumbers: number | null; maxMessages: number | null; isPopular: boolean; status: boolean; features: string[]; workspaces: number }

const bg = "#0f172a", muted = "rgba(255,255,255,.5)"
const panel: React.CSSProperties = { background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 18, marginBottom: 16 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, padding: "7px 9px", fontSize: 13, background: "rgba(255,255,255,.06)", color: "#e2e8f0", width: "100%" }
const btn: React.CSSProperties = { border: 0, borderRadius: 6, padding: "9px 14px", background: "#25d366", color: "#053d36", fontSize: 12, fontWeight: 800, cursor: "pointer" }

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [editing, setEditing] = useState<Plan | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [company, setCompany] = useState<{ emails: { email: string; account: { name: string } | null }[]; internal: { id: string; name: string }[] } | null>(null)
  const [emailsText, setEmailsText] = useState("")

  async function load() {
    const response = await fetch("/api/admin/plans")
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setPlans(body.plans); setFeatures(body.features)
  }
  useEffect(() => { load(); loadCompany() }, [])

  async function loadCompany() {
    const response = await fetch("/api/admin/company")
    const body = await response.json()
    if (response.ok) { setCompany(body); setEmailsText(body.emails.map((item: { email: string }) => item.email).join("\n")) }
  }
  async function saveCompany() {
    setError(""); setNotice("")
    const response = await fetch("/api/admin/company", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: emailsText.split(/[\s,;]+/).filter(Boolean) }) })
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setNotice(body.message); loadCompany()
  }

  async function save() {
    if (!editing) return
    setError(""); setNotice("")
    const response = await fetch("/api/admin/plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) })
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setNotice(body.message); setEditing(null); load()
  }
  const set = (patch: Partial<Plan>) => setEditing(current => current && { ...current, ...patch })
  const num = (value: string) => value === "" ? null : Math.max(0, Number(value) || 0)
  const groups = [...new Set(features.map(feature => feature.group))]

  return <div style={{ minHeight: "100vh", background: bg, color: "#e2e8f0", padding: "24px clamp(16px,4vw,40px)", fontFamily: "DM Sans,system-ui,sans-serif" }}>
    <a href="/admin/dashboard" style={{ color: "#86efac", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>← Admin dashboard</a>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, margin: "8px 0 4px" }}>Plans &amp; features</h1>
    <p style={{ fontSize: 13, color: muted, margin: "0 0 18px" }}>What each plan costs, its limits and which features it unlocks. Used by Billing, the dashboard, upgrade prompts, the marketing page and server-side enforcement.</p>
    {error && <div role="alert" style={{ padding: 11, background: "rgba(239,68,68,.15)", color: "#fca5a5", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "rgba(34,197,94,.15)", color: "#86efac", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

    <section style={panel}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>🏢 Company logins (internal)</h2>
      <p style={{ fontSize: 12, color: muted, margin: "0 0 10px" }}>Your own company&apos;s logins. Every project they create is <strong>internal</strong>: all features, no limits, no plan or charges —
        for your company and the clients you manage. Customers who sign up themselves stay on normal plans. One email per line.</p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <div>
          <textarea rows={4} value={emailsText} onChange={event => setEmailsText(event.target.value)} style={{ ...input, fontFamily: "monospace" }} />
          <div style={{ fontSize: 11, color: muted, margin: "4px 0 8px" }}>{company?.emails.map(item => `${item.email}: ${item.account ? "account exists" : "no account yet"}`).join(" · ")}</div>
          <button onClick={saveCompany} style={btn}>Save company logins</button>
        </div>
        <div style={{ fontSize: 12 }}>
          <div style={{ color: muted, marginBottom: 6 }}>Internal workspaces ({company?.internal.length || 0}) — toggle others under Admin dashboard → Tenants</div>
          {company?.internal.map(org => <div key={org.id} style={{ padding: "3px 0" }}>🏢 {org.name}</div>)}
        </div>
      </div>
    </section>

    {!editing ? <section style={{ ...panel, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
        <thead style={{ color: muted, fontSize: 12 }}><tr>{["Plan", "Price / month", "Users", "Numbers", "Messages / mo", "Features", "Workspaces", ""].map(text => <th key={text} style={{ padding: "10px 14px", fontWeight: 600 }}>{text}</th>)}</tr></thead>
        <tbody>{plans.map(plan => <tr key={plan.id} style={{ borderTop: "1px solid rgba(255,255,255,.07)", opacity: plan.status ? 1 : .5 }}>
          <td style={{ padding: "10px 14px", fontWeight: 700 }}>{plan.name}{plan.isPopular ? " ⭐" : ""}{!plan.status && <span style={{ color: "#fca5a5", fontWeight: 400 }}> (hidden)</span>}<div style={{ fontSize: 11, color: muted }}>{plan.slug}</div></td>
          <td style={{ padding: "10px 14px" }}>₹{plan.monthlyPrice.toLocaleString("en-IN")}</td>
          <td style={{ padding: "10px 14px" }}>{plan.maxUsers ?? "∞"}</td><td style={{ padding: "10px 14px" }}>{plan.maxPhoneNumbers ?? "∞"}</td>
          <td style={{ padding: "10px 14px" }}>{plan.maxMessages?.toLocaleString("en-IN") ?? "∞"}</td><td style={{ padding: "10px 14px" }}>{plan.features.length} / {features.length}</td>
          <td style={{ padding: "10px 14px" }}>{plan.workspaces}</td>
          <td style={{ padding: "10px 14px" }}><button onClick={() => setEditing(plan)} style={{ ...btn, padding: "6px 12px" }}>Edit</button></td>
        </tr>)}</tbody>
      </table>
    </section> : <section style={panel}>
      <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Edit {editing.name} <span style={{ fontSize: 12, color: muted }}>({editing.workspaces} workspace{editing.workspaces === 1 ? "" : "s"} on it now)</span></h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,170px),1fr))", gap: 10 }}>
        <label style={{ fontSize: 12, color: muted }}>Name<input value={editing.name} onChange={event => set({ name: event.target.value })} style={input} /></label>
        <label style={{ fontSize: 12, color: muted }}>₹ / month<input type="number" min={0} value={editing.monthlyPrice} onChange={event => set({ monthlyPrice: Number(event.target.value) || 0 })} style={input} /></label>
        <label style={{ fontSize: 12, color: muted }}>₹ / year (blank = monthly only)<input type="number" min={0} value={editing.annualPrice ?? ""} onChange={event => set({ annualPrice: num(event.target.value) })} style={input} /></label>
        <label style={{ fontSize: 12, color: muted }}>Users (blank = unlimited)<input type="number" min={0} value={editing.maxUsers ?? ""} onChange={event => set({ maxUsers: num(event.target.value) })} style={input} /></label>
        <label style={{ fontSize: 12, color: muted }}>WhatsApp numbers<input type="number" min={0} value={editing.maxPhoneNumbers ?? ""} onChange={event => set({ maxPhoneNumbers: num(event.target.value) })} style={input} /></label>
        <label style={{ fontSize: 12, color: muted }}>Messages / month<input type="number" min={0} value={editing.maxMessages ?? ""} onChange={event => set({ maxMessages: num(event.target.value) })} style={input} /></label>
      </div>
      <label style={{ display: "block", fontSize: 12, color: muted, marginTop: 10 }}>Short description<input value={editing.description || ""} maxLength={200} onChange={event => set({ description: event.target.value || null })} style={input} /></label>
      <div style={{ display: "flex", gap: 18, margin: "12px 0", fontSize: 13 }}>
        <label><input type="checkbox" checked={editing.isPopular} onChange={event => set({ isPopular: event.target.checked })} /> ⭐ Most popular</label>
        <label><input type="checkbox" checked={editing.status} onChange={event => set({ status: event.target.checked })} /> Offered to customers</label>
      </div>
      {groups.map(group => <div key={group} style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#86efac", textTransform: "uppercase", marginBottom: 6 }}>{group}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 6 }}>
          {features.filter(feature => feature.group === group).map(feature => { const on = editing.features.includes(feature.key)
            return <label key={feature.key} title={feature.description} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, border: `1px solid ${on ? "#25d366" : "rgba(255,255,255,.12)"}`, borderRadius: 6, padding: "6px 8px", cursor: "pointer" }}>
              <input type="checkbox" checked={on} onChange={() => set({ features: on ? editing.features.filter(key => key !== feature.key) : [...editing.features, feature.key] })} />{feature.label}</label> })}
        </div>
      </div>)}
      <p style={{ fontSize: 11, color: "#fcd34d" }}>Removing a feature locks it immediately for every workspace on this plan (their data stays; they see an upgrade prompt).</p>
      <div style={{ display: "flex", gap: 8 }}><button onClick={save} style={btn}>Save plan</button>
        <button onClick={() => setEditing(null)} style={{ ...btn, background: "transparent", color: muted, border: "1px solid rgba(255,255,255,.2)" }}>Cancel</button></div>
    </section>}
  </div>
}
