"use client"
import { useCallback, useEffect, useState } from "react"

type ManagedPage = {
  id: string
  name: string
  category: string
  link: string
  isPublished: boolean
  tasks: string[]
  hasFullControl: boolean
  instagram?: { id: string; username?: string } | null
  approvalUrl: string
}

type BusinessPortfolio = {
  businessId: string
  businessName: string
  ownedPages: { id: string; name: string; category?: string; link?: string }[]
  clientPages: { id: string; name: string; category?: string; link?: string }[]
}

type ResponseData = {
  connected: boolean
  managedPages: ManagedPage[]
  businessPortfolios: BusinessPortfolio[]
  businessId: string | null
  message?: string
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "20px 22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
}

const headStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "Sora, sans-serif",
  color: "#0f172a",
  margin: "0 0 12px",
  display: "flex",
  alignItems: "center",
  gap: 8,
}

export function FacebookPageAccessManager() {
  const [data, setData] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  // Request Access state
  const [targetPageInput, setTargetPageInput] = useState("")
  const [selectedBusinessId, setSelectedBusinessId] = useState("")
  const [requesting, setRequesting] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [requestResult, setRequestResult] = useState<{
    ok: boolean
    message: string
    pageId?: string
    pageName?: string
    approvalUrl?: string
    profileAccessUrl?: string
    partnerDirectUrl?: string
    createPageUrl?: string
    isProfileNotPage?: boolean
    limitReached?: boolean
  } | null>(null)

  // Direct Partner Assignment state
  const [partnerPageInput, setPartnerPageInput] = useState("100075867504434")
  const [partnerBizId, setPartnerBizId] = useState("1707214344108990")
  const [partnerTasks, setPartnerTasks] = useState<string[]>(["ADVERTISE", "MESSAGING", "CREATE_CONTENT", "MODERATE", "ANALYZE"])
  const [assigningPartner, setAssigningPartner] = useState(false)
  const [assignResult, setAssignResult] = useState<{
    ok: boolean
    message: string
    pageId?: string
    pageName?: string
    directPartnerUrl?: string
    newPagesExperienceUrl?: string
    needsManualAssignment?: boolean
  } | null>(null)

  const loadPages = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/meta/facebook-pages", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to load Facebook Pages.")
      setData(body)
      if (body.businessPortfolios?.[0]?.businessId) {
        setSelectedBusinessId(body.businessPortfolios[0].businessId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading pages")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPages()
  }, [loadPages])

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault()
    if (!targetPageInput.trim()) return
    setRequesting(true)
    setRequestResult(null)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/meta/facebook-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_page_access",
          pageId: targetPageInput.trim(),
          businessId: selectedBusinessId || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok && res.status !== 422) {
        throw new Error(body.error || "Request failed.")
      }
      setRequestResult({
        ok: Boolean(body.ok),
        message: body.message || body.error,
        pageId: body.pageId,
        pageName: body.pageName,
        approvalUrl: body.approvalUrl,
        profileAccessUrl: body.profileAccessUrl,
        partnerDirectUrl: body.partnerDirectUrl,
        createPageUrl: body.createPageUrl,
        isProfileNotPage: Boolean(body.isProfileNotPage),
        limitReached: Boolean(body.limitReached),
      })
      if (body.ok) {
        setNotice(body.message)
        await loadPages()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request page access.")
    } finally {
      setRequesting(false)
    }
  }

  async function handleAssignPartner(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const pageTarget = partnerPageInput.trim() || targetPageInput.trim() || "100075867504434"
    const partnerId = partnerBizId.trim() || selectedBusinessId || "1707214344108990"
    setAssigningPartner(true)
    setAssignResult(null)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/meta/facebook-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_partner",
          pageId: pageTarget,
          partnerBusinessId: partnerId,
          permittedTasks: partnerTasks,
        }),
      })
      const body = await res.json()
      setAssignResult({
        ok: Boolean(body.ok),
        message: body.message || body.error || "Partner operation completed.",
        pageId: body.pageId,
        pageName: body.pageName,
        directPartnerUrl: body.directPartnerUrl,
        newPagesExperienceUrl: body.newPagesExperienceUrl,
        needsManualAssignment: Boolean(body.needsManualAssignment),
      })
      if (body.ok) {
        setNotice(body.message)
        await loadPages()
      }
    } catch (err) {
      setAssignResult({
        ok: false,
        message: err instanceof Error ? err.message : "Partner assignment request failed.",
      })
    } finally {
      setAssigningPartner(false)
    }
  }

  if (loading && !data) {
    return <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading Facebook Pages from Meta…</div>
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Title & Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
            Facebook Page Access & Automation
          </h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            Connect pages you directly manage without requests, or send automated access requests into your Business Portfolio.
          </p>
        </div>
        <button
          type="button"
          onClick={loadPages}
          disabled={loading}
          style={{
            background: "#fff",
            border: "1.5px solid #cbd5e1",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            color: "#334155",
          }}
        >
          {loading ? "Refreshing…" : "↻ Refresh Pages"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 12, borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 12, borderRadius: 8, color: "#166534", fontSize: 13 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16 }}>
        {/* Section 1: Pages You Manage (Instant Access - No Request Needed!) */}
        <div style={{ ...cardStyle, borderTop: "3px solid #16a34a" }}>
          <div style={headStyle}>
            <span>✅</span> Pages You Manage (Instant Access &mdash; No Approval Needed)
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px", lineHeight: 1.5 }}>
            Because your Facebook login has admin privileges on these Pages, they are instantly accessible without sending approval requests:
          </p>

          {data?.managedPages && data.managedPages.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {data.managedPages.map(page => (
                <div
                  key={page.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <strong style={{ fontSize: 14, color: "#0f172a" }}>{page.name}</strong>
                      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>
                        Page ID: {page.id} · {page.category}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 20,
                        background: "#dcfce7",
                        color: "#15803d",
                      }}
                    >
                      DIRECT ADMIN ✓
                    </span>
                  </div>

                  {page.instagram && (
                    <div style={{ fontSize: 11, color: "#0284c7", marginTop: 6 }}>
                      📸 Linked Instagram: <strong>@{page.instagram.username || page.instagram.id}</strong>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <a
                      href={page.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#1877F2",
                        textDecoration: "none",
                      }}
                    >
                      Open Page on Facebook ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "16px 0", color: "#64748b", fontSize: 13 }}>
              No Facebook Pages directly found on this Facebook login. If your client owns the Page, use the <strong>Automated Request Access Tool</strong> below or have them add you under Page Access.
            </div>
          )}
        </div>

        {/* Section 2: Automated Request Access Tool */}
        <div style={{ ...cardStyle, borderTop: "3px solid #1877F2" }}>
          <div style={headStyle}>
            <span>🚀</span> Automated Page Access Request Tool
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px", lineHeight: 1.5 }}>
            Don&apos;t have access yet? Enter your client&apos;s Facebook Page ID or URL to dispatch an official partner request directly from your Business Portfolio:
          </p>

          {/* Quick Page Selector Chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setTargetPageInput("https://www.facebook.com/Recruitmenttrainingacademy")}
              style={{
                background: targetPageInput.includes("Recruitmenttrainingacademy") ? "#1877F2" : "#f8fafc",
                color: targetPageInput.includes("Recruitmenttrainingacademy") ? "#fff" : "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: 16,
                padding: "4px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🔗 FB URL (Recruitmenttrainingacademy)
            </button>
          </div>

          <form onSubmit={handleRequestAccess} style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
                Target Business Portfolio
              </label>
              <select
                value={selectedBusinessId}
                onChange={e => setSelectedBusinessId(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  background: "#fff",
                }}
              >
                {data?.businessPortfolios.map(b => (
                  <option key={b.businessId} value={b.businessId}>
                    {b.businessName} (ID: {b.businessId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                  Facebook Page ID or Page URL
                </label>
                <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700 }}>
                  ✓ Auto-resolves URLs &amp; vanity names to numeric ID
                </span>
              </div>
              <input
                value={targetPageInput}
                onChange={e => setTargetPageInput(e.target.value)}
                placeholder="e.g. 100075867504434 or facebook.com/Recruitmenttrainingacademy"
                required
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={requesting || !targetPageInput.trim()}
              style={{
                background: "#1877F2",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: requesting ? "not-allowed" : "pointer",
                opacity: requesting || !targetPageInput.trim() ? 0.7 : 1,
              }}
            >
              {requesting ? "Resolving Page & Sending API Request…" : "🚀 Send Automated Access Request"}
            </button>
          </form>

          {/* Request Result / 1-Click Approve Link */}
          {requestResult && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.5,
                background: requestResult.ok ? "#f0fdf4" : requestResult.limitReached ? "#fffbeb" : "#fef2f2",
                border: `1px solid ${requestResult.ok ? "#bbf7d0" : requestResult.limitReached ? "#fde68a" : "#fecaca"}`,
                color: requestResult.ok ? "#15803d" : requestResult.limitReached ? "#92400e" : "#991b1b",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{requestResult.ok ? "✓" : requestResult.limitReached ? "⏳" : "✕"}</span>
                <span>{requestResult.message}</span>
              </div>

              {requestResult.pageId && (
                <div style={{ marginTop: 8, background: "#fff", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0", color: "#334155" }}>
                  <div><strong>Discovered Page:</strong> {requestResult.pageName || "Facebook Page"}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, marginTop: 2 }}>
                    <strong>Numeric Page ID:</strong> {requestResult.pageId}
                  </div>
                </div>
              )}

              {/* Action Buttons to Approve */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {requestResult.createPageUrl && (
                  <a
                    href={requestResult.createPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#15803d",
                      color: "#fff",
                      padding: "7px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open Meta Business Suite &rarr; Pages (Add / Create Page) ↗
                  </a>
                )}
                {requestResult.approvalUrl && (
                  <a
                    href={requestResult.approvalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: requestResult.ok ? "#15803d" : "#b45309",
                      color: "#fff",
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open Page Access Settings to Approve ↗
                  </a>
                )}
                {requestResult.profileAccessUrl && (
                  <a
                    href={requestResult.profileAccessUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#1e293b",
                      color: "#fff",
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open New Pages Profile Access ↗
                  </a>
                )}
                {requestResult.partnerDirectUrl && (
                  <a
                    href={requestResult.partnerDirectUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#1877F2",
                      color: "#fff",
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    View in Business Suite Pages ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Automated Client Facebook Page ➔ Settings ➔ Page Access ➔ Partners ➔ Assign Partner */}
        <div style={{ ...cardStyle, gridColumn: "1 / -1", background: "#f8fafc", border: "1.5px solid #0284c7" }}>
          <div style={{ ...headStyle, color: "#0369a1", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🤝</span>
              <span>Facebook Page &amp; Partner Assignment Center</span>
            </div>
            <span style={{ fontSize: 11, background: "#e0f2fe", color: "#0369a1", padding: "3px 10px", borderRadius: 12, fontWeight: 700 }}>
              Your Business ID: {data?.businessId || "1707214344108990"}
            </span>
          </div>

          {/* Critical Meta Explanation Alert */}
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12, lineHeight: 1.6, color: "#1e3a8a" }}>
            <strong>💡 Important Meta Rule &mdash; Why Meta says &ldquo;Partner business ID cannot be your own&rdquo;:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>
                <strong>You are already the Owner:</strong> Your Business Portfolio is <strong>Recruitment Training Academy (ID: {data?.businessId || "1707214344108990"})</strong>. Because you own this portfolio, Meta rejects adding <code>1707214344108990</code> as a partner to itself.
              </li>
              <li>
                <strong>Direct Assets (No Partner Needed):</strong> If you want to connect a Facebook Page to your portfolio, you simply claim it under <strong>Accounts &rarr; Pages</strong> in Meta Business Suite.
              </li>
              <li>
                <strong>Agency Partner ID:</strong> If you want to grant partner access to the ZKWAConnect Agency (<em>Zkandhavel Infotech Private Limited</em>), use the <strong>Agency Partner ID: <code>246511357935583</code></strong>.
              </li>
            </ul>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {/* Card A: Direct Ownership (No Partner Needed) */}
            <div style={{ background: "#fff", border: "1.5px solid #86efac", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#14532d", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🏢</span> Solution 1: Add Facebook Page to Your Business Portfolio
              </div>
              <p style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, margin: "0 0 10px" }}>
                Add your Facebook Page directly into Business Portfolio <strong>Recruitment Training Academy ({data?.businessId || "1707214344108990"})</strong> without partner requests:
              </p>

              <div style={{ background: "#f0fdf4", padding: 10, borderRadius: 6, border: "1px solid #bbf7d0", fontSize: 11, marginBottom: 10 }}>
                <div><strong>1.</strong> Click the button below to open Meta Business Suite Pages.</div>
                <div style={{ marginTop: 4 }}><strong>2.</strong> Click <strong>Add &rarr; Add a Page</strong> (or <em>Create a new Page</em>).</div>
                <div style={{ marginTop: 4 }}><strong>3.</strong> Enter your Page name or URL &rarr; Click <strong>Add Page</strong>.</div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <a
                  href={`https://business.facebook.com/settings/pages?business_id=${data?.businessId || "1707214344108990"}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#15803d",
                    color: "#fff",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Open Business Suite &rarr; Pages (Add Page) ↗
                </a>
                <a
                  href="https://www.facebook.com/pages/create/"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#f8fafc",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Create New Facebook Page ↗
                </a>
              </div>
            </div>

            {/* Card B: Assign ZKWAConnect Agency Partner */}
            <div style={{ background: "#fff", border: "1.5px solid #93c5fd", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#1e40af", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🤝</span> Solution 2: Assign ZKWAConnect Agency as Partner
              </div>
              <p style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, margin: "0 0 10px" }}>
                To give ZKWAConnect Agency partner access to your Page or Domain in Meta Business Suite, enter the <strong>Agency Partner ID</strong> (not your own ID):
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", marginBottom: 10 }}>
                <div style={{ flex: 1, fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "#0f172a" }}>
                  Agency Partner ID: 246511357935583
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText("246511357935583")
                    setCopiedId(true)
                    setTimeout(() => setCopiedId(false), 2500)
                  }}
                  style={{
                    background: copiedId ? "#16a34a" : "#1877F2",
                    color: "#fff",
                    border: 0,
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copiedId ? "✓ Copied!" : "📋 Copy Agency ID"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <a
                  href={`https://business.facebook.com/settings/partners?business_id=${data?.businessId || "1707214344108990"}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#1877F2",
                    color: "#fff",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Open Meta Business Suite &rarr; Partners ↗
                </a>
                <a
                  href={`https://business.facebook.com/settings/domains?business_id=${data?.businessId || "1707214344108990"}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#f8fafc",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Open Domains (Share with Partner) ↗
                </a>
              </div>
            </div>
          </div>

          {/* Quick Notice about WhatsApp Cloud API */}
          <div style={{ marginTop: 14, background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#065f46", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <div>
              <strong>Good News for WhatsApp Business:</strong> A Facebook Page is <strong>NOT required</strong> to send and receive WhatsApp messages! Your WhatsApp Cloud API gateway operates directly on your verified WhatsApp Business Account (WABA) under Business Portfolio <strong>{data?.businessId || "1707214344108990"}</strong>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

