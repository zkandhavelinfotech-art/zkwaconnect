"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

type SessionItem = {
  organizationId: string
  organizationName: string
  slug: string
  status: string
  onboardingStep: string
  metaConnected: boolean
  waba: { id: string; wabaId: string; name: string; status: string } | null
  phone: { id: string; phoneNumberId: string; phoneNumber: string; displayName: string | null; status: string } | null
  createdAt: string
  lastSyncedAt: string | null
}

type Summary = {
  total: number
  connected: number
  pending: number
  notStarted: number
}

export default function AdminOnboardingPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [activeConsoleTab, setActiveConsoleTab] = useState<"tenants" | "tickets">("tenants")
  const [summary, setSummary] = useState<Summary>({ total: 0, connected: 0, pending: 0, notStarted: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("")
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form for delegated setup
  const [form, setForm] = useState({
    wabaId: "",
    phoneNumberId: "",
    phoneNumber: "",
    displayName: "",
    pin: "123456",
  })

  // Meta Permissions Modal state
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [permissionsData, setPermissionsData] = useState<any>(null)
  const [permissionsLoading, setPermissionsLoading] = useState(false)

  const loadPermissions = async () => {
    setShowPermissionsModal(true)
    setPermissionsLoading(true)
    try {
      const res = await fetch("/api/meta/permissions-request")
      const json = await res.json()
      if (res.ok) setPermissionsData(json)
    } catch {}
    finally {
      setPermissionsLoading(false)
    }
  }

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/onboarding/tickets")
      const data = await res.json()
      if (res.ok) setTickets(data.tickets || [])
    } catch { }
  }, [])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = search ? `&q=${encodeURIComponent(search)}` : ""
      const s = filter ? `&status=${encodeURIComponent(filter)}` : ""
      const res = await fetch(`/api/admin/onboarding/sessions?${q}${s}`)
      if (res.status === 401) {
        router.push("/admin/login")
        return
      }
      const data = await res.json()
      if (res.ok) {
        setSessions(data.sessions || [])
        setSummary(data.summary || { total: 0, connected: 0, pending: 0, notStarted: 0 })
      } else {
        setError(data.error || "Could not load onboarding sessions.")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search, filter, router])

  useEffect(() => {
    loadSessions()
    loadTickets()
  }, [loadSessions, loadTickets])

  const handleResolveTicket = async (ticketId: string) => {
    try {
      setBusy(true)
      const res = await fetch(`/api/admin/onboarding/tickets/${ticketId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED", notes: "Assisted setup completed by Super Admin." }),
      })
      const data = await res.json()
      if (res.ok) {
        setNotice(data.message || "Ticket resolved.")
        loadTickets()
      } else {
        setError(data.error || "Failed to resolve ticket.")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleOpenAssistModal = (item: SessionItem) => {
    setSelectedSession(item)
    setForm({
      wabaId: item.waba?.wabaId || "",
      phoneNumberId: item.phone?.phoneNumberId || "",
      phoneNumber: item.phone?.phoneNumber || "",
      displayName: item.phone?.displayName || item.organizationName,
      pin: "123456",
    })
    setShowSetupModal(true)
  }

  const handleSaveDelegatedSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSession) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/admin/onboarding/manual-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedSession.organizationId,
          wabaId: form.wabaId,
          phoneNumberId: form.phoneNumberId,
          phoneNumber: form.phoneNumber,
          displayName: form.displayName,
          pin: form.pin,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setNotice(data.message || "Tenant onboarded successfully!")
        setShowSetupModal(false)
        loadSessions()
      } else {
        setError(data.error || "Failed to complete setup.")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b1320", color: "#f8fafc", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>👑</span>
              <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 22, fontWeight: 800, margin: 0, color: "#fff" }}>
                Super Admin Onboarding Console
              </h1>
            </div>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>
              SaaS Product Owner Delegated Workspace Onboarding &amp; Diagnostics for Tenants
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={loadPermissions}
              style={{ background: "#0284c7", color: "#ffffff", border: 0, padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>🛡️</span> Meta App Review &amp; Permissions
            </button>
            <a href="/admin/dashboard" style={{ background: "#1e293b", color: "#e2e8f0", textDecoration: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "1px solid #334155" }}>
              ← Admin Dashboard
            </a>
            <a href="/admin/meta-setup" style={{ background: "#1e293b", color: "#e2e8f0", textDecoration: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "1px solid #334155" }}>
              Meta Diagnostics ↗
            </a>
          </div>
        </div>

        {/* NOTICES */}
        {notice && (
          <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid #10b981", borderRadius: 10, padding: 12, color: "#34d399", fontSize: 13, marginBottom: 16 }}>
            ✓ {notice}
          </div>
        )}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", borderRadius: 10, padding: 12, color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* SUMMARY CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 800 }}>Total Tenants</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4 }}>{summary.total}</div>
          </div>
          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, color: "#86efac", textTransform: "uppercase", fontWeight: 800 }}>Connected WABAs</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#86efac", marginTop: 4 }}>{summary.connected}</div>
          </div>
          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, color: "#fde68a", textTransform: "uppercase", fontWeight: 800 }}>Pending Setup</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fde68a", marginTop: 4 }}>{summary.pending}</div>
          </div>
          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 800 }}>Not Started</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#cbd5e1", marginTop: 4 }}>{summary.notStarted}</div>
          </div>
        </div>

        {/* CONSOLE TABS */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 }}>
          <button
            type="button"
            onClick={() => setActiveConsoleTab("tenants")}
            style={{
              background: activeConsoleTab === "tenants" ? "#2563eb" : "transparent",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            🏢 Tenant Workspaces ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveConsoleTab("tickets")}
            style={{
              background: activeConsoleTab === "tickets" ? "#2563eb" : "transparent",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>🤝 Assisted Onboarding Requests</span>
            {tickets.filter(t => t.status === "OPEN").length > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 900 }}>
                {tickets.filter(t => t.status === "OPEN").length} OPEN
              </span>
            )}
          </button>
        </div>

        {activeConsoleTab === "tickets" ? (
          /* ASSISTED ONBOARDING TICKETS VIEW */
          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", marginBottom: 30 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>Assisted Onboarding Tickets from Tenants</div>
              <button onClick={loadTickets} style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>↻ Refresh</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                <thead style={{ background: "#131c31", color: "#94a3b8" }}>
                  <tr>
                    <th style={{ padding: "12px 18px" }}>Ticket</th>
                    <th style={{ padding: "12px 18px" }}>Tenant Workspace</th>
                    <th style={{ padding: "12px 18px" }}>Priority &amp; Status</th>
                    <th style={{ padding: "12px 18px" }}>Description</th>
                    <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                        No onboarding support tickets currently open.
                      </td>
                    </tr>
                  ) : (
                    tickets.map(ticket => (
                      <tr key={ticket.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "14px 18px", fontFamily: "monospace", color: "#60a5fa" }}>
                          {ticket.ticketCode}
                        </td>
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ fontWeight: 700, color: "#fff" }}>{ticket.organizationName}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>ID: {ticket.organizationId}</div>
                        </td>
                        <td style={{ padding: "14px 18px" }}>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 800,
                            background: ticket.priority === "URGENT" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                            color: ticket.priority === "URGENT" ? "#fca5a5" : "#fde68a",
                            marginRight: 6,
                          }}>
                            {ticket.priority}
                          </span>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 800,
                            background: ticket.status === "RESOLVED" ? "rgba(16,185,129,0.2)" : "rgba(96,165,250,0.2)",
                            color: ticket.status === "RESOLVED" ? "#86efac" : "#93c5fd",
                          }}>
                            {ticket.status}
                          </span>
                        </td>
                        <td style={{ padding: "14px 18px", maxWidth: 380 }}>
                          <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: 2 }}>{ticket.subject}</div>
                          <pre style={{ margin: 0, fontSize: 11, color: "#94a3b8", whiteSpace: "pre-wrap", maxHeight: 60, overflowY: "auto", fontFamily: "inherit" }}>
                            {ticket.description}
                          </pre>
                        </td>
                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => {
                                const matching = sessions.find(s => s.organizationId === ticket.organizationId)
                                if (matching) handleOpenAssistModal(matching)
                              }}
                              style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            >
                              ⚙️ Setup
                            </button>
                            {ticket.status !== "RESOLVED" && (
                              <button
                                type="button"
                                onClick={() => handleResolveTicket(ticket.id)}
                                disabled={busy}
                                style={{ background: "#16a34a", color: "#fff", border: 0, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                              >
                                ✓ Resolve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* SEARCH & FILTERS */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search tenant name, phone or WABA ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 260, background: "#172235", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setFilter("")} style={{ background: filter === "" ? "#2563eb" : "#1e293b", color: "#fff", border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>All</button>
                <button onClick={() => setFilter("CONNECTED")} style={{ background: filter === "CONNECTED" ? "#16a34a" : "#1e293b", color: "#fff", border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Connected</button>
                <button onClick={() => setFilter("REGISTRATION_PENDING")} style={{ background: filter === "REGISTRATION_PENDING" ? "#d97706" : "#1e293b", color: "#fff", border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Pending</button>
                <button onClick={() => setFilter("NOT_STARTED")} style={{ background: filter === "NOT_STARTED" ? "#475569" : "#1e293b", color: "#fff", border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Not Started</button>
              </div>
            </div>

            {/* TENANTS TABLE */}
            <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                  <thead style={{ background: "#131c31", color: "#94a3b8" }}>
                    <tr>
                      <th style={{ padding: "14px 18px" }}>Tenant Workspace</th>
                      <th style={{ padding: "14px 18px" }}>Onboarding Status</th>
                      <th style={{ padding: "14px 18px" }}>WABA ID</th>
                      <th style={{ padding: "14px 18px" }}>Phone Number</th>
                      <th style={{ padding: "14px 18px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>Loading tenant onboarding records…</td>
                      </tr>
                    ) : sessions.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>No tenant workspaces found matching search criteria.</td>
                      </tr>
                    ) : (
                      sessions.map(item => (
                        <tr key={item.organizationId} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontWeight: 700, color: "#fff" }}>{item.organizationName}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>Slug: {item.slug}</div>
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 800,
                              background: item.status === "CONNECTED" ? "rgba(16,185,129,0.15)" : item.status === "NOT_STARTED" ? "rgba(148,163,184,0.15)" : "rgba(245,158,11,0.15)",
                              color: item.status === "CONNECTED" ? "#86efac" : item.status === "NOT_STARTED" ? "#cbd5e1" : "#fde68a"
                            }}>
                              {item.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            {item.waba?.wabaId ? (
                              <div>
                                <code style={{ fontSize: 12, color: "#38bdf8" }}>{item.waba.wabaId}</code>
                                <div style={{ fontSize: 11, color: "#64748b" }}>{item.waba.name}</div>
                              </div>
                            ) : (
                              <span style={{ color: "#64748b" }}>Not created</span>
                            )}
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            {item.phone?.phoneNumber ? (
                              <div>
                                <span style={{ fontWeight: 700, color: "#fff" }}>{item.phone.phoneNumber}</span>
                                <div style={{ fontSize: 11, color: "#64748b" }}>ID: {item.phone.phoneNumberId}</div>
                              </div>
                            ) : (
                              <span style={{ color: "#64748b" }}>Not registered</span>
                            )}
                          </td>
                          <td style={{ padding: "14px 18px", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenAssistModal(item)}
                              style={{
                                background: "#2563eb",
                                color: "#fff",
                                border: 0,
                                borderRadius: 6,
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              ⚙️ Assist Setup
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* MODAL FOR META APP REVIEW & PERMISSIONS */}
        {showPermissionsModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
            <div style={{ background: "#172235", border: "1px solid #334155", borderRadius: 14, maxWidth: 640, width: "100%", padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>
                  🛡️ Meta App Review &amp; Permissions Inspector
                </h3>
                <button onClick={() => setShowPermissionsModal(false)} style={{ background: "transparent", border: 0, color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>

              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px", lineHeight: 1.5 }}>
                To onboard external production customers without adding them as app testers, your Meta Developer App requires <strong>Advanced Access</strong> for the following WhatsApp scopes:
              </p>

              {permissionsLoading ? (
                <div style={{ textAlign: "center", padding: 24, color: "#94a3b8", fontSize: 13 }}>Querying Meta Graph API permissions…</div>
              ) : (
                <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
                  {permissionsData?.requiredPermissions?.map((p: any) => (
                    <div key={p.permission} style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <div>
                          <code style={{ fontSize: 13, fontWeight: 800, color: "#38bdf8" }}>{p.permission}</code>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{p.description}</div>
                        </div>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          borderRadius: 12,
                          padding: "2px 8px",
                          background: p.hasAdvancedAccess ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                          color: p.hasAdvancedAccess ? "#86efac" : "#fde68a",
                        }}>
                          {p.liveAccessLevel?.replace(/_/g, " ").toUpperCase() || "STANDARD ACCESS"}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                        <a
                          href={p.directSubmissionUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: "#2563eb",
                            color: "#fff",
                            textDecoration: "none",
                            borderRadius: 6,
                            padding: "5px 12px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          Request in App Dashboard ↗
                        </a>
                      </div>
                    </div>
                  )) || (
                    <div style={{ color: "#f87171", fontSize: 12 }}>Could not query Meta API. Check META_APP_ID in .env.</div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #334155", paddingTop: 14 }}>
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#38bdf8", fontSize: 12, textDecoration: "none", fontWeight: 700 }}
                >
                  Open Meta Developer Console ↗
                </a>
                <button
                  type="button"
                  onClick={() => setShowPermissionsModal(false)}
                  style={{ background: "#334155", color: "#e2e8f0", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {showSetupModal && selectedSession && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
            <div style={{ background: "#172235", border: "1px solid #334155", borderRadius: 14, maxWidth: 480, width: "100%", padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
              <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                Assist Customer Onboarding
              </h3>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
                Workspace: <strong>{selectedSession.organizationName}</strong> (ID: {selectedSession.organizationId})
              </p>

              <form onSubmit={handleSaveDelegatedSetup} style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" }}>WABA ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1290742346350527"
                    value={form.wabaId}
                    onChange={e => setForm({ ...form, wabaId: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" }}>Phone Number ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1065285676669805"
                    value={form.phoneNumberId}
                    onChange={e => setForm({ ...form, phoneNumberId: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" }}>Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={form.phoneNumber}
                    onChange={e => setForm({ ...form, phoneNumber: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" }}>Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. ABC Technologies"
                    value={form.displayName}
                    onChange={e => setForm({ ...form, displayName: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" }}>6-Digit PIN (for Cloud API Registration)</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={form.pin}
                    onChange={e => setForm({ ...form, pin: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13 }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowSetupModal(false)}
                    style={{ background: "#334155", color: "#e2e8f0", border: 0, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    style={{ background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}
                  >
                    {busy ? "Saving…" : "Save & Activate WABA"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
