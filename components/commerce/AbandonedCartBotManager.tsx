"use client"
import { useEffect, useState } from "react"

export function AbandonedCartBotManager() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [enabled, setEnabled] = useState(true)
  const [delayMinutes, setDelayMinutes] = useState(30)
  const [discountCode, setDiscountCode] = useState("SAVE10")
  const [discountPercent, setDiscountPercent] = useState(10)

  const [stats, setStats] = useState<{
    abandonedCount: number
    recoveredCount: number
    lostRevenue: number
    recoveredRevenue: number
    recoveryRate: number
  }>({
    abandonedCount: 0,
    recoveredCount: 0,
    lostRevenue: 0,
    recoveredRevenue: 0,
    recoveryRate: 0,
  })

  const [abandonedOrders, setAbandonedOrders] = useState<
    {
      id: string
      orderNumber: string | null
      customerName: string | null
      customerPhone: string | null
      total: number
      itemsSummary: string
      createdAt: string
    }[]
  >([])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch("/api/commerce/abandoned-cart")
      const data = await res.json()
      if (res.ok) {
        if (data.config) {
          setEnabled(data.config.enabled ?? true)
          setDelayMinutes(data.config.delayMinutes ?? 30)
          setDiscountCode(data.config.discountCode ?? "SAVE10")
          setDiscountPercent(data.config.discountPercent ?? 10)
        }
        if (data.stats) setStats(data.stats)
        if (data.abandonedOrders) setAbandonedOrders(data.abandonedOrders)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSaveSettings() {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const res = await fetch("/api/commerce/abandoned-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          enabled,
          delayMinutes: Number(delayMinutes),
          discountCode,
          discountPercent: Number(discountPercent),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to save settings.")
      setMessage(body.message || "Settings updated.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.")
    } finally {
      setSaving(false)
    }
  }

  async function handleRunSweep() {
    setSweeping(true)
    setError("")
    setMessage("")
    try {
      const res = await fetch("/api/commerce/abandoned-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sweep_recovery" }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to execute recovery sweep.")
      setMessage(body.message)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed.")
    } finally {
      setSweeping(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "#64748b", fontSize: 13 }}>Loading Abandoned Cart Bot…</div>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {message && (
        <div style={{ padding: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 12 }}>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Abandoned Carts</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#b45309", marginTop: 4 }}>
            {stats.abandonedCount}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            ₹{stats.lostRevenue.toLocaleString("en-IN")} pending in dropped carts
          </div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Recovered Orders</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#16a34a", marginTop: 4 }}>
            {stats.recoveredCount}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            ₹{stats.recoveredRevenue.toLocaleString("en-IN")} saved revenue
          </div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Recovery Rate</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 800, color: "#075e54", marginTop: 4 }}>
            {stats.recoveryRate}%
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Industry benchmark: ~18%</div>
        </div>
      </div>

      {/* Configuration & Message Preview Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
        {/* Settings Box */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
              🤖 Bot Trigger Rules
            </h3>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: enabled ? "#16a34a" : "#64748b" }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              {enabled ? "Active" : "Paused"}
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                Send WhatsApp Alert After Inactivity:
              </label>
              <select
                value={delayMinutes}
                onChange={e => setDelayMinutes(Number(e.target.value))}
                style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
              >
                <option value={15}>15 minutes after checkout started</option>
                <option value={30}>30 minutes (Recommended)</option>
                <option value={60}>1 hour after drop-off</option>
                <option value={120}>2 hours after drop-off</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                Incentive Discount Code:
              </label>
              <input
                value={discountCode}
                onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="e.g. SAVE10"
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                Discount Percentage (%):
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={discountPercent}
                onChange={e => setDiscountPercent(Number(e.target.value))}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={saving}
                style={{
                  flex: 1,
                  border: 0,
                  borderRadius: 8,
                  padding: "10px 14px",
                  background: "#075e54",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving…" : "Save Automation Settings"}
              </button>
              <button
                type="button"
                onClick={handleRunSweep}
                disabled={sweeping}
                style={{
                  border: "1px solid #075e54",
                  borderRadius: 8,
                  padding: "10px 14px",
                  background: "#ffffff",
                  color: "#075e54",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {sweeping ? "Sweeping…" : "⚡ Run Recovery Sweep Now"}
              </button>
            </div>
          </div>
        </div>

        {/* Live Preview Box */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 10px" }}>
            📱 Customer WhatsApp Preview
          </h3>
          <div style={{ background: "#efeae2", borderRadius: 12, padding: 16, minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ background: "#d9fdd3", borderRadius: "10px 10px 2px 10px", padding: "10px 12px", fontSize: 12.5, color: "#111b21", lineHeight: 1.5, boxShadow: "0 1px 1px rgba(0,0,0,0.1)" }}>
              <div>Hi Rahul! 👋 We noticed you left <strong>2 × Wireless Headphones</strong> in your cart (Total: ₹2,499.00).</div>
              <div style={{ marginTop: 8 }}>
                Complete your order now with <strong>{discountCode || "SAVE10"}</strong> for an exclusive {discountPercent}% discount!
              </div>
              <div style={{ marginTop: 8, color: "#0369a1", textDecoration: "underline" }}>
                https://zkwaconnect.in/pay/WA-98F12X
              </div>
              <div style={{ fontSize: 9.5, color: "#667781", textAlign: "right", marginTop: 4 }}>
                {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ✓✓
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
            Alerts include direct payment links with UPI QR, cards, and NetBanking pre-filled.
          </div>
        </div>
      </div>

      {/* Recent Abandoned Carts Table */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>
          🛒 Pending Abandoned Carts ({abandonedOrders.length})
        </h3>
        {!abandonedOrders.length ? (
          <div style={{ fontSize: 12, color: "#94a3b8", padding: "16px 0" }}>
            No abandoned carts right now. Great job!
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#64748b" }}>
                  <th style={{ padding: "8px 10px" }}>Order</th>
                  <th style={{ padding: "8px 10px" }}>Customer</th>
                  <th style={{ padding: "8px 10px" }}>Items Left</th>
                  <th style={{ padding: "8px 10px" }}>Cart Total</th>
                  <th style={{ padding: "8px 10px" }}>Dropped At</th>
                </tr>
              </thead>
              <tbody>
                {abandonedOrders.map(order => (
                  <tr key={order.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>
                      {order.orderNumber || order.id.slice(-6)}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {order.customerName || "Customer"}
                      <div style={{ color: "#64748b", fontSize: 11 }}>+{order.customerPhone}</div>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#334155" }}>{order.itemsSummary}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#075e54" }}>
                      ₹{order.total.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#64748b" }}>
                      {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
