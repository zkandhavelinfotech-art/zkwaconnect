"use client"

import { useCallback, useEffect, useState } from "react"
import { WhatsAppOnboardingManagementModule } from "@/components/whatsapp/WhatsAppOnboardingManagementModule"

type Account = {
  id: string
  wabaId: string
  name: string
  status: string
  isActive: boolean
}

type SettingsData = {
  metaConnected: boolean
  accounts: Account[]
  warnings: string[]
  canEdit: boolean
  canManageConnection: boolean
  webhook: { lastEventAt: string | null; lastEventType: string | null; events24h: number }
  plan: {
    name: string
    status: string
    monthlyPrice: string | number
    maxMessages: number | null
    maxPhoneNumbers: number | null
    maxUsers: number | null
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    messagesUsed: number
  } | null
}

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 20,
}

const cardHead: React.CSSProperties = {
  fontFamily: "Sora, sans-serif",
  fontSize: 15,
  fontWeight: 700,
  color: "#0f172a",
  margin: "0 0 4px",
}

function PlanBadge({ value }: { value: string | null }) {
  if (!value) return null
  const isGood = value === "ACTIVE"
  return (
    <span
      style={{
        background: isGood ? "#dcfce7" : "#fee2e2",
        color: isGood ? "#15803d" : "#b91c1c",
        borderRadius: 20,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {value}
    </span>
  )
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/settings/whatsapp")
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load settings.")
      setData(body)
    } catch (reason: any) {
      setError(reason instanceof Error ? reason.message : "Could not load settings.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const plan = data?.plan
  const usagePct = plan?.maxMessages
    ? Math.min(100, Math.round((plan.messagesUsed / plan.maxMessages) * 100))
    : 0

  const archivedAccounts = data?.accounts?.filter(account => !account.isActive) || []

  const handleDeleteArchived = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete '${name}' from this workspace? This will permanently remove the duplicate record from ZKWAConnect.`)) return
    try {
      const res = await fetch(`/api/whatsapp/accounts/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (res.ok) {
        alert(json.message || "Account removed.")
        load()
      } else {
        alert(json.error || "Could not delete account.")
      }
    } catch (err: any) {
      alert(err.message || "Network error.")
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>
      {/* PAGE HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>
            WhatsApp Settings &amp; Management Hub
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Official Meta Cloud API connection, business profile, numbers, 2-Step PIN, and real-time health diagnostics.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "#ffffff",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              color: "#334155",
            }}
          >
            {loading ? "Syncing…" : "↻ Refresh Workspace"}
          </button>
        </div>
      </div>

      {/* ERROR & WARNING ALERTS */}
      {error && (
        <div role="alert" style={{ padding: 12, background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}
      {data?.warnings?.map(warning => (
        <div key={warning} style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ⚠️ {warning}
        </div>
      ))}

      {/* PRIMARY WHATSAPP ONBOARDING & MANAGEMENT MODULE */}
      <div style={{ marginBottom: 24 }}>
        <WhatsAppOnboardingManagementModule />
      </div>

      {/* SECONDARY OPERATIONAL TILES: PLAN USAGE & DEVELOPER API */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        {/* PLAN & USAGE */}
        <section style={{ ...card, borderTop: "3px solid #16a34a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <h2 style={cardHead}>Subscription Plan &amp; Quota</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                Monthly message allocations and workspace tier.
              </p>
            </div>
            {plan && <PlanBadge value={plan.status} />}
          </div>

          {plan ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{plan.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                  ₹{Number(plan.monthlyPrice).toLocaleString("en-IN")}/mo
                </span>
              </div>

              {plan.maxMessages ? (
                <>
                  <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", margin: "10px 0 6px" }}>
                    <div style={{ width: `${usagePct}%`, height: "100%", background: usagePct > 90 ? "#dc2626" : "#16a34a" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                    <span>{plan.messagesUsed.toLocaleString()} / {plan.maxMessages.toLocaleString()} conversations</span>
                    <span>{usagePct}% used</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#64748b", margin: "10px 0 16px" }}>
                  {plan.messagesUsed.toLocaleString()} conversations sent this billing cycle.
                </div>
              )}

              <a
                href="/app/billing"
                style={{
                  display: "inline-block",
                  background: "#0f172a",
                  color: "#ffffff",
                  textDecoration: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Manage Billing &amp; Invoices →
              </a>
            </div>
          ) : (
            <div style={{ padding: "16px 0", color: "#64748b", fontSize: 13 }}>
              No active subscription found. <a href="/app/billing" style={{ color: "#16a34a", fontWeight: 700 }}>Choose a plan →</a>
            </div>
          )}
        </section>

        {/* DEVELOPER API & WEBHOOK INTEGRATIONS */}
        <section style={{ ...card, borderTop: "3px solid #2563eb" }}>
          <h2 style={cardHead}>Developer API &amp; Webhooks</h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
            Connect custom CRMs, internal databases, or checkout webhooks via REST API.
          </p>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: 8, fontSize: 12, fontFamily: "monospace", color: "#0f172a", fontWeight: 700, marginBottom: 14 }}>
            https://api.zkwaconnect.in/api/v1
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href="/app/developers"
              style={{
                display: "inline-block",
                background: "#2563eb",
                color: "#ffffff",
                textDecoration: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              API Keys &amp; Webhook Endpoints →
            </a>
          </div>
        </section>
      </div>

      {/* ARCHIVED WABA RECORDS (IF APPLICABLE) */}
      {archivedAccounts.length > 0 && (
        <div style={{ marginTop: 24, ...card, background: "#f8fafc" }}>
          <h2 style={cardHead}>Historic / Archived WhatsApp Accounts</h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 12px" }}>
            Retained for historic message receipts, logs, and template records. Inactive accounts do not route live messages.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {archivedAccounts.map(acc => (
              <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}>
                <div>
                  <strong>{acc.name}</strong> <span style={{ color: "#64748b" }}>· WABA ID: <code>{acc.wabaId}</code></span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>ARCHIVED</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteArchived(acc.id, acc.name)}
                    style={{
                      background: "#fee2e2",
                      border: "1px solid #fca5a5",
                      color: "#b91c1c",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🗑️ Delete from App
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
