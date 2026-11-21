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
  const [appModalTab, setAppModalTab] = useState<"dashboard" | "roles" | "permissions">("dashboard")
  const [newRoleUserId, setNewRoleUserId] = useState("")
  const [newRoleType, setNewRoleType] = useState<"testers" | "developers" | "administrators">("testers")
  const [roleSubmitting, setRoleSubmitting] = useState(false)
  const [roleActionResult, setRoleActionResult] = useState<{ ok: boolean; message: string; directUrl?: string } | null>(null)
  const [apiTesting, setApiTesting] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<string | null>(null)

  const handleGrantRole = async (e: React.FormEvent) => {
    e.preventDefault()
    setRoleSubmitting(true)
    setRoleActionResult(null)
    try {
      const res = await fetch("/api/meta/permissions-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant_role", userId: newRoleUserId, role: newRoleType }),
      })
      const data = await res.json()
      if (res.ok) {
        setRoleActionResult({ ok: true, message: data.message })
        setNewRoleUserId("")
        const refresh = await fetch("/api/meta/permissions-request")
        if (refresh.ok) setPermissionsData(await refresh.json())
      } else {
        setRoleActionResult({ ok: false, message: data.error, directUrl: data.directUrl })
      }
    } catch (err: any) {
      setRoleActionResult({ ok: false, message: err.message || "Failed to grant role" })
    } finally {
      setRoleSubmitting(false)
    }
  }

  const handleTestApi = async () => {
    setApiTesting(true)
    setApiTestResult(null)
    try {
      const res = await fetch("/api/meta/permissions-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_api" }),
      })
      const data = await res.json()
      if (res.ok) {
        setApiTestResult(data.message)
      } else {
        setApiTestResult(`✕ ${data.error}`)
      }
    } catch (err: any) {
      setApiTestResult(`✕ ${err.message}`)
    } finally {
      setApiTesting(false)
    }
  }

  // Portfolio Access, People & Partners Modal state
  const [showPortfolioAccessModal, setShowPortfolioAccessModal] = useState(false)
  const [selectedTenantForAccess, setSelectedTenantForAccess] = useState<SessionItem | null>(null)
  const [portfolioAccessData, setPortfolioAccessData] = useState<any>(null)
  const [portfolioAccessLoading, setPortfolioAccessLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [accessActionResult, setAccessActionResult] = useState<any>(null)
  const [selectedPartnerTier, setSelectedPartnerTier] = useState<"full" | "partial">("full")
  const [customUserIdInput, setCustomUserIdInput] = useState("122105442147545330")

  const handleOpenPortfolioAccess = async (item: SessionItem) => {
    setSelectedTenantForAccess(item)
    setShowPortfolioAccessModal(true)
    setPortfolioAccessLoading(true)
    setAccessActionResult(null)
    try {
      const res = await fetch(`/api/admin/onboarding/portfolio-access?orgId=${item.organizationId}`)
      const data = await res.json()
      if (res.ok) setPortfolioAccessData(data)
      else setError(data.error || "Failed to load Portfolio Access details.")
    } catch (err: any) {
      setError(err?.message || "Failed to load Portfolio Access details.")
    } finally {
      setPortfolioAccessLoading(false)
    }
  }

  const handleAssignAgencyPartner = async () => {
    if (!selectedTenantForAccess) return
    setActionLoading(true)
    setAccessActionResult(null)
    try {
      const res = await fetch("/api/admin/onboarding/portfolio-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedTenantForAccess.organizationId,
          action: "assign_agency_partner",
          accessLevel: selectedPartnerTier,
        }),
      })
      const data = await res.json()
      setAccessActionResult(data)
      if (res.ok) {
        setNotice(`✓ ${data.message}`)
        // reload data
        const refreshRes = await fetch(`/api/admin/onboarding/portfolio-access?orgId=${selectedTenantForAccess.organizationId}`)
        const refreshedData = await refreshRes.json()
        if (refreshRes.ok) setPortfolioAccessData(refreshedData)
      } else {
        setError(data.error || "Failed to assign agency partner.")
      }
    } catch (err: any) {
      setError(err?.message || "Network error assigning agency partner.")
    } finally {
      setActionLoading(false)
    }
  }

  const handleAssignPersonAsset = async () => {
    if (!selectedTenantForAccess) return
    setActionLoading(true)
    setAccessActionResult(null)
    try {
      const res = await fetch("/api/admin/onboarding/portfolio-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedTenantForAccess.organizationId,
          action: "assign_person_asset",
          targetUserId: customUserIdInput.trim() || "122105442147545330",
        }),
      })
      const data = await res.json()
      setAccessActionResult(data)
      if (res.ok) {
        setNotice(`✓ ${data.message}`)
        const refreshRes = await fetch(`/api/admin/onboarding/portfolio-access?orgId=${selectedTenantForAccess.organizationId}`)
        const refreshedData = await refreshRes.json()
        if (refreshRes.ok) setPortfolioAccessData(refreshedData)
      } else {
        setError(data.error || "Failed to assign user to WABA assets.")
      }
    } catch (err: any) {
      setError(err?.message || "Network error assigning user.")
    } finally {
      setActionLoading(false)
    }
  }

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
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => handleOpenPortfolioAccess(item)}
                                style={{
                                  background: "#0f766e",
                                  color: "#fff",
                                  border: 0,
                                  borderRadius: 6,
                                  padding: "6px 12px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                🛡️ People &amp; Partners
                              </button>
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
                            </div>
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

        {/* MODAL FOR META BUSINESS PORTFOLIO ACCESS, PEOPLE & PARTNERS */}
        {showPortfolioAccessModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }}>
            <div style={{ background: "#172235", border: "1.5px solid #0f766e", borderRadius: 14, maxWidth: 840, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24, boxShadow: "0 25px 50px rgba(0,0,0,0.6)" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 20 }}>🛡️</span>
                    <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>
                      Meta Business Portfolio Access, People &amp; Partners
                    </h3>
                    <span style={{ background: "#0f766e", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10 }}>
                      SUPPORT ADMIN WORKSPACE
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
                    Tenant: <strong>{selectedTenantForAccess?.organizationName}</strong> &bull; Slug: <code>{selectedTenantForAccess?.slug}</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPortfolioAccessModal(false)}
                  style={{ background: "transparent", border: 0, color: "#94a3b8", fontSize: 20, cursor: "pointer", padding: "0 4px" }}
                >
                  ✕
                </button>
              </div>

              {portfolioAccessLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 13 }}>
                  Querying Meta Business Portfolio, People &amp; Partner asset permissions…
                </div>
              ) : (
                <div style={{ display: "grid", gap: 18 }}>
                  {/* Action result banner */}
                  {accessActionResult && (
                    <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid #10b981", borderRadius: 8, padding: 12, color: "#34d399", fontSize: 12 }}>
                      <strong>✓ Result:</strong> {accessActionResult.message}
                    </div>
                  )}

                  {/* Portfolio & WABA Overview Strip */}
                  <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 10, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Business Portfolio</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2 }}>{portfolioAccessData?.portfolio?.name || "Portfolio"}</div>
                      <div style={{ fontSize: 11, color: "#38bdf8", fontFamily: "monospace" }}>ID: {portfolioAccessData?.portfolio?.id}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Primary WABA</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2 }}>{portfolioAccessData?.waba?.name || "WhatsApp Account"}</div>
                      <div style={{ fontSize: 11, color: "#38bdf8", fontFamily: "monospace" }}>ID: {portfolioAccessData?.waba?.wabaId}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Primary Phone</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#86efac", marginTop: 2 }}>{portfolioAccessData?.phone?.phoneNumber || "Not registered"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>ID: {portfolioAccessData?.phone?.phoneNumberId}</div>
                    </div>
                  </div>

                  {/* SECTION 1: AGENCY PARTNERS (Users -> Partners) */}
                  <div style={{ background: "#0b1320", border: `1.5px solid ${portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS" ? "#10b981" : "#f59e0b"}`, borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🤝</span>
                          <h4 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>
                            Agency Partner: Zkandhavel Infotech Private Limited (246511357935583)
                          </h4>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: 10,
                            background: portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                            color: portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS" ? "#86efac" : "#fde68a",
                          }}>
                            {portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS" ? "✓ FULL ACCESS (FULL CONTROL)" : "PARTIAL / NOT ASSIGNED"}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>
                          {portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS"
                            ? "✓ Zkandhavel Infotech has Full Control over this customer's Meta Business Portfolio & WABA assets (MANAGE, MESSAGING, TEMPLATES)."
                            : "Assign Zkandhavel Infotech as the official Agency Partner in the customer's Meta Business Portfolio with Full Control."}
                        </p>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select
                          value={selectedPartnerTier}
                          onChange={e => setSelectedPartnerTier(e.target.value as "full" | "partial")}
                          style={{ background: "#172235", border: "1px solid #334155", color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 11, fontWeight: 700 }}
                        >
                          <option value="full">Full Access (Full Control)</option>
                          <option value="partial">Partial Access</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleAssignAgencyPartner}
                          disabled={actionLoading}
                          style={{
                            background: portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS" ? "#047857" : "#059669",
                            color: "#fff",
                            border: 0,
                            borderRadius: 6,
                            padding: "7px 14px",
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: actionLoading ? "not-allowed" : "pointer",
                          }}
                        >
                          {actionLoading ? "Assigning…" : portfolioAccessData?.agencyPartner?.accessLevel === "FULL_ACCESS" ? "✓ Re-Sync / Update Access" : "⚡ 1-Click Auto-Assign Partner"}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11, borderTop: "1px solid #1e293b", paddingTop: 10 }}>
                      <span style={{ color: "#94a3b8" }}>Direct Meta Business Suite Link:</span>
                      <a
                        href={portfolioAccessData?.metaLinks?.partners || `https://business.facebook.com/latest/settings/partners?business_id=${portfolioAccessData?.portfolio?.id}&selected_partner_id=246511357935583`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        ↗ Open Users &rarr; Partners in Meta Business Suite
                      </a>
                    </div>
                  </div>

                  {/* SECTION 2: PEOPLE & USERS (Users -> People) */}
                  <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>👥</span>
                        <h4 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>
                          People &amp; Support Admins ({portfolioAccessData?.people?.users?.length || 0} Assigned)
                        </h4>
                      </div>
                      <a
                        href={portfolioAccessData?.metaLinks?.people || `https://business.facebook.com/settings/people?business_id=${portfolioAccessData?.portfolio?.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#38bdf8", textDecoration: "none", fontSize: 11, fontWeight: 700 }}
                      >
                        ↗ Open Users &rarr; People in Meta Business Suite
                      </a>
                    </div>

                    {/* Assigned Users list */}
                    <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                      {portfolioAccessData?.people?.users?.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#94a3b8", background: "#172235", padding: 10, borderRadius: 6 }}>
                          No specific business users directly assigned on WABA assets yet. Use the 1-click assign tool below.
                        </div>
                      ) : (
                        portfolioAccessData?.people?.users?.map((u: any) => (
                          <div key={u.id} style={{ background: "#172235", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <div>
                              <strong style={{ fontSize: 12, color: "#fff" }}>{u.name}</strong>
                              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 8 }}>ID: {u.id}</span>
                            </div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {u.tasks?.map((task: string) => (
                                <span key={task} style={{ background: "rgba(59,130,246,0.2)", color: "#93c5fd", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>
                                  {task}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 1-Click Assign User to WABA tool */}
                    <div style={{ background: "#172235", borderRadius: 8, padding: 12, border: "1px solid #334155" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", marginBottom: 6 }}>
                        ⚡ 1-Click Assign Support Admin / Business User to WABA Assets:
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          type="text"
                          value={customUserIdInput}
                          onChange={e => setCustomUserIdInput(e.target.value)}
                          placeholder="Meta Business User ID (e.g. 122105442147545330)"
                          style={{ flex: 1, minWidth: 240, background: "#0b1320", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#fff" }}
                        />
                        <button
                          type="button"
                          onClick={handleAssignPersonAsset}
                          disabled={actionLoading}
                          style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 800, cursor: actionLoading ? "not-allowed" : "pointer" }}
                        >
                          {actionLoading ? "Assigning…" : "Assign to WABA"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 3: DIRECT ASSET PERMISSION LINKS */}
                  <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 10 }}>
                      📋 Direct Pre-filled Meta Business Suite Asset Links for this Tenant:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                      <a
                        href={portfolioAccessData?.metaLinks?.whatsappAccounts || `https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=${portfolioAccessData?.portfolio?.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ background: "#172235", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#38bdf8", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>WhatsApp Accounts &rarr; Assign Assets</span>
                        <span>↗</span>
                      </a>
                      <a
                        href={portfolioAccessData?.metaLinks?.partners || `https://business.facebook.com/latest/settings/partners?business_id=${portfolioAccessData?.portfolio?.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ background: "#172235", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#38bdf8", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>Users &rarr; Partners</span>
                        <span>↗</span>
                      </a>
                      <a
                        href={portfolioAccessData?.metaLinks?.people || `https://business.facebook.com/settings/people?business_id=${portfolioAccessData?.portfolio?.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ background: "#172235", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#38bdf8", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>Users &rarr; People</span>
                        <span>↗</span>
                      </a>
                      <a
                        href={portfolioAccessData?.metaLinks?.phoneNumbers || `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${portfolioAccessData?.portfolio?.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ background: "#172235", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#38bdf8", textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>Phone Numbers &rarr; 2FA / Release</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>

                  {/* Close button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setShowPortfolioAccessModal(false)}
                      style={{ background: "#334155", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Close Manager
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {showPermissionsModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
            <div style={{ background: "#172235", border: "1.5px solid #0e8b71", borderRadius: 14, maxWidth: 780, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24, boxShadow: "0 25px 50px rgba(0,0,0,0.6)" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 14 }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(14,139,113,0.2)", color: "#86efac", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    ⚡ Automated Meta Developer App Dashboard &amp; Access Center
                  </div>
                  <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>
                    {permissionsData?.appDetails?.name || "rtawaba-zkwaconnect"}
                  </h3>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>App ID: <code style={{ color: "#38bdf8", background: "rgba(56,189,248,0.15)", padding: "1px 6px", borderRadius: 4 }}>{permissionsData?.appId || "1710743377107186"}</code></span>
                    <span>Portfolio ID: <code style={{ color: "#86efac", background: "rgba(14,139,113,0.2)", padding: "1px 6px", borderRadius: 4 }}>{permissionsData?.businessId || "246511357935583"}</code></span>
                    <span style={{ color: "#fbbf24" }}>🛠️ Development Mode (Roles &amp; Testers Active)</span>
                  </div>
                </div>
                <button onClick={() => setShowPermissionsModal(false)} style={{ background: "transparent", border: 0, color: "#94a3b8", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>
                {[
                  { id: "dashboard", label: "📊 App Overview & Live Health" },
                  { id: "roles", label: "👥 App Roles & Give Access" },
                  { id: "permissions", label: "🛡️ Permissions & Scopes" },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setAppModalTab(t.id as any)}
                    style={{
                      background: appModalTab === t.id ? "#0e8b71" : "rgba(255,255,255,0.06)",
                      border: 0,
                      color: appModalTab === t.id ? "#fff" : "rgba(255,255,255,0.6)",
                      padding: "7px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {permissionsLoading ? (
                <div style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 13 }}>Querying Meta Developer App live details…</div>
              ) : (
                <div>
                  {/* TAB 1: APP OVERVIEW & LIVE HEALTH */}
                  {appModalTab === "dashboard" && (
                    <div style={{ display: "grid", gap: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700 }}>App Name</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>{permissionsData?.appDetails?.name || "rtawaba-zkwaconnect"}</div>
                        </div>
                        <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700 }}>Category</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#38bdf8", marginTop: 2 }}>{permissionsData?.appDetails?.category || "Education"}</div>
                        </div>
                        <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700 }}>Contact Email</span>
                          <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 2 }}>{permissionsData?.appDetails?.contact_email || "freelancerswaminathan@gmail.com"}</div>
                        </div>
                        <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700 }}>Privacy Policy</span>
                          <div style={{ fontSize: 12, color: "#38bdf8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {permissionsData?.appDetails?.privacy_policy_url || "https://learner.recruitmenttrainingacademy.com/privacypolicy"}
                          </div>
                        </div>
                      </div>

                      {/* Live API Health & Verification Card */}
                      <div style={{ background: "#0b1320", border: "1px solid #0e8b71", borderRadius: 10, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#86efac" }}>⚡ Automated Cloud API Connectivity Test</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                              Verify that ZKWAConnect can communicate directly with this Meta App via Graph API.
                            </div>
                          </div>
                          <button
                            onClick={handleTestApi}
                            disabled={apiTesting}
                            style={{
                              background: "#25D366",
                              color: "#053d36",
                              border: 0,
                              borderRadius: 6,
                              padding: "8px 14px",
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: "pointer",
                              opacity: apiTesting ? 0.6 : 1,
                            }}
                          >
                            {apiTesting ? "Testing…" : "⚡ 1-Click Test & Verify API"}
                          </button>
                        </div>
                        {apiTestResult && (
                          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: apiTestResult.startsWith("✓") ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", color: apiTestResult.startsWith("✓") ? "#86efac" : "#fca5a5", fontSize: 12 }}>
                            {apiTestResult}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: APP ROLES & GIVE ACCESS DIRECTLY HERE */}
                  {appModalTab === "roles" && (
                    <div style={{ display: "grid", gap: 16 }}>
                      {/* Give Access Form */}
                      <div style={{ background: "#0b1320", border: "1.5px solid #25D366", borderRadius: 10, padding: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>⚡</span>
                          <h4 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>
                            Give Immediate Access to Meta User ID (No App Review Required!)
                          </h4>
                        </div>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "0 0 14px", lineHeight: 1.5 }}>
                          In Development Mode, any user added as a <b>Tester</b> or <b>Developer</b> receives immediate access to send &amp; receive live WhatsApp messages without waiting for Meta App Review approval.
                        </p>

                        <form onSubmit={handleGrantRole} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 4 }}>
                              Meta User ID *
                            </label>
                            <input
                              required
                              value={newRoleUserId}
                              onChange={e => setNewRoleUserId(e.target.value)}
                              placeholder="e.g. 122105442147545330"
                              style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#fff" }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 4 }}>
                              Access Role *
                            </label>
                            <select
                              value={newRoleType}
                              onChange={e => setNewRoleType(e.target.value as any)}
                              style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#fff" }}
                            >
                              <option value="testers">Tester (Immediate WhatsApp Messaging)</option>
                              <option value="developers">Developer (Full API &amp; Webhook Access)</option>
                              <option value="administrators">Administrator (Full App Control)</option>
                            </select>
                          </div>
                          <button
                            type="submit"
                            disabled={roleSubmitting}
                            style={{
                              background: "#25D366",
                              color: "#053d36",
                              border: 0,
                              borderRadius: 6,
                              padding: "9px 16px",
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: "pointer",
                              opacity: roleSubmitting ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {roleSubmitting ? "Granting…" : "⚡ Give Access"}
                          </button>
                        </form>

                        {roleActionResult && (
                          <div style={{
                            marginTop: 12,
                            padding: "8px 12px",
                            borderRadius: 6,
                            background: roleActionResult.ok ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                            color: roleActionResult.ok ? "#86efac" : "#fca5a5",
                            fontSize: 12,
                          }}>
                            <div>{roleActionResult.message}</div>
                            {roleActionResult.directUrl && (
                              <div style={{ marginTop: 6 }}>
                                <a
                                  href={roleActionResult.directUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "underline" }}
                                >
                                  Open Meta App Roles Dashboard to Confirm User ↗
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Current Authorized Users on App */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: ".05em" }}>
                            Current Authorized Users on this App ({permissionsData?.appRoles?.length || 0})
                          </span>
                          <a
                            href={permissionsData?.links?.rolesDashboard || `https://developers.facebook.com/apps/${permissionsData?.appId}/roles/roles/`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#38bdf8", fontSize: 11, textDecoration: "none", fontWeight: 700 }}
                          >
                            ↗ Manage in Meta Developers
                          </a>
                        </div>

                        <div style={{ background: "#0b1320", border: "1px solid #334155", borderRadius: 8, overflow: "hidden" }}>
                          {permissionsData?.appRoles?.map((r: any, idx: number) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: idx < permissionsData.appRoles.length - 1 ? "1px solid rgba(255,255,255,0.06)" : 0 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>User ID: {r.user}</div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>App ID: {r.app_id}</div>
                              </div>
                              <span style={{
                                background: r.role === "administrators" ? "rgba(56,189,248,0.15)" : "rgba(74,222,128,0.15)",
                                color: r.role === "administrators" ? "#38bdf8" : "#86efac",
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: "uppercase",
                              }}>
                                {r.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: PERMISSIONS & SCOPES */}
                  {appModalTab === "permissions" && (
                    <div style={{ display: "grid", gap: 12 }}>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 4px", lineHeight: 1.5 }}>
                        To onboard external production customers without adding them as app testers, your Meta Developer App requires <strong>Advanced Access</strong> for the following WhatsApp scopes:
                      </p>

                      {(permissionsData?.requiredPermissions || permissionsData?.permissionsStatus)?.map((p: any) => (
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
                              background: (p.hasAdvancedAccess || p.isAdvancedAccess) ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                              color: (p.hasAdvancedAccess || p.isAdvancedAccess) ? "#86efac" : "#fde68a",
                            }}>
                              {((p.liveAccessLevel || p.currentTier)?.replace(/_/g, " ").toUpperCase()) || "STANDARD ACCESS"}
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
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, marginTop: 18 }}>
                <a
                  href={permissionsData?.links?.appDashboard || `https://developers.facebook.com/apps/${permissionsData?.appId}/dashboard/`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#38bdf8", fontSize: 12, textDecoration: "none", fontWeight: 700 }}
                >
                  ↗ Open Meta Developers App Dashboard
                </a>
                <button
                  type="button"
                  onClick={() => setShowPermissionsModal(false)}
                  style={{ background: "#334155", color: "#e2e8f0", border: 0, borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
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
