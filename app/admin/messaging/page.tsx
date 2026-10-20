"use client"
import { useEffect, useState } from "react"
import { CostComparator, type ModeOption } from "@/components/billing/CostComparator"

type Mode = "DIRECT" | "PLATFORM_FEE" | "RESELLER"
type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION"
type Settings = { enabledModes: Mode[]; defaultMode: Mode; currency: string; metaRates: Record<Category, number>; platformFee: Record<Category, number>
  resellerMarkupPercent: number; minTopup: number; lowBalanceThreshold: number; showComparisonToCustomers: boolean; ratesNote: string }
type Workspace = { id: string; name: string; slug: string; mode: Mode; override: Mode | null; walletBalance: number; currency: string; usage: Record<Category, number> }
type Data = { settings: Settings; workspaces: Workspace[]; platformUsage: Record<Category, number>; walletRevenue30d: { mode: string | null; charged: number; metaCost: number }[] }

const INFO: Record<Mode, { label: string; summary: string }> = {
  DIRECT: { label: "Pay Meta directly", summary: "Customer adds a card in WhatsApp Manager; Meta bills them. No per-message charge from you." },
  PLATFORM_FEE: { label: "Meta direct + platform fee", summary: "Customer pays Meta directly; their wallet pays your per-message fee." },
  RESELLER: { label: "All-inclusive wallet (reseller)", summary: "You pay Meta via your partner credit line; the wallet pays Meta's rate + your markup." },
}
const CATS: [Category, string][] = [["MARKETING", "Marketing"], ["UTILITY", "Utility"], ["AUTHENTICATION", "Authentication"]]
const bg = "#0f172a", panel: React.CSSProperties = { background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 20, marginBottom: 18 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, padding: "7px 9px", fontSize: 13, background: "rgba(255,255,255,.06)", color: "#e2e8f0" }
const btn: React.CSSProperties = { border: 0, borderRadius: 6, padding: "9px 14px", background: "#25d366", color: "#053d36", fontSize: 12, fontWeight: 800, cursor: "pointer" }
const muted = "rgba(255,255,255,.5)"

function prices(settings: Settings, mode: Mode) {
  return Object.fromEntries(CATS.map(([category]) => {
    const meta = settings.metaRates[category]
    return [category, mode === "DIRECT" ? { payToMeta: meta, wallet: 0 } : mode === "PLATFORM_FEE" ? { payToMeta: meta, wallet: settings.platformFee[category] }
      : { payToMeta: 0, wallet: Math.round(meta * (1 + settings.resellerMarkupPercent / 100) * 10000) / 10000 }]
  })) as Record<Category, { payToMeta: number; wallet: number }>
}

export default function AdminMessagingPage() {
  const [data, setData] = useState<Data | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [adjust, setAdjust] = useState<{ id: string; amount: string; reason: string } | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function load() {
    const response = await fetch("/api/admin/messaging")
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Could not load.")
    setData(body); setSettings(body.settings)
  }
  useEffect(() => { load().catch(reason => setError(reason.message)) }, [])

  async function call(method: string, body: unknown) {
    setError(""); setNotice("")
    const response = await fetch("/api/admin/messaging", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) { setError(result.error || "Failed"); return false }
    setNotice(result.message || "Saved."); await load(); return true
  }

  if (!data || !settings) return <div style={{ minHeight: "100vh", background: bg, color: "#e2e8f0", padding: 32 }}>{error || "Loading…"}</div>
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const setRate = (key: "metaRates" | "platformFee", category: Category, value: string) => set({ [key]: { ...settings[key], [category]: Math.max(0, Number(value) || 0) } } as Partial<Settings>)
  const options: ModeOption[] = (["DIRECT", "PLATFORM_FEE", "RESELLER"] as Mode[]).map(mode => ({ mode, label: INFO[mode].label, short: mode, summary: INFO[mode].summary, prices: prices(settings, mode) }))

  return (
    <div style={{ minHeight: "100vh", background: bg, color: "#e2e8f0", padding: "24px clamp(16px,4vw,40px)", fontFamily: "DM Sans,system-ui,sans-serif" }}>
      <a href="/admin/dashboard" style={{ color: "#86efac", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>← Admin dashboard</a>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, margin: "8px 0 4px" }}>Messaging charges</h1>
      <p style={{ fontSize: 13, color: muted, margin: "0 0 18px", maxWidth: 760 }}>Choose how customers pay for WhatsApp template messages. Enable one or more options, set the default, and switch individual workspaces.
        Compare the options below with real usage before you decide.</p>
      {error && <div role="alert" style={{ padding: 11, background: "rgba(239,68,68,.15)", color: "#fca5a5", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 11, background: "rgba(34,197,94,.15)", color: "#86efac", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

      <section style={panel}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Options</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 10 }}>
          {(["DIRECT", "PLATFORM_FEE", "RESELLER"] as Mode[]).map(mode => { const on = settings.enabledModes.includes(mode)
            return <div key={mode} style={{ border: `1px solid ${on ? "#25d366" : "rgba(255,255,255,.12)"}`, borderRadius: 8, padding: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={on} onChange={() => set({ enabledModes: on ? settings.enabledModes.filter(item => item !== mode) : [...settings.enabledModes, mode] })} />{INFO[mode].label}</label>
              <div style={{ fontSize: 12, color: muted, margin: "6px 0 8px" }}>{INFO[mode].summary}</div>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: on ? "#e2e8f0" : muted }}>
                <input type="radio" disabled={!on} checked={settings.defaultMode === mode} onChange={() => set({ defaultMode: mode })} /> Default for workspaces</label>
            </div> })}
        </div>
        {settings.enabledModes.includes("RESELLER") && <div style={{ fontSize: 12, color: "#fcd34d", background: "rgba(252,211,77,.08)", borderRadius: 6, padding: "8px 10px", marginTop: 12, lineHeight: 1.6 }}>
          Reseller needs Meta to bill <strong>you</strong>: be a Meta Solution Partner (or Tech Provider with a credit line) and share your credit line with each reseller customer&apos;s WABA in
          Meta Business Settings. Until that&apos;s done, Meta still bills the customer&apos;s own card and they&apos;d pay twice — only switch workspaces whose WABA uses your credit line.</div>}
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 12 }}>
          <input type="checkbox" checked={settings.showComparisonToCustomers} onChange={event => set({ showComparisonToCustomers: event.target.checked })} />
          Show customers a comparison of all enabled options on their Billing page</label>
      </section>

      <section style={panel}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Rate card ({settings.currency} per message, before GST)</h2>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ color: muted, textAlign: "left" }}><tr><th style={{ padding: 6 }}>Category</th><th style={{ padding: 6 }}>Meta rate</th><th style={{ padding: 6 }}>Your platform fee</th>
            <th style={{ padding: 6 }}>Reseller price (Meta + {settings.resellerMarkupPercent}%)</th><th style={{ padding: 6 }}>Your margin / msg (reseller)</th></tr></thead>
          <tbody>{CATS.map(([category, label]) => { const resale = prices(settings, "RESELLER")[category].wallet
            return <tr key={category} style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
              <td style={{ padding: 6, fontWeight: 700 }}>{label}</td>
              <td style={{ padding: 6 }}><input type="number" step="0.0001" min={0} value={settings.metaRates[category]} onChange={event => setRate("metaRates", category, event.target.value)} style={{ ...input, width: 110 }} /></td>
              <td style={{ padding: 6 }}><input type="number" step="0.0001" min={0} value={settings.platformFee[category]} onChange={event => setRate("platformFee", category, event.target.value)} style={{ ...input, width: 110 }} /></td>
              <td style={{ padding: 6 }}>{resale.toFixed(4)}</td><td style={{ padding: 6, color: "#86efac" }}>{(resale - settings.metaRates[category]).toFixed(4)}</td></tr> })}</tbody></table></div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, fontSize: 12, color: muted }}>
          <label>Reseller markup %<br /><input type="number" min={0} max={500} value={settings.resellerMarkupPercent} onChange={event => set({ resellerMarkupPercent: Math.max(0, Number(event.target.value) || 0) })} style={{ ...input, width: 100 }} /></label>
          <label>Minimum top-up<br /><input type="number" min={1} value={settings.minTopup} onChange={event => set({ minTopup: Math.max(1, Number(event.target.value) || 1) })} style={{ ...input, width: 110 }} /></label>
          <label>Low-balance alert below<br /><input type="number" min={0} value={settings.lowBalanceThreshold} onChange={event => set({ lowBalanceThreshold: Math.max(0, Number(event.target.value) || 0) })} style={{ ...input, width: 110 }} /></label>
          <label style={{ flex: 1, minWidth: 260 }}>Note shown to customers<br /><input value={settings.ratesNote} maxLength={300} onChange={event => set({ ratesNote: event.target.value })} style={{ ...input, width: "100%" }} /></label>
        </div>
        <p style={{ fontSize: 11, color: muted }}>Meta changes its rates by country and category from time to time — keep the Meta rate column in line with Meta&apos;s current rate card for your customers&apos; main market.</p>
        <button onClick={() => call("PUT", settings)} style={btn}>Save settings</button>
      </section>

      <section style={panel}>
        <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Which option is cheapest for customers?</h2>
        <p style={{ fontSize: 12, color: muted, margin: "0 0 12px" }}>Pre-filled with all workspaces&apos; template messages from the last 30 days, using the rates above (unsaved changes included).</p>
        <CostComparator dark options={options} initial={data.platformUsage} currency={settings.currency} />
        {data.walletRevenue30d.length > 0 && <div style={{ fontSize: 12, color: muted, marginTop: 14 }}>Wallet charges in the last 30 days: {data.walletRevenue30d.map(row =>
          `${row.mode || "?"} ${settings.currency} ${row.charged.toFixed(2)}${row.metaCost ? ` (Meta cost ${row.metaCost.toFixed(2)})` : ""}`).join(" · ")}</div>}
      </section>

      <section style={{ ...panel, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700 }}>Workspaces</div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
          <thead style={{ color: muted }}><tr>{["Workspace", "Charging option", "Wallet", "Templates (30 days)", ""].map(text => <th key={text} style={{ padding: "8px 14px", fontWeight: 600 }}>{text}</th>)}</tr></thead>
          <tbody>{data.workspaces.map(ws => <tr key={ws.id} style={{ borderTop: "1px solid rgba(255,255,255,.07)", verticalAlign: "top" }}>
            <td style={{ padding: "10px 14px" }}><div style={{ fontWeight: 700 }}>{ws.name}</div><div style={{ color: muted }}>{ws.slug}</div></td>
            <td style={{ padding: "10px 14px" }}><select value={ws.override || ""} onChange={event => call("PATCH", { organizationId: ws.id, mode: event.target.value || null })} style={input}>
              <option value="">Default ({INFO[data.settings.defaultMode].label})</option>
              {data.settings.enabledModes.map(mode => <option key={mode} value={mode}>{INFO[mode].label}</option>)}</select></td>
            <td style={{ padding: "10px 14px", fontWeight: 700 }}>{ws.currency} {ws.walletBalance.toFixed(2)}</td>
            <td style={{ padding: "10px 14px", color: muted }}>M {ws.usage.MARKETING} · U {ws.usage.UTILITY} · A {ws.usage.AUTHENTICATION}</td>
            <td style={{ padding: "10px 14px" }}>{adjust?.id === ws.id ? <form onSubmit={async event => { event.preventDefault(); if (await call("POST", { organizationId: ws.id, amount: Number(adjust.amount), reason: adjust.reason })) setAdjust(null) }}
              style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input required type="number" step="0.01" placeholder="+500 or -50" value={adjust.amount} onChange={event => setAdjust({ ...adjust, amount: event.target.value })} style={{ ...input, width: 110 }} />
              <input required minLength={3} placeholder="Reason" value={adjust.reason} onChange={event => setAdjust({ ...adjust, reason: event.target.value })} style={{ ...input, width: 160 }} />
              <button type="submit" style={{ ...btn, padding: "6px 10px" }}>Apply</button>
              <button type="button" onClick={() => setAdjust(null)} style={{ ...btn, padding: "6px 10px", background: "transparent", color: muted }}>✕</button>
            </form> : <button onClick={() => setAdjust({ id: ws.id, amount: "", reason: "" })} style={{ ...btn, padding: "6px 10px", background: "rgba(255,255,255,.08)", color: "#e2e8f0" }}>Adjust wallet</button>}</td>
          </tr>)}</tbody></table></div>
      </section>
    </div>
  )
}
