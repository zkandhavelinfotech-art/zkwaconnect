"use client"
import { FEATURES, cheapestWith, type FeatureKey, type PlanSummary } from "@/lib/billing/features"

// Shown instead of a page the workspace's plan doesn't include.
export function LockedFeature({ feature, plans, canUpgrade, currentPlan }: { feature: FeatureKey; plans: PlanSummary[]; canUpgrade: boolean; currentPlan: string | null }) {
  const info = FEATURES[feature]
  const plan = cheapestWith(plans, feature)
  const others = plan ? plan.features.filter(key => key !== feature && FEATURES[key].group !== "Essentials").slice(0, 6) : []
  return <div style={{ maxWidth: 620, margin: "40px auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 28, textAlign: "center", boxShadow: "0 4px 20px rgba(15,23,42,.06)" }}>
    <div style={{ fontSize: 40 }}>🔒</div>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, color: "#0f172a", margin: "8px 0 6px" }}>{info.label}</h1>
    <p style={{ fontSize: 14, color: "#475569", margin: "0 0 14px", lineHeight: 1.6 }}>{info.description}</p>
    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 18px" }}>
      {plan ? <>Available on the <strong style={{ color: "#075e54" }}>{plan.name}</strong> plan and above{currentPlan ? <> — you&apos;re on <strong>{currentPlan}</strong></> : null}.</> : "Not included in your current plan."}</p>
    {others.length > 0 && <div style={{ textAlign: "left", background: "#f7faf9", borderRadius: 10, padding: "12px 16px", margin: "0 auto 18px", maxWidth: 420 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#526763", marginBottom: 6 }}>{plan!.name} also includes</div>
      {others.map(key => <div key={key} style={{ fontSize: 13, color: "#334155", padding: "2px 0" }}>✓ {FEATURES[key].label}</div>)}
    </div>}
    {canUpgrade ? <a href={`/app/billing?plan=${plan?.slug || ""}#plans`} style={{ display: "inline-block", background: "#075e54", color: "#fff", borderRadius: 8, padding: "11px 20px", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
      {plan ? `Upgrade to ${plan.name} — ₹${plan.monthlyPrice.toLocaleString("en-IN")}/mo` : "See plans"}</a>
      : <p style={{ fontSize: 13, color: "#92400e" }}>Ask your workspace owner or admin to upgrade.</p>}
  </div>
}
