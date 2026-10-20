"use client"
import { useEffect, useState } from "react"

type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION"
type Price = { payToMeta: number; wallet: number }
export type ModeOption = { mode: string; label: string; short: string; summary: string; prices: Record<Category, Price> }

const CATEGORIES: [Category, string][] = [["MARKETING", "Marketing"], ["UTILITY", "Utility"], ["AUTHENTICATION", "Authentication (OTP)"]]
const money = (value: number, currency: string) => `${currency === "INR" ? "₹" : `${currency} `}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rate = (value: number, currency: string) => `${currency === "INR" ? "₹" : `${currency} `}${value.toLocaleString("en-IN", { maximumFractionDigits: 4 })}`

// Monthly cost of each charging option for a given number of template messages. Volumes are editable.
export function CostComparator({ options, initial, currency, current, dark = false }:
  { options: ModeOption[]; initial: Record<Category, number>; currency: string; current?: string; dark?: boolean }) {
  const [volumes, setVolumes] = useState(initial)
  useEffect(() => setVolumes(initial), [initial])
  const totals = options.map(option => {
    let payToMeta = 0, wallet = 0
    for (const [category] of CATEGORIES) { payToMeta += option.prices[category].payToMeta * (volumes[category] || 0); wallet += option.prices[category].wallet * (volumes[category] || 0) }
    return { ...option, payToMeta, wallet, total: payToMeta + wallet }
  })
  const cheapest = Math.min(...totals.map(item => item.total))
  const text = dark ? "#e2e8f0" : "#183633", muted = dark ? "rgba(255,255,255,.5)" : "#64748b", line = dark ? "rgba(255,255,255,.1)" : "#e2e8f0"
  const input: React.CSSProperties = { width: 110, boxSizing: "border-box", border: `1px solid ${dark ? "rgba(255,255,255,.2)" : "#cbd5d3"}`, borderRadius: 6, padding: "6px 8px",
    fontSize: 13, background: dark ? "rgba(255,255,255,.06)" : "#fff", color: text }

  return <div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
      {CATEGORIES.map(([category, label]) => <label key={category} style={{ fontSize: 12, color: muted }}>
        <span style={{ display: "block", fontWeight: 700, marginBottom: 4 }}>{label} messages / month</span>
        <input type="number" min={0} value={volumes[category]} onChange={event => setVolumes(current => ({ ...current, [category]: Math.max(0, Number(event.target.value) || 0) }))} style={input} />
      </label>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,220px),1fr))`, gap: 10 }}>
      {totals.map(item => {
        const best = item.total === cheapest && totals.length > 1
        return <article key={item.mode} style={{ border: `2px solid ${best ? "#22c55e" : line}`, borderRadius: 10, padding: 14, position: "relative", background: dark ? "rgba(255,255,255,.03)" : "#fff" }}>
          {best && <span style={{ position: "absolute", top: -10, right: 10, background: "#22c55e", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "2px 8px" }}>CHEAPEST</span>}
          <div style={{ fontSize: 13, fontWeight: 800, color: text }}>{item.label}{current === item.mode && <span style={{ marginLeft: 6, fontSize: 10, color: "#16a34a" }}>● current</span>}</div>
          <div style={{ fontSize: 11, color: muted, margin: "4px 0 10px", minHeight: 30 }}>{item.summary}</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: best ? "#16a34a" : text }}>{money(item.total, currency)}<span style={{ fontSize: 11, color: muted, fontWeight: 500 }}> /month</span></div>
          <div style={{ fontSize: 11, color: muted, marginTop: 6, lineHeight: 1.6 }}>
            {item.payToMeta > 0 && <div>Billed by Meta: {money(item.payToMeta, currency)}</div>}
            {item.wallet > 0 && <div>From ZKWAConnect wallet: {money(item.wallet, currency)}</div>}
            {item.total === 0 && <div>No template messages</div>}
          </div>
          <table style={{ width: "100%", fontSize: 11, color: muted, marginTop: 8, borderTop: `1px solid ${line}` }}><tbody>
            {CATEGORIES.map(([category, label]) => <tr key={category}><td style={{ padding: "3px 0" }}>{label}</td>
              <td style={{ textAlign: "right" }}>{rate(item.prices[category].payToMeta + item.prices[category].wallet, currency)}/msg</td></tr>)}
          </tbody></table>
        </article>
      })}
    </div>
    <p style={{ fontSize: 11, color: muted, margin: "10px 0 0" }}>Service conversations (replying within 24 h) are free on WhatsApp, and so are utility templates sent while that window is open. Prices exclude GST.</p>
  </div>
}
