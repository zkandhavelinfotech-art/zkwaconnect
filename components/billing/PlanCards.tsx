"use client"
import { Fragment, useEffect, useState } from "react"
import { FEATURE_KEYS, FEATURES, type FeatureKey } from "@/lib/billing/features"

export type CardPlan = { id: string; slug: string; name: string; description?: string | null; monthlyPrice: number | string; annualPrice?: number | string | null
  maxUsers?: number | null; maxPhoneNumbers?: number | null; maxMessages?: number | null; features: FeatureKey[]; isPopular?: boolean }
type Limits = { messages: number | null; users: number | null; numbers: number | null }
type Action = { label: string; disabled: boolean }

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const limit = (value: number | null | undefined, unit: string) => value === null || value === undefined ? `Unlimited ${unit}` : `${value.toLocaleString("en-IN")} ${unit}`
const GROUPS = [...new Set(FEATURE_KEYS.map(key => FEATURES[key].group))]

// Plan cards (with what each adds), a full comparison table, and a "what you get" confirmation before buying.
export function PlanCards({ plans, period, currentSlug, currentFeatures, currentLimits, action, onBuy, busyId }: {
  plans: CardPlan[]; period: "MONTHLY" | "ANNUAL"; currentSlug: string | null; currentFeatures: FeatureKey[]; currentLimits: Limits | null
  action: (plan: CardPlan) => Action; onBuy: (plan: CardPlan) => void; busyId: string }) {
  const [compare, setCompare] = useState(false)
  const [confirm, setConfirm] = useState<CardPlan | null>(null)
  const sorted = [...plans].sort((a, b) => Number(a.monthlyPrice) - Number(b.monthlyPrice))

  // Arriving from a locked feature ("Upgrade to Business") opens that plan's confirmation.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("plan")
    const plan = slug ? sorted.find(item => item.slug === slug) : null
    if (plan && !action(plan).disabled) setConfirm(plan)
  }, [plans.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const price = (plan: CardPlan) => period === "ANNUAL" && Number(plan.annualPrice) > 0 ? Number(plan.annualPrice) : Number(plan.monthlyPrice)
  const gained = confirm ? confirm.features.filter(feature => !currentFeatures.includes(feature)) : []
  const lost = confirm ? currentFeatures.filter(feature => !confirm.features.includes(feature)) : []

  return <div id="plans">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,215px),1fr))", gap: 12, alignItems: "stretch" }}>
      {sorted.map((plan, index) => {
        const previous = sorted[index - 1]
        const adds = previous ? plan.features.filter(feature => !previous.features.includes(feature)) : plan.features
        const current = plan.slug === currentSlug
        const free = Number(plan.monthlyPrice) === 0
        const state = action(plan)
        return <article key={plan.id} style={{ position: "relative", background: plan.isPopular ? "#f3fbf7" : "#fff", border: `${plan.isPopular || current ? 2 : 1}px solid ${current ? "#0e8b71" : plan.isPopular ? "#25d366" : "#e2e8f0"}`,
          borderRadius: 12, padding: 18, display: "flex", flexDirection: "column" }}>
          {plan.isPopular && <span style={{ position: "absolute", top: -11, left: 16, background: "#25d366", color: "#053d36", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "3px 9px" }}>⭐ MOST POPULAR</span>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#183633" }}>{plan.name}</span>
            {current && <span style={{ fontSize: 10, fontWeight: 800, color: "#166534", background: "#dcfce7", borderRadius: 10, padding: "2px 8px" }}>CURRENT</span>}
          </div>
          {plan.description && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, minHeight: 28 }}>{plan.description}</div>}
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#075e54", marginTop: 8 }}>
            {free ? "₹0" : money(price(plan))}<span style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11, fontWeight: 500, color: "#64748b" }}>{free ? " forever" : `/${period === "ANNUAL" && Number(plan.annualPrice) > 0 ? "year" : "month"} + GST`}</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", margin: "8px 0", lineHeight: 1.6, background: "#f8fafc", borderRadius: 6, padding: "6px 8px" }}>
            👥 {limit(plan.maxUsers, "users")} · 📱 {limit(plan.maxPhoneNumbers, "numbers")}<br />✉️ {limit(plan.maxMessages, "messages / month")}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#526763", margin: "4px 0" }}>{previous ? `Everything in ${previous.name}, plus:` : "Includes:"}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
            {adds.map(feature => <li key={feature} title={FEATURES[feature].description} style={{ fontSize: 12, color: "#334155", padding: "3px 0", display: "flex", gap: 6 }}>
              <span style={{ color: "#16a34a" }}>✓</span>{FEATURES[feature].label}</li>)}
          </ul>
          <button onClick={() => setConfirm(plan)} disabled={state.disabled || Boolean(busyId)} style={{ marginTop: 12, border: 0, borderRadius: 8, padding: "10px 12px",
            background: state.disabled ? "#e9efed" : plan.isPopular ? "#25d366" : "#075e54", color: state.disabled ? "#49615e" : plan.isPopular ? "#053d36" : "#fff",
            fontWeight: 800, fontSize: 12, cursor: state.disabled ? "default" : "pointer" }}>{busyId === plan.id ? "Creating invoice…" : state.label}</button>
        </article>
      })}
    </div>

    <button onClick={() => setCompare(value => !value)} style={{ marginTop: 12, border: "1px solid #cbd5d3", background: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#075e54", cursor: "pointer" }}>
      {compare ? "Hide comparison" : "Compare all features"}</button>
    {compare && <div style={{ overflowX: "auto", marginTop: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
      <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f7faf9" }}><th style={{ textAlign: "left", padding: 10 }}>Feature</th>
          {sorted.map(plan => <th key={plan.id} style={{ padding: 10, color: plan.slug === currentSlug ? "#0e8b71" : "#183633" }}>{plan.name}{plan.isPopular ? " ⭐" : ""}</th>)}</tr></thead>
        <tbody>
          {([["Team members", "maxUsers", "users"], ["WhatsApp numbers", "maxPhoneNumbers", "numbers"], ["Messages / month", "maxMessages", "messages"]] as const).map(([label, key]) =>
            <tr key={key} style={{ borderTop: "1px solid #edf1f0" }}><td style={{ padding: "8px 10px", fontWeight: 700 }}>{label}</td>
              {sorted.map(plan => <td key={plan.id} style={{ textAlign: "center", padding: 8 }}>{plan[key] === null || plan[key] === undefined ? "Unlimited" : Number(plan[key]).toLocaleString("en-IN")}</td>)}</tr>)}
          {GROUPS.map(group => <Fragment key={group}>
            <tr><td colSpan={sorted.length + 1} style={{ padding: "10px 10px 4px", fontSize: 11, fontWeight: 800, color: "#075e54", textTransform: "uppercase" }}>{group}</td></tr>
            {FEATURE_KEYS.filter(key => FEATURES[key].group === group).map(key => <tr key={key} style={{ borderTop: "1px solid #f1f5f9" }}>
              <td style={{ padding: "6px 10px" }} title={FEATURES[key].description}>{FEATURES[key].label}</td>
              {sorted.map(plan => <td key={plan.id} style={{ textAlign: "center", padding: 6, color: plan.features.includes(key) ? "#16a34a" : "#cbd5e1", fontWeight: 800 }}>{plan.features.includes(key) ? "✓" : "–"}</td>)}
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </div>}

    {confirm && <div role="dialog" aria-modal="true" aria-label={`Choose ${confirm.name}`} onClick={() => setConfirm(null)}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 18, margin: "0 0 4px", color: "#0f172a" }}>{action(confirm).label} · {confirm.name}</h2>
        <div style={{ fontSize: 13, color: "#64748b" }}>{money(price(confirm))} {period === "ANNUAL" && Number(confirm.annualPrice) > 0 ? "per year" : "per month"} + 18% GST ≈ <strong>{money(Math.round(price(confirm) * 1.18 * 100) / 100)}</strong></div>
        {gained.length > 0 && <>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", margin: "16px 0 6px" }}>✨ You get {gained.length} new feature{gained.length === 1 ? "" : "s"}</div>
          {gained.map(feature => <div key={feature} style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: "1px solid #f1f5f9" }}>
            <span style={{ color: "#16a34a" }}>✓</span><span><strong style={{ fontSize: 13, color: "#183633" }}>{FEATURES[feature].label}</strong>
              <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>{FEATURES[feature].description}</span></span></div>)}
        </>}
        {currentLimits && <div style={{ fontSize: 12, color: "#334155", margin: "14px 0 0", background: "#f8fafc", borderRadius: 8, padding: 10, lineHeight: 1.8 }}>
          {([["Team members", currentLimits.users, confirm.maxUsers], ["WhatsApp numbers", currentLimits.numbers, confirm.maxPhoneNumbers], ["Messages / month", currentLimits.messages, confirm.maxMessages]] as const)
            .map(([label, from, to]) => <div key={label}>{label}: {from === null ? "Unlimited" : from.toLocaleString("en-IN")} → <strong style={{ color: (to ?? Infinity) > (from ?? Infinity) ? "#166534" : "#183633" }}>{to === null || to === undefined ? "Unlimited" : to.toLocaleString("en-IN")}</strong></div>)}
        </div>}
        {lost.length > 0 && <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: 10, marginTop: 10 }}>Not included in {confirm.name}: {lost.map(feature => FEATURES[feature].label).join(", ")}.</div>}
        <p style={{ fontSize: 11, color: "#94a3b8", margin: "12px 0 0" }}>We create a GST invoice you pay by UPI. Your new plan starts as soon as the payment is approved; your current plan keeps working until then.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => { const plan = confirm; setConfirm(null); onBuy(plan) }} style={{ flex: 1, border: 0, borderRadius: 8, padding: "11px 14px", background: "#075e54", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            Continue to payment</button>
          <button onClick={() => setConfirm(null)} style={{ border: "1px solid #cbd5d3", borderRadius: 8, padding: "11px 14px", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>}
  </div>
}
