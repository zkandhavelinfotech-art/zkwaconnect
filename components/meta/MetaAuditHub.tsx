"use client"
import { useCallback, useEffect, useState } from "react"

type AuditData = {
  timestamp: string
  appConfig: {
    appId: string | null
    appIdValid: boolean
    hasSecret: boolean
    verifyTokenSet: boolean
    configIdSet: boolean
    callbackUrl: string
    redirectUri: string
  }
  webhookHandshakeOk: boolean
  facebookUser: { id: string; name: string } | null
  tokenError: string | null
  hasConnectedToken: boolean
  permissions: {
    allGranted: boolean
    granted: string[]
    missing: string[]
  }
  businesses: {
    id: string
    name: string
    verificationStatus: string
    isVerified: boolean
    legalName: string | null
  }[]
  discoveredWabas: {
    id: string
    name: string
    businessId: string
    businessName: string
    currency?: string
    timezone?: string
    reviewStatus?: string
    phones: {
      id: string
      display_phone_number: string
      verified_name?: string
      quality_rating?: string
      code_verification_status?: string
    }[]
  }[]
  activeWaba: {
    id: string
    wabaId: string
    name: string
    status: string
    phones: {
      id: string
      phoneNumberId: string
      phoneNumber: string
      displayName: string | null
      status: string
      verificationStatus: string | null
    }[]
  } | null
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "20px 22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
}

const headerStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "Sora, sans-serif",
  color: "#0f172a",
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "0 0 14px",
}

export function MetaAuditHub({ onConnected }: { onConnected?: () => void }) {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")

  const runAudit = useCallback(async () => {
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/meta/audit", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to load Meta diagnostic audit.")
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runAudit()
  }, [runAudit])

  async function connectWaba(wabaId: string, businessId: string) {
    setConnectingId(wabaId)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/onboarding/wabas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId, businessId: businessId || "direct" }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Could not connect account.")
      setNotice(`Successfully connected WhatsApp Account: ${body.name || wabaId}`)
      await runAudit()
      if (onConnected) onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect WABA.")
    } finally {
      setConnectingId(null)
    }
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 14 }}>
        Running live diagnostic scan against Meta Developer & Business APIs…
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Action Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
            Meta & WhatsApp Integration Audit
          </h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            Live status of your Meta Developer App, Business Portfolio Verification, and WhatsApp API accounts.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={runAudit}
            disabled={loading}
            style={{
              background: "#fff",
              border: "1.5px solid #cbd5e1",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              color: "#334155",
            }}
          >
            {loading ? "Scanning…" : "↻ Run Live Audit"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12, color: "#166534", fontSize: 13 }}>
          {notice}
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16 }}>
          {/* Card 1: Business Portfolio & Verification */}
          <div style={cardStyle}>
            <div style={headerStyle}>
              <span>🏢</span> Business Portfolios & Verification
            </div>
            {data.businesses.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                <p style={{ margin: "0 0 10px" }}>No Business Portfolios found for this login.</p>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: 10, borderRadius: 6, fontSize: 12, color: "#92400e" }}>
                  💡 <strong>Action Required:</strong> Make sure your Facebook user is invited to the client&apos;s Meta Business Suite at{" "}
                  <a href="https://business.facebook.com/settings/people" target="_blank" rel="noreferrer" style={{ color: "#b45309", fontWeight: 700 }}>
                    business.facebook.com
                  </a>.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {data.businesses.map(b => (
                  <div key={b.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: "#0f172a" }}>{b.name}</strong>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: b.isVerified ? "#dcfce7" : b.verificationStatus === "in_review" ? "#fef9c3" : "#fee2e2",
                          color: b.isVerified ? "#15803d" : b.verificationStatus === "in_review" ? "#a16207" : "#b91c1c",
                          textTransform: "uppercase",
                        }}
                      >
                        {b.isVerified ? "Verified ✓" : b.verificationStatus === "in_review" ? "In Review ⏳" : "Not Verified ✕"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>ID: {b.id}</div>
                    {b.legalName && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Legal: {b.legalName}</div>}
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={`https://business.facebook.com/settings/security?business_id=${b.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, fontWeight: 700, color: "#1877F2", textDecoration: "none" }}
                      >
                        Check Security Centre ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: Meta Developer App Health */}
          <div style={cardStyle}>
            <div style={headerStyle}>
              <span>🛠️</span> Meta Developer App
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
                <span style={{ color: "#64748b" }}>App ID</span>
                <code style={{ fontWeight: 700, color: "#0f172a" }}>{data.appConfig.appId || "Not set"}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
                <span style={{ color: "#64748b" }}>App Secret</span>
                <span style={{ fontWeight: 700, color: data.appConfig.hasSecret ? "#15803d" : "#b91c1c" }}>
                  {data.appConfig.hasSecret ? "Configured ✓" : "Missing / Placeholder ✕"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
                <span style={{ color: "#64748b" }}>Webhook Handshake</span>
                <span style={{ fontWeight: 700, color: data.webhookHandshakeOk ? "#15803d" : "#b91c1c" }}>
                  {data.webhookHandshakeOk ? "Responding (200 OK) ✓" : "Handshake Failed ✕"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
                <span style={{ color: "#64748b" }}>Embedded Signup</span>
                <span style={{ fontWeight: 700, color: data.appConfig.configIdSet ? "#15803d" : "#64748b" }}>
                  {data.appConfig.configIdSet ? "Active ✓" : "Optional (Manual Connect active)"}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <a
                  href={`https://developers.facebook.com/apps/${data.appConfig.appId || ""}/settings/basic/`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, fontWeight: 700, color: "#1877F2", textDecoration: "none" }}
                >
                  Open App in Meta Developers ↗
                </a>
              </div>
            </div>
          </div>

          {/* Card 3: Permissions & Roles */}
          <div style={cardStyle}>
            <div style={headerStyle}>
              <span>🔑</span> User Connection & Permissions
            </div>
            {data.facebookUser ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1877F2", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12 }}>
                    {data.facebookUser.name[0]}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>{data.facebookUser.name}</strong>
                    <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>User ID: {data.facebookUser.id}</div>
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                  Granted Permissions:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {data.permissions.granted.map(scope => (
                    <span key={scope} style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", padding: "2px 7px", borderRadius: 12, fontFamily: "monospace" }}>
                      ✓ {scope}
                    </span>
                  ))}
                  {data.permissions.missing.map(scope => (
                    <span key={scope} style={{ fontSize: 10, background: "#fee2e2", color: "#b91c1c", padding: "2px 7px", borderRadius: 12, fontFamily: "monospace" }}>
                      ✕ {scope}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#b91c1c" }}>
                {data.tokenError || "No active Facebook connection. Please log in with Facebook first."}
              </div>
            )}
          </div>

          {/* Card 4: Discovered WABAs & 1-Click Connect */}
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <div style={headerStyle}>
              <span>💬</span> Discovered WhatsApp Business Accounts ({data.discoveredWabas.length})
            </div>
            {data.discoveredWabas.length === 0 ? (
              <div style={{ padding: "16px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
                No WhatsApp Accounts were automatically returned by Meta Graph API.
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  👉 If your client has a WABA in WhatsApp Manager, you can connect it directly using their <strong>WABA ID</strong>.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
                {data.discoveredWabas.map(waba => {
                  const isActive = data.activeWaba?.wabaId === waba.id
                  return (
                    <div
                      key={waba.id}
                      style={{
                        border: `1.5px solid ${isActive ? "#16a34a" : "#e2e8f0"}`,
                        borderRadius: 10,
                        padding: 14,
                        background: isActive ? "#f0fdf4" : "#ffffff",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                          <strong style={{ fontSize: 14, color: "#0f172a" }}>{waba.name}</strong>
                          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>WABA ID: {waba.id}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>Portfolio: {waba.businessName}</div>
                        </div>
                        {isActive ? (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 20, background: "#dcfce7", color: "#15803d" }}>
                            ACTIVE ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => connectWaba(waba.id, waba.businessId)}
                            disabled={connectingId === waba.id}
                            style={{
                              background: "#075e54",
                              color: "#fff",
                              border: 0,
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {connectingId === waba.id ? "Connecting…" : "⚡ Connect"}
                          </button>
                        )}
                      </div>

                      {waba.phones.length > 0 && (
                        <div style={{ marginTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Phone Numbers:</span>
                          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                            {waba.phones.map(p => (
                              <div key={p.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", color: "#334155" }}>
                                <span>📱 {p.display_phone_number}</span>
                                {p.verified_name && <span style={{ color: "#64748b" }}>{p.verified_name}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

