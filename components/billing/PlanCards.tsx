"use client"
import { Fragment, useEffect, useState } from "react"
import { FEATURE_KEYS, FEATURES, type FeatureKey } from "@/lib/billing/features"

export type Interval = "MONTHLY" | "QUARTERLY" | "ANNUAL"

export type CardPlan = {
  id: string
  slug: string
  name: string
  description?: string | null
  monthlyPrice: number | string
  annualPrice?: number | string | null
  maxUsers?: number | null
  maxPhoneNumbers?: number | null
  maxMessages?: number | null
  features: FeatureKey[]
  isPopular?: boolean
}

type Limits = { messages: number | null; users: number | null; numbers: number | null }
type Action = { label: string; disabled: boolean }

const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const moneyPlain = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const limit = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? `Unlimited ${unit}` : `${value.toLocaleString("en-IN")} ${unit}`

const GROUPS = [...new Set(FEATURE_KEYS.map(key => FEATURES[key].group))]

// AiSensy aligned tier metadata and badges
const TIER_META: Record<string, {
  subtitle: string
  speed: string
  tags: string
  attributes: string
  segments: string
  lists: string
  team: string
  badge?: string
  valueBadge?: string
  highlights: string[]
}> = {
  free: {
    subtitle: "WhatsApp API FREE for life",
    speed: "Standard speed (20 msgs/s)",
    tags: "Up to 10 Tags",
    attributes: "Up to 5 Custom Attributes",
    segments: "Upload unlimited contacts",
    lists: "5 Contact Lists",
    team: "1 Agent included",
    badge: "FREE FOREVER",
    highlights: [
      "Free WhatsApp Business API",
      "Free WhatsApp Blue Tick Application",
      "Run Meta Ads with 1,000 FREE Ad Credits",
      "₹50 Free Conversation Credits",
      "1,000 FREE Service Messages every month",
      "Click-to-WhatsApp Ads Manager",
      "Live Chat Dashboard & Template Creator",
    ],
  },
  starter: {
    subtitle: "Get started fast",
    speed: "40 messages/second",
    tags: "Up to 10 Tags",
    attributes: "Up to 5 Custom Attributes",
    segments: "2 Segments",
    lists: "10 Lists",
    team: "1 Owner + 5 FREE Agents included",
    badge: "SAVE 33% VS AISENSY",
    highlights: [
      "All Free Forever features, plus:",
      "Messaging speed: 40 messages/sec",
      "1 Owner + 5 FREE Agents included",
      "Smart Audience Segregation",
      "Broadcasting & Retargeting",
      "Smart Campaign Manager",
    ],
  },
  business: {
    subtitle: "Growth Marketer",
    speed: "40 messages/second",
    tags: "Up to 100 Tags",
    attributes: "Up to 20 Custom Attributes",
    segments: "Up to 10 Segments",
    lists: "Up to 25 Lists",
    team: "1 Owner + 10 Team members included",
    badge: "⭐ MOST POPULAR",
    valueBadge: "FLOWS + API + INSTAGRAM INCLUDED",
    highlights: [
      "All Basic features, plus:",
      "Up to 100 Tags & 20 Custom Attributes",
      "Up to 10 Audience Segments & 25 Lists",
      "Campaign Scheduler & Click Tracking",
      "Campaign Budget & Analytics",
      "Project APIs & Webhooks",
      "Instagram DM Inbox",
      "Unlimited FlowBuilder Included Free (Save ₹30,000/yr)",
      "Smart Agent Routing & Multi-Agent Live Chat",
    ],
  },
  professional: {
    subtitle: "Expert Marketer",
    speed: "250 messages/second (High)",
    tags: "250 Tags (₹3,000/mo value)",
    attributes: "50 Attributes (₹3,000/mo value)",
    segments: "50 Audience Segments",
    lists: "250 Lists (₹12,500/mo value)",
    team: "1 Owner + 9 Team members included (₹6,750/mo value)",
    badge: "+ New",
    valueBadge: "Features worth ₹43,750 included",
    highlights: [
      "All Pro features, plus:",
      "Priority Support",
      "Higher Messaging Speed — 250 msgs/sec",
      "1 Owner + 9 Team members included",
      "Number Masking (₹5,000/mo value)",
      "250 Tags & 50 Custom Attributes",
      "50 Audience Segments & 250 Lists",
    ],
  },
  enterprise: {
    subtitle: "Everything, no limits",
    speed: "1,000 messages/second (Highest)",
    tags: "Unlimited Tags ** (₹7,000/mo value)",
    attributes: "Unlimited Attributes *** (₹7,000/mo value)",
    segments: "Custom Segment Limits",
    lists: "250 Lists (₹12,500/mo value)",
    team: "Unlimited Team Members * (₹1,50,000/mo value)",
    badge: "+ New",
    valueBadge: "Features worth ₹2,00,000 included",
    highlights: [
      "All Premium features, plus:",
      "Unlimited Team Members *",
      "Highest Messaging Speed — 1,000 msgs/sec",
      "Unlimited Tags ** & Attributes ***",
      "Dedicated Account Manager",
      "Custom Integrations & SLA Support",
      "SSO & Security Audit Logs",
    ],
  },
}

export function PlanCards({
  plans,
  period,
  onPeriodChange,
  currentSlug,
  currentFeatures,
  currentLimits,
  action,
  onBuy,
  busyId,
}: {
  plans: CardPlan[]
  period: Interval
  onPeriodChange?: (interval: Interval) => void
  currentSlug: string | null
  currentFeatures: FeatureKey[]
  currentLimits: Limits | null
  action: (plan: CardPlan) => Action
  onBuy: (plan: CardPlan) => void
  busyId: string
}) {
  const [compare, setCompare] = useState(false)
  const [confirm, setConfirm] = useState<CardPlan | null>(null)
  const [showRates, setShowRates] = useState(false)

  const sorted = [...plans].sort((a, b) => Number(a.monthlyPrice) - Number(b.monthlyPrice))

  // Default selected plan is Business (Growth Marketer) or current active plan
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    const current = sorted.find(p => p.slug === currentSlug)
    if (current && Number(current.monthlyPrice) > 0) return current.id
    const popular = sorted.find(p => p.slug === "business" || p.isPopular)
    return popular?.id || sorted[1]?.id || sorted[0]?.id || ""
  })

  // Arriving from a locked feature ("Upgrade to Business") opens that plan's confirmation
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("plan")
    const plan = slug ? sorted.find(item => item.slug === slug) : null
    if (plan) {
      setSelectedPlanId(plan.id)
      if (!action(plan).disabled) setConfirm(plan)
    }
  }, [plans.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Price computation matching AiSensy's exact billing discount structure:
  // - Monthly: 100% of monthlyPrice
  // - Quarterly: 3 months with 5% discount
  // - Yearly: 10% - 17% discount (annualPrice or 10 months)
  function getPlanPrice(plan: CardPlan, interval: Interval) {
    const base = Number(plan.monthlyPrice)
    if (base === 0) return { perMonth: 0, total: 0, label: "₹0 forever", billedNote: "No card required" }

    if (interval === "QUARTERLY") {
      const quarterlyTotal = Math.round(base * 3 * 0.95)
      const perMonth = Math.round(base * 0.95)
      return {
        perMonth,
        total: quarterlyTotal,
        label: `${moneyPlain(perMonth)}/month`,
        billedNote: `Billed ${moneyPlain(quarterlyTotal)} quarterly (5% off)`,
      }
    }

    if (interval === "ANNUAL") {
      const annualTotal = Number(plan.annualPrice) > 0 ? Number(plan.annualPrice) : Math.round(base * 12 * 0.90)
      const perMonth = Math.round(annualTotal / 12)
      return {
        perMonth,
        total: annualTotal,
        label: `${moneyPlain(perMonth)}/month`,
        billedNote: `Billed ${moneyPlain(annualTotal)} yearly (10% off)`,
      }
    }

    return {
      perMonth: base,
      total: base,
      label: `${moneyPlain(base)}/month`,
      billedNote: "Billed monthly",
    }
  }

  const activeSelectedPlan = sorted.find(p => p.id === selectedPlanId) || sorted[0]
  const selectedPriceInfo = activeSelectedPlan ? getPlanPrice(activeSelectedPlan, period) : null
  const selectedPlanAction = activeSelectedPlan ? action(activeSelectedPlan) : { label: "Choose plan", disabled: false }

  const gained = confirm ? confirm.features.filter(feature => !currentFeatures.includes(feature)) : []
  const lost = confirm ? currentFeatures.filter(feature => !confirm.features.includes(feature)) : []

  return (
    <div id="plans" style={{ position: "relative" }}>
      {/* Top Header & AiSensy-Styled Billing Cycle Toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 }}>
              Purchase Plan
            </h2>
            <button
              onClick={() => setShowRates(prev => !prev)}
              style={{
                background: showRates ? "#e0f2fe" : "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 700,
                color: showRates ? "#0369a1" : "#475569",
                cursor: "pointer",
              }}
            >
              ℹ️ {showRates ? "Hide per-message rates" : "View per-message rates (AiSensy rates)"}
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Choose the plan that fits your growth. Switch, renew, or cancel anytime.
          </p>
        </div>

        {/* AiSensy Pill Switcher: Monthly, Quarterly (5% Off), Yearly (10% Off) */}
        {onPeriodChange && (
          <div
            role="radiogroup"
            aria-label="Billing cycle"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#f1f5f9",
              padding: 4,
              borderRadius: 30,
              border: "1px solid #e2e8f0",
            }}
          >
            {[
              { id: "MONTHLY", label: "Monthly" },
              { id: "QUARTERLY", label: "Quarterly (5% Off)" },
              { id: "ANNUAL", label: "Yearly (10% Off)" },
            ].map(cycle => {
              const active = period === cycle.id
              return (
                <button
                  key={cycle.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onPeriodChange(cycle.id as Interval)}
                  style={{
                    border: 0,
                    borderRadius: 24,
                    padding: "7px 16px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    transition: "all .15s ease",
                    background: active ? "#22c55e" : "transparent",
                    color: active ? "#ffffff" : "#475569",
                    boxShadow: active ? "0 2px 8px rgba(34,197,94,0.3)" : "none",
                  }}
                >
                  {cycle.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Per-Message Rates Info Banner (matching aisensy.com/pricing) */}
      {showRates && (
        <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
              📊 Meta Per-Message Rates Card (AiSensy Standard Benchmark)
            </span>
            <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, background: "#dcfce7", padding: "2px 8px", borderRadius: 12 }}>
              1st 1,000 Service messages every month are FREE
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 10 }}>
            {[
              { label: "Marketing", rate: "₹1.09", desc: "Broadcasts, offers & re-engagement" },
              { label: "Utility", rate: "₹0.145", desc: "Order alerts, OTPs & delivery status" },
              { label: "Authentication", rate: "₹0.145", desc: "Login codes & verification OTPs" },
              { label: "Service", rate: "₹0.145", desc: "User-initiated customer support chats" },
            ].map(item => (
              <div key={item.label} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#075e54", marginTop: 2 }}>{item.rate}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,235px),1fr))",
          gap: 16,
          alignItems: "stretch",
          marginBottom: 80, // Space for the fixed bottom checkout bar
        }}
      >
        {sorted.map(plan => {
          const current = plan.slug === currentSlug
          const isSelected = selectedPlanId === plan.id
          const free = Number(plan.monthlyPrice) === 0
          const state = action(plan)
          const meta = TIER_META[plan.slug] || {
            subtitle: plan.description || "WhatsApp API",
            speed: "40 msgs / second",
            tags: "Tags & attributes",
            attributes: "Attributes",
            segments: "Audience Segments",
            lists: "Lists",
            team: "Team seats included",
            highlights: [],
          }
          const priceInfo = getPlanPrice(plan, period)

          return (
            <article
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              style={{
                position: "relative",
                background: isSelected ? "#ffffff" : "#ffffff",
                border: isSelected
                  ? "2px solid #22c55e"
                  : current
                  ? "2px solid #0e8b71"
                  : plan.isPopular
                  ? "1.5px solid #86efac"
                  : "1px solid #e2e8f0",
                boxShadow: isSelected
                  ? "0 8px 24px -4px rgba(34,197,94,0.22), 0 0 0 1px #22c55e"
                  : "0 2px 6px rgba(0,0,0,0.04)",
                borderRadius: 16,
                padding: "20px 18px",
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
                transition: "all .2s ease",
              }}
            >
              {/* Most Popular / New Badges */}
              {plan.isPopular && (
                <span
                  style={{
                    position: "absolute",
                    top: -11,
                    left: 18,
                    background: "#22c55e",
                    color: "#ffffff",
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 12,
                    padding: "3px 10px",
                    boxShadow: "0 2px 6px rgba(34,197,94,0.35)",
                  }}
                >
                  ⭐ MOST POPULAR
                </span>
              )}
              {meta.badge && !plan.isPopular && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    left: 18,
                    background: meta.badge === "+ New" ? "#f59e0b" : "#0284c7",
                    color: "#ffffff",
                    fontSize: 9,
                    fontWeight: 800,
                    borderRadius: 10,
                    padding: "2px 8px",
                  }}
                >
                  {meta.badge}
                </span>
              )}

              {/* Card Header & Radio Circle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{meta.subtitle}</div>
                </div>

                {/* Radio selection circle */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: isSelected ? "6px solid #22c55e" : "2px solid #cbd5e1",
                    background: "#ffffff",
                    boxSizing: "border-box",
                    flexShrink: 0,
                    marginTop: 2,
                    transition: "all .15s ease",
                  }}
                />
              </div>

              {/* Price Block */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: "Sora,sans-serif", fontSize: 28, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
                  {priceInfo.label}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginTop: 4 }}>
                  {priceInfo.billedNote}
                </div>
              </div>

              {/* Value Badge (AiSensy Highlight) */}
              {meta.valueBadge && (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 6,
                    padding: "4px 8px",
                    marginTop: 10,
                    textAlign: "center",
                  }}
                >
                  {meta.valueBadge}
                </div>
              )}

              {/* Capacity Specs (Messages, Speed, Tags, Members) */}
              <div
                style={{
                  fontSize: 11,
                  color: "#334155",
                  margin: "12px 0",
                  lineHeight: 1.6,
                  background: isSelected ? "#f0fdf4" : "#f8fafc",
                  border: `1px solid ${isSelected ? "#bbf7d0" : "#f1f5f9"}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div>👥 {limit(plan.maxUsers, "Team Seats")} · 📱 {limit(plan.maxPhoneNumbers, "Numbers")}</div>
                <div>⚡ <strong>Speed:</strong> {meta.speed}</div>
                <div>🏷️ <strong>Tags:</strong> {meta.tags}</div>
                <div>🎯 <strong>Audience:</strong> {meta.segments} · {meta.lists}</div>
              </div>

              {/* Feature Checklist */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", margin: "4px 0" }}>
                {plan.slug === "starter"
                  ? "All Free Forever features, plus:"
                  : plan.slug === "business"
                  ? "All Basic features, plus:"
                  : plan.slug === "professional"
                  ? "All Pro features, plus:"
                  : plan.slug === "enterprise"
                  ? "All Premium features, plus:"
                  : "Includes:"}
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
                {meta.highlights.map(h => (
                  <li key={h} style={{ fontSize: 12, color: "#334155", padding: "3px 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              {/* Per-Message Mini Rate Card inside each card */}
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 11, color: "#64748b" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 3, fontSize: 10, textTransform: "uppercase" }}>
                  Per-Message Rates:
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Marketing: <strong>₹1.09</strong></span>
                  <span>Utility: <strong>₹0.145</strong></span>
                  <span>Auth: <strong>₹0.145</strong></span>
                </div>
              </div>

              {/* Action Button inside card */}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  setSelectedPlanId(plan.id)
                  setConfirm(plan)
                }}
                disabled={state.disabled || Boolean(busyId)}
                style={{
                  marginTop: 14,
                  border: isSelected ? "0" : "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: "11px 14px",
                  background: state.disabled
                    ? "#e2e8f0"
                    : isSelected
                    ? "#22c55e"
                    : "#ffffff",
                  color: state.disabled
                    ? "#64748b"
                    : isSelected
                    ? "#ffffff"
                    : "#0f172a",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: state.disabled ? "default" : "pointer",
                  transition: "all .15s ease",
                }}
              >
                {busyId === plan.id
                  ? "Creating invoice…"
                  : isSelected && !current
                  ? "✓ Chosen Plan"
                  : current
                  ? "Current Plan"
                  : "Select Plan"}
              </button>
            </article>
          )
        })}
      </div>

      {/* Comparison Toggle Button */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setCompare(value => !value)}
          style={{
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 12,
            fontWeight: 700,
            color: "#075e54",
            cursor: "pointer",
          }}
        >
          {compare ? "Hide comparison" : "Compare all features"} (ZKWAConnect vs AiSensy parity)
        </button>
      </div>

      {/* Full Feature Comparison Matrix */}
      {compare && (
        <div style={{ overflowX: "auto", marginBottom: 30, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#0f172a" }}>Feature &amp; Capacity</th>
                {sorted.map(plan => (
                  <th key={plan.id} style={{ padding: "12px 14px", color: plan.slug === currentSlug ? "#16a34a" : "#0f172a" }}>
                    {plan.name}
                    {plan.isPopular ? " ⭐" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ["Team members", "maxUsers", "users"],
                ["WhatsApp numbers", "maxPhoneNumbers", "numbers"],
                ["Messages / month", "maxMessages", "messages"],
              ] as const).map(([label, key]) => (
                <tr key={key} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700, color: "#334155" }}>{label}</td>
                  {sorted.map(plan => (
                    <td key={plan.id} style={{ textAlign: "center", padding: 9, color: "#0f172a" }}>
                      {plan[key] === null || plan[key] === undefined ? "Unlimited" : Number(plan[key]).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: "#334155" }}>Messaging Speed (Throughput)</td>
                {sorted.map(plan => (
                  <td key={plan.id} style={{ textAlign: "center", padding: 9, fontWeight: 700, color: "#075e54" }}>
                    {TIER_META[plan.slug]?.speed || "40 msgs/s"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: "#334155" }}>Tags &amp; Attributes</td>
                {sorted.map(plan => (
                  <td key={plan.id} style={{ textAlign: "center", padding: 9 }}>
                    {TIER_META[plan.slug]?.tags || "Included"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: "#334155" }}>FlowBuilder Visual Canvas</td>
                {sorted.map(plan => (
                  <td key={plan.id} style={{ textAlign: "center", padding: 9, color: ["business", "professional", "enterprise"].includes(plan.slug) ? "#16a34a" : "#64748b", fontWeight: 700 }}>
                    {["business", "professional", "enterprise"].includes(plan.slug) ? "Unlimited (FREE)" : "Add-on (₹2,500/mo)"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: "#334155" }}>Developer API &amp; Webhooks</td>
                {sorted.map(plan => (
                  <td key={plan.id} style={{ textAlign: "center", padding: 9, color: plan.features.includes("api") ? "#16a34a" : "#cbd5e1", fontWeight: 800 }}>
                    {plan.features.includes("api") ? "✓" : "–"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontWeight: 700, color: "#334155" }}>Instagram DM Inbox</td>
                {sorted.map(plan => (
                  <td key={plan.id} style={{ textAlign: "center", padding: 9, color: plan.features.includes("instagram") ? "#16a34a" : "#cbd5e1", fontWeight: 800 }}>
                    {plan.features.includes("instagram") ? "✓" : "–"}
                  </td>
                ))}
              </tr>
              {GROUPS.map(group => (
                <Fragment key={group}>
                  <tr>
                    <td
                      colSpan={sorted.length + 1}
                      style={{ padding: "12px 14px 6px", fontSize: 11, fontWeight: 800, color: "#075e54", textTransform: "uppercase" }}
                    >
                      {group}
                    </td>
                  </tr>
                  {FEATURE_KEYS.filter(key => FEATURES[key].group === group).map(key => (
                    <tr key={key} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 14px", color: "#334155" }} title={FEATURES[key].description}>
                        {FEATURES[key].label}
                      </td>
                      {sorted.map(plan => (
                        <td
                          key={plan.id}
                          style={{
                            textAlign: "center",
                            padding: 8,
                            color: plan.features.includes(key) ? "#16a34a" : "#cbd5e1",
                            fontWeight: 800,
                          }}
                        >
                          {plan.features.includes(key) ? "✓" : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AiSensy Exact Bottom Sticky Bar */}
      <aside
        aria-label="Checkout action bar"
        style={{
          position: "sticky",
          bottom: 12,
          zIndex: 60,
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
          borderRadius: 16,
          padding: "12px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Fair Use Policy */}
        <div style={{ fontSize: 11, color: "#64748b" }}>
          <strong>Fair Use Policy</strong> &nbsp; *Upto 200 Team Members &nbsp; **Upto 500 Tags &nbsp; ***Upto 100 Attributes
        </div>

        {/* Action Row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>SELECTED PLAN</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                {activeSelectedPlan?.name || "Pro"} Plan
                <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", marginLeft: 6 }}>
                  ({TIER_META[activeSelectedPlan?.slug || "business"]?.subtitle || "Growth Marketer"})
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>BILLING CYCLE</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                {period === "QUARTERLY" ? "Quarterly (5% Off)" : period === "ANNUAL" ? "Yearly (10% Off)" : "Monthly"}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>TOTAL</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a" }}>
                {selectedPriceInfo ? money(selectedPriceInfo.total) : "₹0.00"}
                <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>
                  {period === "QUARTERLY" ? "/ quarter + GST" : period === "ANNUAL" ? "/ year + GST" : "/ month + GST"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                if (activeSelectedPlan && !selectedPlanAction.disabled) {
                  setConfirm(activeSelectedPlan)
                }
              }}
              disabled={selectedPlanAction.disabled || Boolean(busyId)}
              style={{
                border: 0,
                borderRadius: 10,
                padding: "12px 24px",
                background: selectedPlanAction.disabled ? "#e2e8f0" : "#22c55e",
                color: selectedPlanAction.disabled ? "#64748b" : "#ffffff",
                fontWeight: 800,
                fontSize: 14,
                cursor: selectedPlanAction.disabled ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: selectedPlanAction.disabled ? "none" : "0 4px 12px rgba(34,197,94,0.35)",
              }}
            >
              <span>{busyId === activeSelectedPlan?.id ? "Creating invoice…" : selectedPlanAction.label.includes("Current") ? "Your Current Plan" : "Proceed to Checkout"}</span>
              {!selectedPlanAction.disabled && <span>→</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Confirmation Modal */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Choose ${confirm.name}`}
          onClick={() => setConfirm(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.6)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 500,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 19, margin: 0, color: "#0f172a" }}>
                  {confirm.name} Plan ({TIER_META[confirm.slug]?.subtitle || "Growth"})
                </h2>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  Billing Cycle: <strong>{period === "QUARTERLY" ? "Quarterly (5% Off)" : period === "ANNUAL" ? "Yearly (10% Off)" : "Monthly"}</strong>
                </div>
              </div>
              <button
                onClick={() => setConfirm(null)}
                style={{ border: 0, background: "none", fontSize: 16, color: "#64748b", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, margin: "14px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#334155" }}>
                <span>Base Plan Price:</span>
                <strong>{money(getPlanPrice(confirm, period).total)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#334155", marginTop: 4 }}>
                <span>GST (18% Input Tax Credit):</span>
                <span>{money(Math.round(getPlanPrice(confirm, period).total * 0.18 * 100) / 100)}</span>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                <span>Total Due:</span>
                <span style={{ color: "#16a34a" }}>
                  {money(Math.round(getPlanPrice(confirm, period).total * 1.18 * 100) / 100)}
                </span>
              </div>
            </div>

            {gained.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", margin: "14px 0 6px" }}>
                  ✨ You get {gained.length} new feature{gained.length === 1 ? "" : "s"}
                </div>
                {gained.map(feature => (
                  <div key={feature} style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: "1px solid #f1f5f9" }}>
                    <span style={{ color: "#16a34a" }}>✓</span>
                    <span>
                      <strong style={{ fontSize: 13, color: "#183633" }}>{FEATURES[feature].label}</strong>
                      <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>{FEATURES[feature].description}</span>
                    </span>
                  </div>
                ))}
              </>
            )}

            {currentLimits && (
              <div style={{ fontSize: 12, color: "#334155", margin: "14px 0 0", background: "#f8fafc", borderRadius: 8, padding: 10, lineHeight: 1.8 }}>
                {([
                  ["Team members", currentLimits.users, confirm.maxUsers],
                  ["WhatsApp numbers", currentLimits.numbers, confirm.maxPhoneNumbers],
                  ["Messages / month", currentLimits.messages, confirm.maxMessages],
                ] as const).map(([label, from, to]) => (
                  <div key={label}>
                    {label}: {from === null ? "Unlimited" : from.toLocaleString("en-IN")} →{" "}
                    <strong style={{ color: (to ?? Infinity) > (from ?? Infinity) ? "#166534" : "#183633" }}>
                      {to === null || to === undefined ? "Unlimited" : to.toLocaleString("en-IN")}
                    </strong>
                  </div>
                ))}
              </div>
            )}

            {lost.length > 0 && (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: 10, marginTop: 10 }}>
                Not included in {confirm.name}: {lost.map(feature => FEATURES[feature].label).join(", ")}.
              </div>
            )}

            <p style={{ fontSize: 11, color: "#94a3b8", margin: "14px 0 0" }}>
              A GST invoice will be generated. You can pay via instant UPI QR, NetBanking, or Cards. Your new plan starts as soon as payment is confirmed.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => {
                  const plan = confirm
                  setConfirm(null)
                  onBuy(plan)
                }}
                style={{
                  flex: 1,
                  border: 0,
                  borderRadius: 10,
                  padding: "12px 16px",
                  background: "#22c55e",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Continue to Payment →
              </button>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: "12px 16px",
                  background: "#ffffff",
                  color: "#64748b",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
