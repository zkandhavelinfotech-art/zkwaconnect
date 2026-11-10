"use client"
import { useEffect, useState } from "react"

type ProfitSummary = {
  totalNetProfit: number
  totalGrossRevenue: number
  totalSubRevenue: number
  totalFlowRevenue: number
  totalMessageBilled: number
  totalMetaPaid: number
  totalMessageCommission: number
  overallMargin: number
  totalMessagesSent: number
}

type ClientProfit = {
  id: string
  name: string
  slug: string
  walletBalance: number
  planName: string
  billingInterval: string
  subRevenue: number
  flowAddonRevenue: number
  clientMessageBilled: number
  metaBaseCost: number
  messageCommissionProfit: number
  totalClientProfit: number
  marginPercent: number
  messages: {
    marketing: number
    utility: number
    auth: number
    total: number
  }
}

type ProfitData = {
  interval: string
  currency: string
  startDate: string
  summary: ProfitSummary
  clients: ClientProfit[]
}

const formatInr = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function SaasProfitDashboard() {
  const [data, setData] = useState<ProfitData | null>(null)
  const [interval, setInterval] = useState<"monthly" | "quarterly" | "yearly" | "all">("monthly")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadProfit(selectedInterval = interval) {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/admin/profit?interval=${selectedInterval}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Failed to load profit data.")
      setData(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load profit data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfit(interval)
  }, [interval])

  function exportCsv() {
    if (!data || !data.clients.length) return
    const headers = ["Client Name", "Slug", "Plan", "Billing Interval", "Subscription Rev", "Flow Addon Rev", "Messages Sent", "Client Billed", "Meta Base Cost", "Message Commission Profit", "Total Net Profit", "Margin %"]
    const rows = data.clients.map(c => [
      `"${c.name}"`,
      c.slug,
      c.planName,
      c.billingInterval,
      c.subRevenue,
      c.flowAddonRevenue,
      c.messages.total,
      c.clientMessageBilled,
      c.metaBaseCost,
      c.messageCommissionProfit,
      c.totalClientProfit,
      `${c.marginPercent}%`,
    ])
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `zkwaconnect-saas-profit-${interval}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header & Interval Switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, margin: "0 0 4px", color: "#fff" }}>
            💰 SaaS Product Owner Profit Engine
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>
            Real-time breakdown of plan subscriptions, client message charges (AiSensy rates), outgoing Meta costs, and net owner profits.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,.06)", padding: 4, borderRadius: 8, border: "1px solid rgba(255,255,255,.1)" }}>
            {(["monthly", "quarterly", "yearly", "all"] as const).map(i => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                style={{
                  border: 0,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: interval === i ? "#25d366" : "transparent",
                  color: interval === i ? "#053d36" : "#e2e8f0",
                  textTransform: "capitalize",
                }}
              >
                {i === "all" ? "All Time" : i}
              </button>
            ))}
          </div>

          <button
            onClick={exportCsv}
            disabled={loading || !data?.clients.length}
            style={{
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 8,
              padding: "7px 14px",
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "rgba(239,68,68,.15)", color: "#fca5a5", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Top 4 KPI Cards */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 }}>
          <div style={{ background: "linear-gradient(145deg,rgba(37,211,102,.12),rgba(7,94,84,.2))", border: "1.5px solid #25d366", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#86efac", textTransform: "uppercase", letterSpacing: ".06em" }}>
              Total Net Profit ({interval})
            </div>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 28, fontWeight: 900, color: "#fff", margin: "8px 0 4px" }}>
              {formatInr(data.summary.totalNetProfit)}
            </div>
            <div style={{ fontSize: 11, color: "#86efac", fontWeight: 700 }}>
              {data.summary.overallMargin}% Net Profit Margin
            </div>
          </div>

          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.6)", textTransform: "uppercase" }}>
              Plan Subscriptions Revenue
            </div>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#38bdf8", margin: "8px 0 4px" }}>
              {formatInr(data.summary.totalSubRevenue)}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
              Monthly, Quarterly &amp; Yearly plans
            </div>
          </div>

          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.6)", textTransform: "uppercase" }}>
              Message Markup Commission
            </div>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#a78bfa", margin: "8px 0 4px" }}>
              {formatInr(data.summary.totalMessageCommission)}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
              Billed: {formatInr(data.summary.totalMessageBilled)} · Meta Base: {formatInr(data.summary.totalMetaPaid)}
            </div>
          </div>

          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.6)", textTransform: "uppercase" }}>
              FlowBuilder Add-on Revenue
            </div>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#facc15", margin: "8px 0 4px" }}>
              {formatInr(data.summary.totalFlowRevenue)}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
              {data.summary.totalMessagesSent.toLocaleString("en-IN")} total messages dispatched
            </div>
          </div>
        </div>
      )}

      {/* Rate Commission Comparison Card */}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#86efac", marginBottom: 8 }}>
          ⚡ Meta Cloud API Per-Message Rate &amp; Commission Structure (Per Message):
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 10, fontSize: 12 }}>
          <div style={{ background: "rgba(255,255,255,.04)", padding: "8px 12px", borderRadius: 8 }}>
            <strong>Marketing:</strong> Client: ₹1.0900 · Meta Base: ₹0.7846 · <span style={{ color: "#86efac", fontWeight: 800 }}>Owner Profit: +₹0.3054</span>
          </div>
          <div style={{ background: "rgba(255,255,255,.04)", padding: "8px 12px", borderRadius: 8 }}>
            <strong>Utility:</strong> Client: ₹0.1450 · Meta Base: ₹0.1150 · <span style={{ color: "#86efac", fontWeight: 800 }}>Owner Profit: +₹0.0300</span>
          </div>
          <div style={{ background: "rgba(255,255,255,.04)", padding: "8px 12px", borderRadius: 8 }}>
            <strong>Authentication:</strong> Client: ₹0.1450 · Meta Base: ₹0.1150 · <span style={{ color: "#86efac", fontWeight: 800 }}>Owner Profit: +₹0.0300</span>
          </div>
          <div style={{ background: "rgba(255,255,255,.04)", padding: "8px 12px", borderRadius: 8 }}>
            <strong>Service:</strong> Client: ₹0.1450 (1st 1k free) · <span style={{ color: "#86efac", fontWeight: 800 }}>Owner Profit: +₹0.0300</span>
          </div>
        </div>
      </div>

      {/* Per-Client Profit Breakdown Table */}
      <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, margin: 0, color: "#fff", fontWeight: 800 }}>
            Client-by-Client Profit Breakdown ({interval.toUpperCase()})
          </h3>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
            {data?.clients.length || 0} Workspaces
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.6)" }}>
                <th style={{ padding: "10px 14px", fontWeight: 700 }}>Client / Workspace</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Active Plan</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Sub Revenue</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Flow Add-on</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Messages Sent</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Client Billed</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Meta Base Cost</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Msg Commission</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#86efac" }}>Net Owner Profit</th>
                <th style={{ padding: "10px 12px", fontWeight: 700 }}>Margin %</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,.5)" }}>
                    Loading profit analytics…
                  </td>
                </tr>
              ) : !data?.clients.length ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,.5)" }}>
                    No client transactions recorded yet.
                  </td>
                </tr>
              ) : (
                data.clients.map(client => (
                  <tr key={client.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 800, color: "#fff" }}>{client.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{client.slug}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: "rgba(255,255,255,.08)", padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                        {client.planName}
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginLeft: 6 }}>
                        {client.billingInterval}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#38bdf8" }}>
                      {formatInr(client.subRevenue)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#facc15" }}>
                      {formatInr(client.flowAddonRevenue)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "rgba(255,255,255,.7)" }}>
                      {client.messages.total.toLocaleString("en-IN")}<br />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>
                        M:{client.messages.marketing} U:{client.messages.utility} A:{client.messages.auth}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {formatInr(client.clientMessageBilled)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#f87171" }}>
                      {formatInr(client.metaBaseCost)}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#a78bfa" }}>
                      +{formatInr(client.messageCommissionProfit)}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 900, color: "#4ade80", fontSize: 13 }}>
                      {formatInr(client.totalClientProfit)}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: client.marginPercent >= 50 ? "#86efac" : "#fcd34d" }}>
                      {client.marginPercent}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

