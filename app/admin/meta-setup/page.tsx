"use client"

import React, { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Status = "pass" | "warn" | "fail" | "info"
type Check = { id: string; step: number; title: string; status: Status; detail: string }
type Result = {
  checks: Check[]
  values: {
    appId: string
    callbackUrl: string
    redirectUri: string
    verifyToken: string
    scopes: readonly { scope: string; purpose: string }[]
    publicUrl: string
    configId: string
    graphVersion: string
    appSecretSet: boolean
    encryptionKeySet: boolean
    canWriteEnv: boolean
  }
  summary: { pass: number; attention: number }
  checkedAt: string
}

type TenantItem = {
  id: string
  name: string
  slug: string
  status: string
  billingExempt?: boolean
  memberships: { user: { name: string; email: string } }[]
  subscriptions: { id: string; status: string; plan: { id: string; name: string } }[]
  onboarding: { currentStep: string; phoneVerified?: boolean } | null
  wabas: {
    id: string
    wabaId: string
    name: string
    status: string
    phoneNumbers: {
      id?: string
      phoneNumberId?: string
      phoneNumber: string
      displayName?: string | null
      status: string
      qualityRating: string | null
    }[]
  }[]
  metaConnections?: { id: string; status: string; businessManagerId?: string | null; updatedAt: string }[]
}

const STATUS: Record<Status, { icon: string; color: string; bg: string; label: string }> = {
  pass: { icon: "✓", color: "#4ade80", bg: "rgba(74,222,128,.12)", label: "OK" },
  warn: { icon: "!", color: "#fbbf24", bg: "rgba(251,191,36,.12)", label: "Check" },
  fail: { icon: "✕", color: "#f87171", bg: "rgba(248,113,113,.12)", label: "Fix" },
  info: { icon: "i", color: "#93c5fd", bg: "rgba(147,197,253,.12)", label: "Manual" },
}

function Copy({ value, secret = false }: { value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret)
  const [copied, setCopied] = useState(false)
  if (!value) return <span style={{ color: "#f87171", fontSize: 12 }}>Not configured</span>
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <code style={{
        background: "rgba(0,0,0,.35)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 12,
        color: "#e2e8f0",
        wordBreak: "break-all",
        fontFamily: "monospace",
      }}>
        {shown ? value : "•".repeat(Math.min(24, value.length))}
      </code>
      {secret && (
        <button onClick={() => setShown(v => !v)} style={smallBtn}>
          {shown ? "Hide" : "Show"}
        </button>
      )}
      <button
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
        style={smallBtn}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </span>
  )
}

const smallBtn: React.CSSProperties = {
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.15)",
  color: "#e2e8f0",
  borderRadius: 6,
  padding: "3px 9px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
}

export default function MetaSetupPage() {
  const router = useRouter()
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeStep, setActiveStep] = useState<number>(1)
  const [expandedMode, setExpandedMode] = useState(false)

  // Tenants data for Step 6
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(false)
  const [tenantQuery, setTenantQuery] = useState("")
  const [tenantFilter, setTenantFilter] = useState<"ALL" | "CONNECTED" | "PENDING">("ALL")

  // Add Tenant Wizard Modal State
  const [showAddTenantModal, setShowAddTenantModal] = useState(false)
  const [newTenantStep, setNewTenantStep] = useState<1 | 2 | 3>(1)
  const [newTenantForm, setNewTenantForm] = useState({
    organizationName: "",
    ownerName: "",
    email: "",
    password: "Password@123",
    phone: "",
    internal: false,
    metaMode: "delegated", // "delegated" or "self_serve"
  })
  const [tenantCreating, setTenantCreating] = useState(false)
  const [tenantCreateSuccess, setTenantCreateSuccess] = useState<any>(null)
  const [tenantCreateError, setTenantCreateError] = useState("")

  const run = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/meta-setup")
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Checks failed to run.")
      setResult(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checks failed to run.")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTenants = useCallback(async () => {
    setTenantsLoading(true)
    try {
      const res = await fetch("/api/admin/customers?page=1&limit=50")
      const data = await res.json()
      if (res.ok && data.organizations) {
        setTenants(data.organizations)
      }
    } catch {
      // silently fail
    } finally {
      setTenantsLoading(false)
    }
  }, [])

  useEffect(() => {
    run()
    loadTenants()
  }, [run, loadTenants])

  async function handleSwitchToClientPortal(orgId: string) {
    try {
      const res = await fetch("/api/admin/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orgId, action: "switch-workspace" }),
      })
      const data = await res.json()
      if (res.ok && data.redirect) {
        router.push(data.redirect)
      } else {
        router.push("/app/settings")
      }
    } catch {
      router.push("/app/settings")
    }
  }

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault()
    setTenantCreating(true)
    setTenantCreateError("")
    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: newTenantForm.organizationName,
          ownerName: newTenantForm.ownerName,
          email: newTenantForm.email,
          password: newTenantForm.password,
          phone: newTenantForm.phone,
          internal: newTenantForm.internal,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create tenant")
      setTenantCreateSuccess(data)
      loadTenants()
    } catch (err: any) {
      setTenantCreateError(err.message || "Failed to create tenant")
    } finally {
      setTenantCreating(false)
    }
  }

  const v = result?.values

  // Step definitions
  const steps = [
    {
      n: 1,
      id: "developer-app",
      title: "Meta Developer App",
      short: "1. App Basics",
      desc: "Connect your single Tech Provider Meta App in your verified Business Portfolio.",
      icon: "📱",
      body: (
        <div>
          <p style={pStyle}>
            ZKWAConnect uses <b style={{ color: "#fff" }}>one Meta app that you own as the Tech Provider</b>. Your clients
            never create apps or developer accounts — they connect through Embedded Signup or grant agency partner access.
          </p>
          <ol style={olStyle}>
            <li>Open <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={linkStyle}>developers.facebook.com/apps</a> and click <b>Create app</b>.</li>
            <li>Connect it to <b>your own business portfolio</b> — the app belongs to your agency, not your customers.</li>
            <li>Add the products: <b>WhatsApp</b>, <b>Facebook Login for Business</b>, and <b>Marketing API</b>.</li>
            <li>In <b>App settings → Basic</b>, copy the App ID & App secret, and add your Privacy Policy URL.</li>
          </ol>
        </div>
      ),
    },
    {
      n: 2,
      id: "credentials",
      title: "API Credentials & Secrets",
      short: "2. Credentials",
      desc: "Securely store App ID, App Secret, and Encryption Keys in .env.",
      icon: "🔑",
      body: (
        <div>
          <p style={pStyle}>
            Verify your Meta App ID and App Secret. ZKWAConnect verifies them against Meta&apos;s Graph API in real-time.
          </p>
          {v && <CredentialsForm values={v} onSaved={run} />}
        </div>
      ),
    },
    {
      n: 3,
      id: "oauth-redirects",
      title: "OAuth & Redirect URIs",
      short: "3. Login & OAuth",
      desc: "Register valid redirect URIs in Facebook Login for Business.",
      icon: "🔗",
      body: (
        <div>
          <p style={pStyle}>
            In Meta Developers → <b>Facebook Login for Business → Settings → Valid OAuth Redirect URIs</b>:
          </p>
          <div style={{ background: "#172235", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: 16, margin: "14px 0" }}>
            <span style={kvLabel}>Valid OAuth Redirect URI</span>
            <Copy value={v?.redirectUri || ""} />
          </div>
          <div style={hintStyle}>
            💡 On localhost (development mode), Meta allows OAuth callbacks without HTTPS. For production, ensure your live HTTPS domain is added.
          </div>
        </div>
      ),
    },
    {
      n: 4,
      id: "webhooks",
      title: "Webhook Configuration",
      short: "4. Webhooks",
      desc: "Point Meta's WhatsApp event webhook at ZKWAConnect.",
      icon: "⚡",
      body: (
        <div>
          <p style={pStyle}>
            Configure your Meta Webhook so inbound customer messages, delivery receipts, and template approvals trigger instant live events.
          </p>
          <div style={{ display: "grid", gap: 12, background: "#172235", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: 16, margin: "14px 0" }}>
            <div>
              <span style={kvLabel}>Callback URL</span>
              <Copy value={v?.callbackUrl || ""} />
            </div>
            <div>
              <span style={kvLabel}>Verify Token</span>
              <Copy value={v?.verifyToken || ""} secret />
            </div>
          </div>
          <p style={{ ...pStyle, marginTop: 12 }}>
            In Meta WhatsApp → Configuration → Webhook, subscribe to: <b>“messages”</b> and <b>“message_template_status_update”</b>.
          </p>
          <RegisterWebhook defaultUrl={v?.callbackUrl || ""} onDone={run} />
        </div>
      ),
    },
    {
      n: 5,
      id: "app-review",
      title: "App Review & Permissions",
      short: "5. Permissions",
      desc: "Request Advanced Access for production Meta scopes.",
      icon: "🛡️",
      body: (
        <div>
          <p style={pStyle}>
            In Meta Developers → <b>App Review → Permissions and features</b>, request <b>Advanced Access</b> for:
          </p>
          <div style={{ display: "grid", gap: 8, margin: "14px 0" }}>
            {(v?.scopes || [
              { scope: "whatsapp_business_management", purpose: "Manage phone numbers, templates, and WABA configuration" },
              { scope: "whatsapp_business_messaging", purpose: "Send and receive live customer WhatsApp messages" },
              { scope: "business_management", purpose: "Read and link customer business portfolios and partner assets" },
            ]).map(item => (
              <div key={item.scope} style={{ background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <code style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>{item.scope}</code>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{item.purpose}</div>
                </div>
                <span style={{ fontSize: 11, background: "rgba(74,222,128,.15)", color: "#86efac", padding: "3px 8px", borderRadius: 4, fontWeight: 700 }}>
                  Advanced Access
                </span>
              </div>
            ))}
          </div>
          <div style={hintStyle}>
            🔒 Once your Business Verification is approved in Meta Business Suite, toggle the app switch in the top header from <b>Development</b> to <b>Live</b>.
          </div>
        </div>
      ),
    },
    {
      n: 6,
      id: "tenants",
      title: "Tenant Meta Integrations",
      short: "6. Tenants Status",
      desc: "Super Admin overview of existing tenant accounts, WABA connections, and provision new workspaces.",
      icon: "👥",
      body: (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#fff" }}>
                Active Tenant Accounts & Meta Connection Status
              </h3>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: "4px 0 0" }}>
                Every tenant connects through this centralized Meta Tech Provider app.
              </p>
            </div>
            <button
              onClick={() => {
                setShowAddTenantModal(true)
                setNewTenantStep(1)
                setTenantCreateSuccess(null)
                setTenantCreateError("")
              }}
              style={{
                background: "#0e8b71",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 4px 12px rgba(14,139,113,0.3)",
              }}
            >
              <span>➕</span> Add New Tenant for Meta Setup
            </button>
          </div>

          {/* Search & Filter */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search tenant name or owner email..."
              value={tenantQuery}
              onChange={e => setTenantQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: 220,
                background: "rgba(0,0,0,.3)",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: "#fff",
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {(["ALL", "CONNECTED", "PENDING"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setTenantFilter(tab)}
                  style={{
                    background: tenantFilter === tab ? "#1e293b" : "transparent",
                    border: "1px solid rgba(255,255,255,.12)",
                    color: tenantFilter === tab ? "#fff" : "rgba(255,255,255,.5)",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {tab === "ALL" ? "All Tenants" : tab === "CONNECTED" ? "✓ Meta Connected" : "⏳ Pending"}
                </button>
              ))}
            </div>
          </div>

          {/* Tenants Table */}
          {tenantsLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,.5)" }}>Loading tenant accounts…</div>
          ) : (
            <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, overflow: "hidden", background: "#172235" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1.2fr",
                padding: "12px 16px",
                background: "#0f172a",
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,.5)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                borderBottom: "1px solid rgba(255,255,255,.08)",
              }}>
                <div>Tenant / Workspace</div>
                <div>Owner</div>
                <div>Meta Connection</div>
                <div>WABA / Phone</div>
                <div style={{ textAlign: "right" }}>Actions</div>
              </div>

              {tenants
                .filter(t => {
                  if (tenantFilter === "CONNECTED") return t.metaConnections?.length || t.wabas?.length
                  if (tenantFilter === "PENDING") return !t.metaConnections?.length && !t.wabas?.length
                  return true
                })
                .filter(t => {
                  if (!tenantQuery) return true
                  const q = tenantQuery.toLowerCase()
                  return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.memberships[0]?.user?.email?.toLowerCase().includes(q)
                })
                .map(tenant => {
                  const hasMeta = Boolean(tenant.metaConnections?.length || tenant.wabas?.length)
                  const primaryWaba = tenant.wabas?.[0]
                  const primaryPhone = primaryWaba?.phoneNumbers?.[0]
                  return (
                    <div
                      key={tenant.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1.2fr",
                        padding: "14px 16px",
                        borderBottom: "1px solid rgba(255,255,255,.05)",
                        alignItems: "center",
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{tenant.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)" }}>slug: {tenant.slug}</div>
                      </div>
                      <div>
                        <div style={{ color: "#cbd5e1" }}>{tenant.memberships[0]?.user?.name || "No Owner"}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)" }}>{tenant.memberships[0]?.user?.email || "—"}</div>
                      </div>
                      <div>
                        {hasMeta ? (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "rgba(74,222,128,.15)",
                            color: "#86efac",
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            ✓ Connected
                          </span>
                        ) : (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "rgba(251,191,36,.15)",
                            color: "#fde047",
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            ⏳ Pending Setup
                          </span>
                        )}
                      </div>
                      <div>
                        {primaryWaba ? (
                          <div>
                            <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{primaryWaba.name || "WABA"}</div>
                            <div style={{ fontSize: 11, color: "#4ade80" }}>{primaryPhone?.phoneNumber || primaryWaba.wabaId}</div>
                          </div>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 12 }}>None</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <a
                          href={`/admin/onboarding?search=${encodeURIComponent(tenant.name)}`}
                          style={{
                            background: "rgba(255,255,255,.08)",
                            border: "1px solid rgba(255,255,255,.15)",
                            color: "#e2e8f0",
                            borderRadius: 6,
                            padding: "5px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          👑 Delegated Setup
                        </a>
                        <button
                          onClick={() => handleSwitchToClientPortal(tenant.id)}
                          style={{
                            background: "#075e54",
                            border: 0,
                            color: "#fff",
                            borderRadius: 6,
                            padding: "5px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          🌐 Portal
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      ),
    },
  ]

  // Calculate worst status for each step
  const getStepStatus = (stepNum: number): Status => {
    if (stepNum === 6) {
      const connectedCount = tenants.filter(t => t.metaConnections?.length || t.wabas?.length).length
      return connectedCount > 0 ? "pass" : "info"
    }
    const stepChecks = result?.checks.filter(check => check.step === stepNum) || []
    if (stepChecks.some(c => c.status === "fail")) return "fail"
    if (stepChecks.some(c => c.status === "warn")) return "warn"
    if (stepChecks.length && stepChecks.every(c => c.status === "pass")) return "pass"
    return "info"
  }

  const currentStepData = steps.find(s => s.n === activeStep) || steps[0]
  const currentStepChecks = result?.checks.filter(c => c.step === activeStep) || []
  const worstCurrent = getStepStatus(activeStep)

  return (
    <div style={{ minHeight: "100vh", background: "#0b1320", color: "#fff", fontFamily: "DM Sans, sans-serif", display: "flex" }}>
      {/* =========================================================================
          LEFT SIDEBAR NAVIGATION (Admin + Wizard Stepper)
          ========================================================================= */}
      <aside style={{
        width: 280,
        background: "#0f172a",
        borderRight: "1px solid rgba(255,255,255,.08)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}>
        {/* Brand Header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(220,38,38,.15)", border: "1px solid rgba(220,38,38,.3)", borderRadius: 16, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#fca5a5", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>
            🔐 Super Admin
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>
            ZKWAConnect
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)" }}>
            Meta Platform Administration
          </div>
        </div>

        {/* Global Admin Links */}
        <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".1em", padding: "0 8px 6px" }}>
            Admin Console
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <a href="/admin/dashboard" style={adminNavLink(false)}>
              <span>📊</span> Dashboard
            </a>
            <a href="/admin/onboarding" style={adminNavLink(false)}>
              <span>👑</span> Delegated Onboarding
            </a>
            <a href="/admin/meta-setup" style={adminNavLink(true)}>
              <span>⚙️</span> Meta App Setup
            </a>
            <a href="/admin/go-live" style={adminNavLink(false)}>
              <span>🚀</span> Go-Live Checklist
            </a>
            <a href="/admin/plans" style={adminNavLink(false)}>
              <span>💳</span> Plans & Pricing
            </a>
            <a href="/admin/partners" style={adminNavLink(false)}>
              <span>🤝</span> Agency Partners
            </a>
            <a href="/admin/messaging" style={adminNavLink(false)}>
              <span>💬</span> Messaging Logs
            </a>
          </nav>
        </div>

        {/* Meta Setup Wizard Stepper in Left Sidebar */}
        <div style={{ padding: "14px 12px", flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px 8px" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".1em" }}>
              Setup Wizard Steps
            </span>
            <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>
              {activeStep} / 6
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {steps.map(step => {
              const status = getStepStatus(step.n)
              const badge = STATUS[status]
              const isSelected = activeStep === step.n
              return (
                <button
                  key={step.n}
                  onClick={() => {
                    setActiveStep(step.n)
                    setExpandedMode(false)
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: isSelected ? "1px solid rgba(37,211,102,.4)" : "1px solid transparent",
                    background: isSelected ? "rgba(37,211,102,.12)" : "transparent",
                    color: isSelected ? "#fff" : "rgba(255,255,255,.7)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: badge.bg,
                    color: badge.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {status === "pass" ? "✓" : step.n}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {step.title}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: badge.color,
                    background: badge.bg,
                    padding: "2px 5px",
                    borderRadius: 4,
                  }}>
                    {badge.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Client Portal Switcher & Footer */}
        <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,.08)", background: "#0b1320" }}>
          <div style={{ background: "rgba(7,94,84,.2)", border: "1px solid rgba(7,94,84,.4)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>
              🌐 Client Portal
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", lineHeight: 1.4, marginBottom: 8 }}>
              Experience WhatsApp settings exactly as your customers do.
            </div>
            <a
              href="/app/settings"
              style={{
                display: "block",
                textAlign: "center",
                background: "#075e54",
                color: "#fff",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 8px",
                borderRadius: 6,
              }}
            >
              Open Client Settings →
            </a>
          </div>

          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" })
              router.push("/admin/login")
            }}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid rgba(255,255,255,.12)",
              color: "rgba(255,255,255,.6)",
              borderRadius: 6,
              padding: "7px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign out of Admin
          </button>
        </div>
      </aside>

      {/* =========================================================================
          MAIN VIEWPORT: WIZARD BASED CONTENT
          ========================================================================= */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto" }}>
        {/* Top Header Bar */}
        <header style={{
          background: "#1e293b",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚙️</span>
              <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>
                Meta Platform App Setup & Onboarding Wizard
              </h1>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "4px 0 0" }}>
              Configure your single Tech Provider Meta App & inspect tenant connections.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {result && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", background: "rgba(0,0,0,.25)", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)" }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{result.summary.pass} passing</span>
                {" · "}
                <span style={{ color: result.summary.attention ? "#fbbf24" : "#4ade80", fontWeight: 700 }}>
                  {result.summary.attention} need attention
                </span>
              </div>
            )}
            <button
              onClick={run}
              disabled={loading}
              style={{
                background: "#25D366",
                color: "#053d36",
                border: 0,
                borderRadius: 8,
                padding: "8px 14px",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Checking…" : "🔄 Re-run checks"}
            </button>
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noreferrer"
              style={{
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.15)",
                color: "#e2e8f0",
                textDecoration: "none",
                borderRadius: 8,
                padding: "8px 12px",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              ↗ Meta Developers
            </a>
          </div>
        </header>

        {/* Stepper Tabs Bar (Compact Horizontal Wizard Indicator) */}
        <div style={{ background: "#172235", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "10px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
              Step {activeStep} of 6: <span style={{ color: "#4ade80" }}>{currentStepData.title}</span>
            </span>
            <button
              onClick={() => setExpandedMode(v => !v)}
              style={{
                background: "transparent",
                border: 0,
                color: "rgba(255,255,255,.5)",
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {expandedMode ? "Switch to Step Wizard view" : "👁️ Expand All Steps (Classic view)"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {steps.map(step => {
              const status = getStepStatus(step.n)
              const badge = STATUS[status]
              const isSelected = activeStep === step.n
              return (
                <button
                  key={step.n}
                  onClick={() => {
                    setActiveStep(step.n)
                    setExpandedMode(false)
                  }}
                  style={{
                    background: isSelected ? "rgba(37,211,102,.2)" : "#1e293b",
                    border: isSelected ? "1.5px solid #25D366" : "1px solid rgba(255,255,255,.08)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: badge.bg,
                    color: badge.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                  }}>
                    {status === "pass" ? "✓" : step.n}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "#fff" : "rgba(255,255,255,.6)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {step.short}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Wizard Main Content Container */}
        <div style={{ flex: 1, padding: "24px 28px 60px", maxWidth: 1200, width: "100%", boxSizing: "border-box" }}>
          {error && (
            <div role="alert" style={{ background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.3)", color: "#fca5a5", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* =========================================================================
              EXPANDED ALL-IN-ONE VIEW (Optional)
              ========================================================================= */}
          {expandedMode ? (
            <div>
              {steps.map(step => {
                const stepChecks = result?.checks.filter(c => c.step === step.n) || []
                const worst = getStepStatus(step.n)
                return (
                  <section
                    key={step.n}
                    style={{
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 12,
                      padding: 24,
                      marginBottom: 16,
                      borderLeft: `4px solid ${STATUS[worst].color}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <span style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: STATUS[worst].bg,
                        color: STATUS[worst].color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 14,
                      }}>
                        {worst === "pass" ? "✓" : step.n}
                      </span>
                      <div>
                        <h2 style={{ fontFamily: "Sora, sans-serif", fontSize: 16, fontWeight: 700, margin: 0 }}>
                          {step.title}
                        </h2>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{step.desc}</div>
                      </div>
                    </div>
                    {step.body}
                  </section>
                )
              })}
            </div>
          ) : (
            /* =========================================================================
                STEP WIZARD VIEW (ONE COMPACT STEP AT A TIME)
                ========================================================================= */
            <div>
              <div style={{
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 14,
                overflow: "hidden",
                borderLeft: `4px solid ${STATUS[worstCurrent].color}`,
                boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              }}>
                {/* Step Header */}
                <div style={{
                  padding: "20px 24px",
                  background: "linear-gradient(180deg, #1f2d42 0%, #1e293b 100%)",
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: STATUS[worstCurrent].bg,
                      color: STATUS[worstCurrent].color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 16,
                      boxShadow: "0 0 16px " + STATUS[worstCurrent].bg,
                    }}>
                      {worstCurrent === "pass" ? "✓" : currentStepData.n}
                    </span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h2 style={{ fontFamily: "Sora, sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: "#fff" }}>
                          {currentStepData.title}
                        </h2>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: STATUS[worstCurrent].bg,
                          color: STATUS[worstCurrent].color,
                          padding: "2px 8px",
                          borderRadius: 4,
                          textTransform: "uppercase",
                          letterSpacing: ".05em",
                        }}>
                          {STATUS[worstCurrent].label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 2 }}>
                        {currentStepData.desc}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
                      disabled={activeStep === 1}
                      style={{
                        background: "rgba(255,255,255,.06)",
                        border: "1px solid rgba(255,255,255,.12)",
                        color: activeStep === 1 ? "rgba(255,255,255,.3)" : "#e2e8f0",
                        borderRadius: 8,
                        padding: "7px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: activeStep === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      ← Previous
                    </button>
                    <button
                      onClick={() => setActiveStep(prev => Math.min(6, prev + 1))}
                      disabled={activeStep === 6}
                      style={{
                        background: activeStep === 6 ? "rgba(255,255,255,.06)" : "#25D366",
                        border: 0,
                        color: activeStep === 6 ? "rgba(255,255,255,.3)" : "#053d36",
                        borderRadius: 8,
                        padding: "7px 16px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: activeStep === 6 ? "not-allowed" : "pointer",
                      }}
                    >
                      {activeStep === 6 ? "Completed" : "Next Step →"}
                    </button>
                  </div>
                </div>

                {/* Step Body & Diagnostics Grid */}
                <div style={{ padding: 24, display: "grid", gridTemplateColumns: currentStepChecks.length ? "1.4fr 1fr" : "1fr", gap: 24 }}>
                  {/* Left Column: Form & Step Instructions */}
                  <div>
                    {currentStepData.body}
                  </div>

                  {/* Right Column: Live Meta Status Diagnostics for this step */}
                  {currentStepChecks.length > 0 && (
                    <div style={{ borderLeft: "1px solid rgba(255,255,255,.08)", paddingLeft: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
                        Targeted Meta API Checks (Step {activeStep})
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {loading && !result ? (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>Checking Meta Graph API…</div>
                        ) : (
                          currentStepChecks.map(check => {
                            const style = STATUS[check.status]
                            return (
                              <div key={check.id} style={{ background: style.bg, border: `1px solid ${style.color}33`, borderRadius: 8, padding: "10px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                                  <span style={{ color: style.color }}>{style.icon}</span>
                                  <span style={{ color: "#fff" }}>{check.title}</span>
                                  <span style={{ marginLeft: "auto", fontSize: 10, color: style.color, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
                                    {style.label}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                                  {check.detail}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Step Footer */}
                <div style={{
                  padding: "16px 24px",
                  background: "#172235",
                  borderTop: "1px solid rgba(255,255,255,.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
                    Step {activeStep} of 6 · {currentStepData.title}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {activeStep > 1 && (
                      <button
                        onClick={() => setActiveStep(prev => prev - 1)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,.15)",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ← Back to Step {activeStep - 1}
                      </button>
                    )}
                    {activeStep < 6 ? (
                      <button
                        onClick={() => setActiveStep(prev => prev + 1)}
                        style={{
                          background: "#25D366",
                          border: 0,
                          color: "#053d36",
                          borderRadius: 8,
                          padding: "8px 20px",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: "pointer",
                          boxShadow: "0 4px 12px rgba(37,211,102,0.25)",
                        }}
                      >
                        Continue to Step {activeStep + 1}: {steps[activeStep]?.title} →
                      </button>
                    ) : (
                      <a
                        href="/admin/onboarding"
                        style={{
                          background: "#0e8b71",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "8px 20px",
                          fontSize: 13,
                          fontWeight: 800,
                          textDecoration: "none",
                        }}
                      >
                        Open Delegated Onboarding Hub →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =========================================================================
          ADD NEW TENANT WIZARD MODAL (Admin-side Provisioning Wizard)
          ========================================================================= */}
      {showAddTenantModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: 20,
        }}>
          <div style={{
            background: "#172235",
            border: "1.5px solid #0e8b71",
            borderRadius: 14,
            maxWidth: 620,
            width: "100%",
            padding: 28,
            boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
          }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 14 }}>
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(14,139,113,.2)", color: "#86efac", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  ⚡ Tenant Provisioning Wizard
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#fff" }}>
                  Add New Tenant for Meta Setup
                </h3>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "4px 0 0" }}>
                  Step {newTenantStep} of 3 · Provision tenant workspace and configure Meta integration
                </p>
              </div>
              <button
                onClick={() => setShowAddTenantModal(false)}
                style={{ background: "transparent", border: 0, color: "rgba(255,255,255,.5)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Stepper Progress */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
              {[
                { s: 1, label: "Workspace Details" },
                { s: 2, label: "Plan & Access" },
                { s: 3, label: "Meta Onboarding" },
              ].map(st => (
                <div
                  key={st.s}
                  style={{
                    background: newTenantStep >= st.s ? "rgba(14,139,113,.2)" : "rgba(255,255,255,.05)",
                    border: newTenantStep === st.s ? "1px solid #25D366" : "1px solid rgba(255,255,255,.08)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: newTenantStep >= st.s ? "#86efac" : "rgba(255,255,255,.4)",
                  }}
                >
                  {st.s}. {st.label}
                </div>
              ))}
            </div>

            {tenantCreateError && (
              <div style={{ background: "rgba(248,113,113,.15)", border: "1px solid #f87171", color: "#fca5a5", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
                {tenantCreateError}
              </div>
            )}

            {tenantCreateSuccess ? (
              <div style={{ textAlign: "center", padding: "20px 10px" }}>
                <div style={{ fontSize: 42, marginBottom: 12 }}>🎉</div>
                <h4 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>
                  Tenant Workspace Created Successfully!
                </h4>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginBottom: 20, lineHeight: 1.5 }}>
                  Workspace <b>{tenantCreateSuccess.workspace?.name}</b> was provisioned. You can now configure their WhatsApp Business Account or switch directly into their client portal.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button
                    onClick={() => {
                      setShowAddTenantModal(false)
                      handleSwitchToClientPortal(tenantCreateSuccess.workspace.id)
                    }}
                    style={{ background: "#075e54", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    🌐 Open Client Portal
                  </button>
                  <a
                    href={`/admin/onboarding?search=${encodeURIComponent(tenantCreateSuccess.workspace.name)}`}
                    style={{ background: "#25D366", color: "#053d36", borderRadius: 8, padding: "10px 18px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}
                  >
                    👑 Setup WABA in Onboarding Hub
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateTenant}>
                {newTenantStep === 1 && (
                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={kvLabel}>Organization / Company Name *</label>
                      <input
                        required
                        value={newTenantForm.organizationName}
                        onChange={e => setNewTenantForm(f => ({ ...f, organizationName: e.target.value }))}
                        placeholder="e.g. Apex Global Enterprises"
                        style={darkInput}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={kvLabel}>Owner Full Name *</label>
                        <input
                          required
                          value={newTenantForm.ownerName}
                          onChange={e => setNewTenantForm(f => ({ ...f, ownerName: e.target.value }))}
                          placeholder="e.g. Rajesh Kumar"
                          style={darkInput}
                        />
                      </div>
                      <div>
                        <label style={kvLabel}>Owner Email Address *</label>
                        <input
                          required
                          type="email"
                          value={newTenantForm.email}
                          onChange={e => setNewTenantForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="client@apexglobal.com"
                          style={darkInput}
                        />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={kvLabel}>Initial Password *</label>
                        <input
                          required
                          value={newTenantForm.password}
                          onChange={e => setNewTenantForm(f => ({ ...f, password: e.target.value }))}
                          style={darkInput}
                        />
                      </div>
                      <div>
                        <label style={kvLabel}>Phone Number (Optional)</label>
                        <input
                          value={newTenantForm.phone}
                          onChange={e => setNewTenantForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="+91 98765 43210"
                          style={darkInput}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {newTenantStep === 2 && (
                  <div style={{ display: "grid", gap: 14 }}>
                    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 16 }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={newTenantForm.internal}
                          onChange={e => setNewTenantForm(f => ({ ...f, internal: e.target.checked }))}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                            Internal Company / Billing-Exempt Workspace
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
                            Exempt from subscription charges, full access to all WhatsApp automation, templates, and unlimited broadcasts.
                          </div>
                        </div>
                      </label>
                    </div>

                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.5, background: "#1f2d42", padding: 14, borderRadius: 8 }}>
                      💡 <b>Super Admin Access:</b> You as the Super Admin will automatically be added as an <code>ADMIN</code> member of this workspace, allowing seamless delegated onboarding and asset configuration.
                    </div>
                  </div>
                )}

                {newTenantStep === 3 && (
                  <div style={{ display: "grid", gap: 14 }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginBottom: 4 }}>
                      Choose how the customer&apos;s Meta WhatsApp Business Account will be connected:
                    </div>

                    <label style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: 14,
                      borderRadius: 8,
                      border: newTenantForm.metaMode === "delegated" ? "1.5px solid #25D366" : "1px solid rgba(255,255,255,.08)",
                      background: newTenantForm.metaMode === "delegated" ? "rgba(37,211,102,.12)" : "rgba(255,255,255,.04)",
                      cursor: "pointer",
                    }}>
                      <input
                        type="radio"
                        name="metaMode"
                        checked={newTenantForm.metaMode === "delegated"}
                        onChange={() => setNewTenantForm(f => ({ ...f, metaMode: "delegated" }))}
                        style={{ marginTop: 3 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                          👑 Super Admin Delegated Setup (Recommended)
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 2 }}>
                          You configure their WABA ID, Phone Number ID, and 2-Step PIN directly using the Onboarding Console.
                        </div>
                      </div>
                    </label>

                    <label style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: 14,
                      borderRadius: 8,
                      border: newTenantForm.metaMode === "self_serve" ? "1.5px solid #25D366" : "1px solid rgba(255,255,255,.08)",
                      background: newTenantForm.metaMode === "self_serve" ? "rgba(37,211,102,.12)" : "rgba(255,255,255,.04)",
                      cursor: "pointer",
                    }}>
                      <input
                        type="radio"
                        name="metaMode"
                        checked={newTenantForm.metaMode === "self_serve"}
                        onChange={() => setNewTenantForm(f => ({ ...f, metaMode: "self_serve" }))}
                        style={{ marginTop: 3 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                          🌐 Client Self-Serve Onboarding
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 2 }}>
                          The client logs in at <code>/login</code> and clicks &ldquo;Connect with Meta&rdquo; (Embedded Signup v4).
                        </div>
                      </div>
                    </label>
                  </div>
                )}

                {/* Modal Navigation Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  {newTenantStep > 1 ? (
                    <button
                      type="button"
                      onClick={() => setNewTenantStep(s => (s - 1) as any)}
                      style={{ background: "transparent", border: "1px solid rgba(255,255,255,.15)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      ← Back
                    </button>
                  ) : <div />}

                  {newTenantStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setNewTenantStep(s => (s + 1) as any)}
                      style={{ background: "#25D366", color: "#053d36", border: 0, borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      Next Step →
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={tenantCreating}
                      style={{ background: "#0e8b71", color: "#fff", border: 0, borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: tenantCreating ? 0.6 : 1 }}
                    >
                      {tenantCreating ? "Provisioning Tenant…" : "✓ Create Workspace & Launch Setup"}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function adminNavLink(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? "#fff" : "rgba(255,255,255,.6)",
    background: active ? "rgba(255,255,255,.1)" : "transparent",
    textDecoration: "none",
  }
}

const olStyle: React.CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }
const linkStyle: React.CSSProperties = { color: "#4ade80", fontWeight: 600 }
const preStyle: React.CSSProperties = { background: "rgba(0,0,0,.35)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 12, fontSize: 12, color: "#e2e8f0", overflowX: "auto", margin: 0, fontFamily: "monospace" }
const hintStyle: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 10, background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 12, lineHeight: 1.5 }
const pStyle: React.CSSProperties = { fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, margin: "0 0 12px" }
const kvLabel: React.CSSProperties = { display: "block", fontSize: 11, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4, fontWeight: 700 }
const darkInput: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "9px 11px", fontSize: 13, color: "#fff", fontFamily: "inherit" }

function CredentialsForm({ values, onSaved }: { values: Result["values"]; onSaved: () => Promise<void> }) {
  const [appId, setAppId] = useState(values.appId)
  const [appSecret, setAppSecret] = useState("")
  const [verifyToken, setVerifyToken] = useState("")
  const [generateVerifyToken, setGenerateVerifyToken] = useState(!values.verifyToken)
  const [configId, setConfigId] = useState(values.configId)
  const [graphVersion, setGraphVersion] = useState(values.graphVersion || "v25.0")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; lines?: string[] } | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/admin/meta-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          appSecret,
          verifyToken: generateVerifyToken ? "" : verifyToken,
          generateVerifyToken,
          configId,
          graphVersion,
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        setMessage({ tone: "error", text: body.error || "Could not save.", lines: body.lines })
        return
      }
      setAppSecret("")
      setVerifyToken("")
      setGenerateVerifyToken(false)
      setMessage({
        tone: "ok",
        text: [
          body.message,
          body.generatedVerifyToken ? "A new verify token was generated — paste it into Meta's webhook settings (step 4)." : "",
          body.generatedEncryptionKey ? "A strong ENCRYPTION_KEY was generated." : "",
        ].filter(Boolean).join(" "),
      })
      await onSaved()
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ background: "#172235", border: "1px solid rgba(37,211,102,.35)", borderRadius: 10, padding: 18, margin: "14px 0" }}>
      <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#fff" }}>
        Save Meta App Credentials
      </h3>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", margin: "0 0 16px", lineHeight: 1.5 }}>
        Meta validates the App ID and Secret directly against Meta Graph API before saving to your <code>.env</code> file.
      </p>
      <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
        <label>
          <span style={kvLabel}>Meta App ID *</span>
          <input required value={appId} onChange={event => setAppId(event.target.value.replace(/\D/g, ""))} placeholder="1234567890123456" style={darkInput} />
        </label>
        <label>
          <span style={kvLabel}>App Secret {values.appSecretSet && <span style={{ textTransform: "none", color: "#86efac" }}>· saved</span>}</span>
          <input
            type="password"
            autoComplete="off"
            value={appSecret}
            onChange={event => setAppSecret(event.target.value.trim())}
            placeholder={values.appSecretSet ? "Leave blank to keep current secret" : "32-character secret"}
            required={!values.appSecretSet}
            style={darkInput}
          />
        </label>
        <label>
          <span style={kvLabel}>Webhook Verify Token</span>
          <input
            value={verifyToken}
            disabled={generateVerifyToken}
            onChange={event => setVerifyToken(event.target.value.trim())}
            placeholder={values.verifyToken ? "Keep current token" : "Your random verify string"}
            style={{ ...darkInput, opacity: generateVerifyToken ? 0.5 : 1 }}
          />
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,.55)", marginTop: 4 }}>
            <input type="checkbox" checked={generateVerifyToken} onChange={event => setGenerateVerifyToken(event.target.checked)} /> Auto-generate token
          </span>
        </label>
        <label>
          <span style={kvLabel}>Embedded Signup Config ID</span>
          <input value={configId} onChange={event => setConfigId(event.target.value.replace(/\D/g, ""))} placeholder="Numeric Configuration ID" style={darkInput} />
        </label>
        <label>
          <span style={kvLabel}>Graph API Version</span>
          <input value={graphVersion} onChange={event => setGraphVersion(event.target.value.trim())} placeholder="v25.0" style={darkInput} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: "#25D366",
              color: "#053d36",
              border: 0,
              borderRadius: 8,
              padding: "10px 16px",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              opacity: saving ? 0.6 : 1,
              width: "100%",
            }}
          >
            {saving ? "Verifying with Meta…" : "✓ Verify & Save to .env"}
          </button>
        </div>
      </form>
      {message && (
        <div role={message.tone === "error" ? "alert" : "status"} style={{
          marginTop: 12,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
          background: message.tone === "ok" ? "rgba(74,222,128,.12)" : "rgba(248,113,113,.12)",
          color: message.tone === "ok" ? "#86efac" : "#fca5a5",
        }}>
          {message.text}
          {message.lines && <pre style={{ ...preStyle, marginTop: 8 }}>{message.lines.join("\n")}</pre>}
        </div>
      )}
    </section>
  )
}

function RegisterWebhook({ defaultUrl, onDone }: { defaultUrl: string; onDone: () => Promise<void> }) {
  const [url, setUrl] = useState(defaultUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { setUrl(current => current || defaultUrl) }, [defaultUrl])

  async function register() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch("/api/admin/meta-setup/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl: url }),
      })
      const body = await response.json()
      setMessage({ ok: response.ok, text: body.message || body.error || "Done." })
      if (response.ok) await onDone()
    } catch {
      setMessage({ ok: false, text: "Network error. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)" }}>
      <p style={pStyle}><b>1-Click Webhook Registration:</b> Once this address is reachable on the internet, register it directly with Meta.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={url}
          onChange={event => setUrl(event.target.value.trim())}
          aria-label="Webhook callback URL"
          style={{
            flex: 1,
            minWidth: 240,
            boxSizing: "border-box",
            background: "rgba(0,0,0,.25)",
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            color: "#fff",
          }}
        />
        <button
          type="button"
          onClick={register}
          disabled={busy || !url}
          style={{
            background: "#25D366",
            color: "#053d36",
            border: 0,
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Registering…" : "Register Webhook with Meta"}
        </button>
      </div>
      {message && (
        <div role={message.ok ? "status" : "alert"} style={{
          marginTop: 8,
          fontSize: 12,
          borderRadius: 8,
          padding: "8px 10px",
          background: message.ok ? "rgba(74,222,128,.12)" : "rgba(248,113,113,.12)",
          color: message.ok ? "#86efac" : "#fca5a5",
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
