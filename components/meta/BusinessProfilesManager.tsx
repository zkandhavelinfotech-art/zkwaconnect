"use client"
import { useCallback, useEffect, useState } from "react"

type ProfileData = {
  ok: boolean
  businessPortfolio: {
    id: string
    name: string
    url: string
    pagesSettingsUrl: string
    instagramSettingsUrl: string
    peopleSettingsUrl: string
  }
  primaryUser: {
    id: string
    name: string
    email: string
    role: string
  } | null
  businessUsers: { id: string; name: string; email: string; role: string }[]
  ownedPages: {
    id: string
    name: string
    category: string
    link?: string
    verification_status?: string
    instagram?: { id: string; username?: string }
  }[]
  clientPages: any[]
  instagramAccounts: { id: string; username: string }[]
  userManagedPages: { id: string; name: string; category: string; link?: string }[]
  hasProfiles: boolean
}

export function BusinessProfilesManager() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"auto" | "manual">("auto")
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // Dynamic actions state
  const [busyAction, setBusyAction] = useState("")

  // Manual Tab state
  const [manualInput, setManualInput] = useState("https://www.facebook.com/Recruitmenttrainingacademy")
  const [manualPageId, setManualPageId] = useState("1466798486509943")

  const loadData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/meta/profiles", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load profiles")
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading profiles")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Action: Assign User Access (fixes "No profiles available" in Business Suite)
  async function handleAssignAccess(pageId: string, userId?: string) {
    setBusyAction(`assign-${pageId}`)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_access",
          pageId,
          businessUserId: userId || data?.primaryUser?.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to assign access")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign access")
    } finally {
      setBusyAction("")
    }
  }

  // Action: Claim / Add Page to Business Portfolio
  async function handleClaimPage(pageId: string) {
    setBusyAction(`claim-${pageId}`)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim_page",
          pageId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to add page")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add page")
    } finally {
      setBusyAction("")
    }
  }

  // Action: Manual Resolve & Link
  async function handleManualLink(e: React.FormEvent) {
    e.preventDefault()
    if (!manualInput.trim()) return
    setBusyAction("manual-link")
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_resolve_and_link",
          input: manualInput.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Manual link failed")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual link failed")
    } finally {
      setBusyAction("")
    }
  }

  if (loading && !data) {
    return <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading Facebook Pages &amp; Profiles…</div>
  }

  const primaryPage = data?.ownedPages?.[0] || null

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Header & Context */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1877F2" }}>
            Meta Business Suite Asset Manager
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "4px 0 0", fontFamily: "Sora, sans-serif" }}>
            📄 Business Portfolio Profiles: {data?.businessPortfolio.name || "Recruitment Training Academy"}
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Manage official Facebook Pages and Instagram Profiles under Business Portfolio <code>{data?.businessPortfolio.id}</code>.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "inline-flex", background: "#e2e8f0", padding: 3, borderRadius: 8, gap: 2 }}>
          <button
            type="button"
            onClick={() => setActiveTab("auto")}
            style={{
              padding: "7px 16px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              background: activeTab === "auto" ? "#1877F2" : "transparent",
              color: activeTab === "auto" ? "#fff" : "#334155",
              boxShadow: activeTab === "auto" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            ⚡ Tab 1: Dynamic Auto Discovery &amp; Access
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            style={{
              padding: "7px 16px",
              border: 0,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              background: activeTab === "manual" ? "#1877F2" : "transparent",
              color: activeTab === "manual" ? "#fff" : "#334155",
              boxShadow: activeTab === "manual" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            📋 Tab 2: Dynamic Manual Page Linker
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: 8, color: "#166534", fontSize: 13 }}>
          {successMsg}
        </div>
      )}

      {/* Meta "No Profiles Available" Diagnostic Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)",
          borderRadius: 12,
          padding: "18px 22px",
          color: "#fff",
          boxShadow: "0 4px 12px rgba(30, 58, 138, 0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#93c5fd" }}>
              💡 Understanding Meta&apos;s &ldquo;No Profiles Available&rdquo; Notice:
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "4px 0 6px", color: "#fff" }}>
              How Meta Business Suite Connects Profiles &amp; People
            </h3>
            <p style={{ fontSize: 12, color: "#dbeafe", margin: 0, lineHeight: 1.5, maxWidth: 820 }}>
              Meta Business Suite shows <em>&ldquo;No profiles available. Visit the Settings page to add profiles, such as Facebook Pages and Instagram profiles, to this business portfolio. Then, assign yourself access to manage those profiles&rdquo;</em> because a Page requires <strong>both</strong> ownership in the portfolio AND <strong>assigned access</strong> to your user account.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={data?.businessPortfolio.pagesSettingsUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#fff",
                color: "#1e40af",
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Meta Suite Pages Settings ↗
            </a>
            <a
              href={data?.businessPortfolio.peopleSettingsUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Meta Suite People Settings ↗
            </a>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: DYNAMIC AUTO DISCOVERY & ACCESS                         */}
      {/* ============================================================== */}
      {activeTab === "auto" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Section 1: Official Owned Pages under Business Portfolio */}
          <div style={{ background: "#fff", border: "1.5px solid #10b981", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(16,185,129,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#059669" }}>
                  Official Owned Facebook Page
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                  ✅ Recruitment Training Academy - RTA (Official Page)
                </h3>
              </div>
              <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                ✓ Portfolio Owned
              </span>
            </div>

            {primaryPage ? (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                      {primaryPage.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      Official Page ID: <code style={{ fontFamily: "monospace", fontWeight: 700, color: "#0f172a" }}>{primaryPage.id}</code> &bull; Category: <strong>{primaryPage.category}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: "#15803d", marginTop: 4, fontWeight: 600 }}>
                      ✓ Connected to Portfolio <code>{data?.businessPortfolio.id}</code>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busyAction === `assign-${primaryPage.id}`}
                      onClick={() => handleAssignAccess(primaryPage.id)}
                      style={{
                        background: "#059669",
                        color: "#fff",
                        border: 0,
                        borderRadius: 6,
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(5,150,105,0.25)",
                      }}
                    >
                      {busyAction === `assign-${primaryPage.id}` ? "Assigning Access…" : "⚡ Assign Yourself Full Access"}
                    </button>
                    <a
                      href={`https://www.facebook.com/${primaryPage.id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: "#fff",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      View Page on Facebook ↗
                    </a>
                  </div>
                </div>

                {/* Assigned User Details */}
                {data?.primaryUser && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ color: "#64748b" }}>Assigned Business Admin:</span>{" "}
                      <strong>{data.primaryUser.name}</strong> ({data.primaryUser.email}) &bull; Role: <strong>{data.primaryUser.role}</strong>
                    </div>
                    <span style={{ color: "#166534", fontWeight: 700, background: "#dcfce7", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>
                      ✓ Full Control Active
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: 16, textAlign: "center", fontSize: 12, color: "#64748b" }}>
                No Page owned directly yet. Use the scan or manual tab below to claim Page 1466798486509943.
              </div>
            )}
          </div>

          {/* Section 2: Other Pages Managed by Your Facebook Login */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1877F2" }}>
                  Other Managed Pages
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                  🌐 Pages from Your Facebook Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => loadData()}
                style={{
                  background: "#f0f9ff",
                  color: "#0284c7",
                  border: "1px solid #bae6fd",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ↻ Refresh List
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
              These pages were discovered from your direct Facebook administrator login. You can link any of them into Business Portfolio <code>{data?.businessPortfolio.id}</code> with 1 click:
            </p>

            {data?.userManagedPages && data.userManagedPages.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {data.userManagedPages.map(page => {
                  const isAlreadyOwned = data.ownedPages?.some(p => p.id === page.id)
                  const isBusy = busyAction === `claim-${page.id}`
                  return (
                    <div
                      key={page.id}
                      style={{
                        background: isAlreadyOwned ? "#f0fdf4" : "#f8fafc",
                        border: `1px solid ${isAlreadyOwned ? "#86efac" : "#e2e8f0"}`,
                        borderRadius: 8,
                        padding: "12px 14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 14, color: "#0f172a" }}>{page.name}</strong>
                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>
                          ID: {page.id} &bull; Category: {page.category}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isAlreadyOwned ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#166534", background: "#dcfce7", padding: "4px 10px", borderRadius: 20 }}>
                            ✓ Active in Portfolio
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleClaimPage(page.id)}
                            style={{
                              background: "#1877F2",
                              color: "#fff",
                              border: 0,
                              borderRadius: 6,
                              padding: "7px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {isBusy ? "Linking…" : "⚡ 1-Click Link to Portfolio"}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ padding: 12, textAlign: "center", color: "#64748b", fontSize: 12 }}>
                No other pages found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: DYNAMIC MANUAL PAGE LINKER                              */}
      {/* ============================================================== */}
      {activeTab === "manual" && (
        <div style={{ background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Tab 2 &bull; Manual Profile Linker
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                📋 Link Any Facebook Page or Profile into Portfolio
              </h3>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={data?.businessPortfolio.pagesSettingsUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#1877F2",
                  color: "#fff",
                  padding: "7px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Meta Pages Settings ↗
              </a>
              <a
                href={data?.businessPortfolio.instagramSettingsUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#f8fafc",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "7px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Instagram Settings ↗
              </a>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
            Enter your Facebook Page URL, vanity name, or numeric Page ID. The engine will automatically resolve the numeric ID, add the Page to Business Portfolio <code>{data?.businessPortfolio.id}</code>, and assign full management access.
          </p>

          <form onSubmit={handleManualLink} style={{ display: "grid", gap: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
            {/* Quick Fill Pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Quick Fill:</span>
              <button
                type="button"
                onClick={() => setManualInput("https://www.facebook.com/Recruitmenttrainingacademy")}
                style={{
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Recruitmenttrainingacademy (URL)
              </button>
              <button
                type="button"
                onClick={() => setManualInput("1466798486509943")}
                style={{
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                1466798486509943 (Official Page ID)
              </button>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>
                Facebook Page URL or Numeric ID:
              </label>
              <input
                type="text"
                required
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="e.g. https://www.facebook.com/Recruitmenttrainingacademy or 1466798486509943"
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "9px 12px", fontSize: 13 }}
              />
            </div>

            {manualInput.includes("100075867504434") && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#92400e" }}>
                Notice: <code>100075867504434</code> is your Personal Facebook Profile. Meta requires official Business Pages. Click the button above to use official Page ID <code>1466798486509943</code>.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                Target Business Portfolio: <strong>{data?.businessPortfolio.name}</strong> (<code>{data?.businessPortfolio.id}</code>)
              </span>
              <button
                type="submit"
                disabled={busyAction === "manual-link" || !manualInput.trim()}
                style={{
                  background: "#1877F2",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "9px 18px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(24, 119, 242, 0.3)",
                }}
              >
                {busyAction === "manual-link" ? "Linking & Assigning Access…" : "🔗 Link & Assign Access to Portfolio"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

