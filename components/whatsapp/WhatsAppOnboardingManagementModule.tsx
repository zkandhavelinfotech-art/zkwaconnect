"use client"

import React, { useState, useEffect, useCallback } from "react"
import { VERTICALS, type Vertical } from "@/lib/meta/profile"

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

type OnboardingState = {
  ok: boolean
  status: "NOT_STARTED" | "INITIATED" | "META_AUTH_PENDING" | "BUSINESS_SELECTION" | "WABA_CREATION_PENDING" | "PHONE_NUMBER_PENDING" | "OTP_VERIFICATION_PENDING" | "REGISTRATION_PENDING" | "DISPLAY_NAME_PENDING" | "CONNECTED" | "ACTION_REQUIRED" | "FAILED" | "MANUAL_REVIEW" | "SUSPENDED"
  primaryAccount: {
    id: string
    wabaId: string
    name: string
    businessId: string | null
    currency: string
    timezone: string
    status: string
    phone: {
      id: string
      phoneNumberId: string
      phoneNumber: string
      displayName: string | null
      status: string
      verificationStatus: string | null
      qualityRating: string | null
    } | null
  } | null
  accounts: {
    id: string
    wabaId: string
    name: string
    status: string
    phoneNumbers: {
      id: string
      phoneNumberId: string
      phoneNumber: string
      displayName: string | null
      status: string
    }[]
  }[]
  health: {
    apiConnection: string
    webhook: string
    numberRegistration: string
    qualityRating: string
    messagingLimit: string
    callingEnabled: boolean
    lastSyncedAt: string | null
  }
}

type HubTab = "overview" | "profile" | "pin" | "test" | "logs" | "danger"

export function WhatsAppOnboardingManagementModule() {
  const [data, setData] = useState<OnboardingState | null>(null)
  const [activeTab, setActiveTab] = useState<HubTab>("overview")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showPreflight, setShowPreflight] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [readiness, setReadiness] = useState<any>(null)
  const [metaConfig, setMetaConfig] = useState<any>(null)

  // Profile Form state
  const [profileForm, setProfileForm] = useState({
    about: "",
    address: "",
    description: "",
    email: "",
    website1: "",
    website2: "",
    vertical: "OTHER" as Vertical,
  })

  // PIN Form state
  const [pinInput, setPinInput] = useState("123456")

  // Live Outbound Test state
  const [testRecipient, setTestRecipient] = useState("")
  const [testText, setTestText] = useState("Hello from ZKWAConnect! Your WhatsApp Business API connection is verified and active. 🚀")
  const [testResult, setTestResult] = useState<any>(null)

  // Audit Logs & Diagnostics state
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [lifecycle, setLifecycle] = useState<any>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryResult, setRetryResult] = useState<any>(null)

  const loadAuditLogs = useCallback(async () => {
    try {
      setLogsLoading(true)
      const res = await fetch("/api/whatsapp/onboarding/logs")
      const json = await res.json()
      if (res.ok) {
        if (json.auditLogs) setAuditLogs(json.auditLogs)
        if (json.lifecycle) setLifecycle(json.lifecycle)
      }
    } catch {}
    finally {
      setLogsLoading(false)
    }
  }, [])

  const handleRetryDiagnostics = async () => {
    const wabaId = data?.primaryAccount?.wabaId || data?.primaryAccount?.id
    if (!wabaId) return
    try {
      setRetrying(true)
      setErrorMessage(null)
      setActionMessage(null)
      const res = await fetch(`/api/whatsapp/accounts/${wabaId}/retry`, { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        setRetryResult(json)
        setActionMessage(json.message || "Diagnostics completed successfully.")
        refreshAccounts()
        loadAuditLogs()
      } else {
        setErrorMessage(json.error || "Retry diagnostics detected issues.")
        setRetryResult(json)
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error running diagnostics.")
    } finally {
      setRetrying(false)
    }
  }

  useEffect(() => {
    if (activeTab === "logs") {
      loadAuditLogs()
    }
  }, [activeTab, loadAuditLogs])

  // 1. Fetch current WhatsApp connection & health
  const refreshAccounts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/whatsapp/accounts", { cache: "no-store" })
      const json = await res.json()
      if (res.ok) {
        setData(json)
      } else {
        setErrorMessage(json.error || "Could not load WhatsApp account state.")
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to contact accounts API.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAccounts()
  }, [refreshAccounts])

  // 2. Fetch Business Profile when tab opens
  const loadProfile = useCallback(async (phoneId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/accounts/${phoneId}/profile`)
      const json = await res.json()
      if (res.ok && json.profile) {
        const p = json.profile
        setProfileForm({
          about: p.about || "",
          address: p.address || "",
          description: p.description || "",
          email: p.email || "",
          website1: p.websites?.[0] || "",
          website2: p.websites?.[1] || "",
          vertical: (p.vertical in VERTICALS ? p.vertical : "OTHER") as Vertical,
        })
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (activeTab === "profile" && data?.primaryAccount?.phone?.id) {
      loadProfile(data.primaryAccount.phone.id)
    }
  }, [activeTab, data?.primaryAccount?.phone?.id, loadProfile])

  // 3. Load Meta SDK & Config
  useEffect(() => {
    fetch("/api/whatsapp/onboarding/config")
      .then(res => res.json())
      .then(cfg => {
        setMetaConfig(cfg)
        if (cfg.appId && typeof window !== "undefined") {
          window.fbAsyncInit = function () {
            window.FB?.init({
              appId: cfg.appId,
              cookie: true,
              xfbml: true,
              version: "v25.0",
            })
          }
          if (!document.getElementById("facebook-jssdk")) {
            const js = document.createElement("script")
            js.id = "facebook-jssdk"
            js.src = "https://connect.facebook.net/en_US/sdk.js"
            document.body.appendChild(js)
          }
        }
      })
      .catch(() => {})
  }, [])

  // 4. Initiate Onboarding Pre-Flight
  const handleStartOnboarding = async () => {
    setBusy(true)
    setErrorMessage(null)
    setActionMessage(null)
    try {
      const res = await fetch("/api/whatsapp/onboarding/initiate", { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        setReadiness(json.readiness)
        setShowPreflight(true)
      } else {
        setErrorMessage(json.error || "Could not initialize onboarding session.")
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Initiation error.")
    } finally {
      setBusy(false)
    }
  }

  // 5. Launch Meta Embedded Signup v4 Modal with Real-Time Session Event Capture
  const launchMetaEmbeddedSignup = () => {
    setShowPreflight(false)
    setBusy(true)
    setActionMessage("Opening Meta Embedded Signup v4 dialog…")

    if (!window.FB) {
      setErrorMessage("Facebook SDK not ready. Please refresh the page.")
      setBusy(false)
      return
    }

    const configId = metaConfig?.configId || process.env.NEXT_PUBLIC_META_CONFIG_ID || ""

    let capturedWabaId: string | null = null
    let capturedPhoneId: string | null = null

    // Listen for Meta Embedded Signup v4 postMessage events (FINISH / CANCEL)
    const sessionInfoListener = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return
      try {
        const rawData = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (rawData?.type === "WA_EMBEDDED_SIGNUP") {
          if (rawData.event === "FINISH" && rawData.data) {
            capturedWabaId = rawData.data.waba_id || rawData.data.wabaId || null
            capturedPhoneId = rawData.data.phone_number_id || rawData.data.phoneNumberId || null
          }
        }
      } catch {}
    }

    window.addEventListener("message", sessionInfoListener)

    // Launch official Meta Login for Business with Embedded Signup
    window.FB.login(
      (response: any) => {
        window.removeEventListener("message", sessionInfoListener)
        if (response.authResponse?.code) {
          setActionMessage("Meta authorization received! Finalizing WABA & Phone ID setup…")
          // Callback backend with authorization code and parsed asset IDs
          fetch("/api/whatsapp/onboarding/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: response.authResponse.code,
              wabaId: capturedWabaId,
              phoneNumberId: capturedPhoneId,
            }),
          })
            .then(res => res.json())
            .then(callbackResult => {
              if (callbackResult.ok) {
                setActionMessage(callbackResult.message || "✓ WhatsApp Number connected successfully!")
                refreshAccounts()
              } else {
                setErrorMessage(callbackResult.error || "Callback registration note.")
                refreshAccounts()
              }
            })
            .catch(err => {
              setErrorMessage("Callback network error: " + err.message)
            })
            .finally(() => {
              setBusy(false)
            })
        } else if (response.status === "connected") {
          // Fallback token handler
          setActionMessage("Session confirmed. Syncing WhatsApp assets…")
          refreshAccounts()
          setBusy(false)
        } else {
          setBusy(false)
          setActionMessage(null)
          setErrorMessage("Meta onboarding was cancelled or closed before completing.")
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {
            // Embedded Signup v4 features
          },
        },
      }
    )
  }

  // 6. 1-Click Status Refresh
  const handleRefreshStatus = async () => {
    if (!data?.primaryAccount?.id) return
    setBusy(true)
    setActionMessage("Refreshing live WhatsApp Cloud API health…")
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.id}/status`)
      const json = await res.json()
      if (res.ok) {
        setActionMessage("✓ Health status refreshed with latest Meta metrics.")
        refreshAccounts()
      } else {
        setErrorMessage(json.error || "Could not refresh status.")
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // 7. 1-Click Automated Diagnostics Retry
  const handleRetry = async () => {
    if (!data?.primaryAccount?.id) return
    setBusy(true)
    setActionMessage("Executing automated retry diagnostics on WABA & phone…")
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.id}/retry`, { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        setActionMessage(json.message || "✓ Retry completed successfully!")
        refreshAccounts()
      } else {
        setErrorMessage(json.error || "Retry failed.")
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // 8. Save Business Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data?.primaryAccount?.phone?.id) return
    setBusy(true)
    setErrorMessage(null)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.phone.id}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about: profileForm.about,
          address: profileForm.address,
          description: profileForm.description,
          email: profileForm.email,
          websites: [profileForm.website1, profileForm.website2].filter(Boolean),
          vertical: profileForm.vertical,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setActionMessage(json.message || "✓ Business Profile saved directly to Meta!")
      } else {
        setErrorMessage(json.error || "Could not save profile.")
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // 9. Update Two-Step PIN
  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data?.primaryAccount?.phone?.id) return
    setBusy(true)
    setErrorMessage(null)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.phone.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      })
      const json = await res.json()
      if (res.ok) {
        setActionMessage(json.message || "✓ Two-Step PIN updated successfully!")
      } else {
        setErrorMessage(json.error || "Could not update PIN.")
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // 10. Send Live Test Message
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data?.primaryAccount?.phone?.id) return
    setBusy(true)
    setTestResult(null)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.phone.id}/test-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientPhone: testRecipient,
          messageText: testText,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setTestResult(json)
        setActionMessage(`✓ Test message sent to ${json.recipient}! Message ID: ${json.messageId}`)
      } else {
        setErrorMessage(json.error || "Failed to send test message.")
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // 11. Safe Disconnect
  const handleDisconnect = async () => {
    if (!data?.primaryAccount?.id) return
    setBusy(true)
    setShowDisconnectModal(false)
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.id}/disconnect`, { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        setActionMessage("✓ WhatsApp account disconnected safely. Conversation history & templates are preserved.")
        refreshAccounts()
      } else {
        setErrorMessage(json.error || "Could not disconnect account.")
      }
    } catch (err: any) {
      setErrorMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  const isConnected = data?.status === "CONNECTED" && Boolean(data?.primaryAccount?.phone?.phoneNumber)
  const phone = data?.primaryAccount?.phone

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* NOTICES */}
      {actionMessage && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", color: "#166534", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage(null)} style={{ background: "transparent", border: 0, color: "#166534", cursor: "pointer", fontWeight: 800 }}>×</button>
        </div>
      )}

      {errorMessage && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", color: "#991b1b", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} style={{ background: "transparent", border: 0, color: "#991b1b", cursor: "pointer", fontWeight: 800 }}>×</button>
        </div>
      )}

      {/* ENTERPRISE MANAGEMENT HUB CONTAINER */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
        {/* HERO TITLE & CONTROLS */}
        <div style={{ padding: "20px 24px", background: isConnected ? "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)" : "#ffffff", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 20 }}>📱</span>
              <h2 style={{ fontFamily: "Sora, sans-serif", fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                WhatsApp Business API Hub
              </h2>
              <span style={{ background: isConnected ? "#dcfce7" : "#fef9c3", color: isConnected ? "#15803d" : "#a16207", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                {isConnected ? "● Connected" : "○ Setup Required"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              Official Meta Cloud API Management &amp; Self-Service Operations
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={busy}
                  style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: "#334155", cursor: busy ? "not-allowed" : "pointer" }}
                >
                  🔄 Refresh Status
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={busy}
                  style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: "#0f172a", cursor: busy ? "not-allowed" : "pointer" }}
                >
                  ⚡ Diagnostics Retry
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartOnboarding}
                disabled={busy}
                style={{ background: "#16a34a", color: "#ffffff", border: 0, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(22,163,74,0.3)" }}
              >
                {busy ? "Connecting…" : "🚀 Connect WhatsApp Number"}
              </button>
            )}
          </div>
        </div>

        {/* NAVIGATION TABS */}
        {isConnected && (
          <div style={{ display: "flex", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "0 18px", overflowX: "auto" }}>
            <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")} label="📊 Connection & Health" />
            <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} label="📝 Business Profile" />
            <TabButton active={activeTab === "pin"} onClick={() => setActiveTab("pin")} label="🔐 Numbers & 2-Step PIN" />
            <TabButton active={activeTab === "test"} onClick={() => setActiveTab("test")} label="💬 Live Messaging Test" />
            <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")} label="📋 Audit Logs & Diagnostics" />
            <TabButton active={activeTab === "danger"} onClick={() => setActiveTab("danger")} label="⚙️ Account Management" />
          </div>
        )}

        {/* TAB CONTENTS */}
        <div style={{ padding: 24 }}>
          {/* NOT CONNECTED CTA */}
          {!isConnected && (
            <div style={{ background: "#f8fafc", border: "1.5px dashed #cbd5e1", borderRadius: 12, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⚡</div>
              <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
                Connect your WhatsApp Business Account with Meta
              </h3>
              <p style={{ fontSize: 13, color: "#64748b", maxWidth: 540, margin: "0 auto 20px", lineHeight: 1.6 }}>
                Connect an existing corporate account or create a brand new WABA in minutes through official Meta Embedded Signup v4.
              </p>
              <button
                type="button"
                onClick={handleStartOnboarding}
                disabled={busy}
                style={{ background: "#1877f2", color: "#ffffff", border: 0, borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 10, boxShadow: "0 4px 14px rgba(24,119,242,0.3)" }}
              >
                <span>f</span> Continue with Facebook (Meta Login)
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW & HEALTH */}
          {isConnected && activeTab === "overview" && (
            <div style={{ display: "grid", gap: 20 }}>
              {/* HERO NUMBER & IDENTIFIERS */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderBottom: "1px solid #f1f5f9", paddingBottom: 16, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                      Connected WhatsApp Business Number
                    </div>
                    <div style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 900, color: "#0f172a", display: "flex", alignItems: "center", gap: 10 }}>
                      <span>{phone?.phoneNumber}</span>
                      <span style={{ fontSize: 13, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                        ✓ Verified
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      Display Name: <strong>{phone?.displayName || data?.primaryAccount?.name}</strong>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", minWidth: 160 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>WABA ID</div>
                      <code style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{data?.primaryAccount?.wabaId}</code>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", minWidth: 160 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Phone Number ID</div>
                      <code style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{phone?.phoneNumberId}</code>
                    </div>
                  </div>
                </div>

                {/* TRI-PARTITE HEALTH MONITOR */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                  <HealthBox label="API Connection" value={`● ${data?.health.apiConnection || "Active"}`} good />
                  <HealthBox label="Webhook Status" value={`● ${data?.health.webhook || "Active"}`} good />
                  <HealthBox label="Number Registration" value={`✓ ${data?.health.numberRegistration || "Complete"}`} good />
                  <HealthBox label="Quality Rating" value={phone?.qualityRating || "GREEN"} />
                  <HealthBox label="Messaging Tier" value={data?.health.messagingLimit || "TIER_250"} />
                </div>
              </div>

              {/* 6-STAGE STEPPER */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  6-Stage Onboarding Stepper Status
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <StepItem completed={Boolean(data?.primaryAccount)} title="Meta Authorization" subtitle="OAuth v25.0" />
                  <StepItem completed={Boolean(data?.primaryAccount?.businessId)} title="Business Portfolio" subtitle="Asset selected" />
                  <StepItem completed={Boolean(data?.primaryAccount?.wabaId)} title="WABA Created" subtitle="WABA ID verified" />
                  <StepItem completed={Boolean(phone?.verificationStatus)} title="Phone Verified" subtitle="SMS / Voice OTP" />
                  <StepItem completed={Boolean(phone?.status === "CONNECTED")} title="Number Registered" subtitle="PIN provisioned" />
                  <StepItem completed={isConnected} title="API Connected" subtitle="Broadcast ready" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BUSINESS PROFILE */}
          {isConnected && activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} style={{ display: "grid", gap: 16 }}>
              <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
                <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}>
                  Official WhatsApp Business Profile
                </h3>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                  What your customers see when they view your profile on WhatsApp. Saved directly to Meta Cloud API.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <div>
                  <label style={formLabel}>About (Status text, max 139 chars)</label>
                  <input
                    type="text"
                    maxLength={139}
                    value={profileForm.about}
                    onChange={e => setProfileForm({ ...profileForm, about: e.target.value })}
                    placeholder="e.g. Official WhatsApp for Support & Updates"
                    style={formInput}
                  />
                </div>

                <div>
                  <label style={formLabel}>Business Category / Vertical</label>
                  <select
                    value={profileForm.vertical}
                    onChange={e => setProfileForm({ ...profileForm, vertical: e.target.value as Vertical })}
                    style={formInput}
                  >
                    {Object.entries(VERTICALS).map(([key, label]) => (
                      <option key={key} value={key}>{String(label)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={formLabel}>Business Description (Max 512 chars)</label>
                <textarea
                  rows={3}
                  maxLength={512}
                  value={profileForm.description}
                  onChange={e => setProfileForm({ ...profileForm, description: e.target.value })}
                  placeholder="Describe your company, products, or working hours…"
                  style={formInput}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <div>
                  <label style={formLabel}>Support Email Address</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                    placeholder="support@company.com"
                    style={formInput}
                  />
                </div>

                <div>
                  <label style={formLabel}>Physical Business Address</label>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                    placeholder="Corporate office address"
                    style={formInput}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <div>
                  <label style={formLabel}>Website URL 1</label>
                  <input
                    type="url"
                    value={profileForm.website1}
                    onChange={e => setProfileForm({ ...profileForm, website1: e.target.value })}
                    placeholder="https://company.com"
                    style={formInput}
                  />
                </div>

                <div>
                  <label style={formLabel}>Website URL 2 (Optional)</label>
                  <input
                    type="url"
                    value={profileForm.website2}
                    onChange={e => setProfileForm({ ...profileForm, website2: e.target.value })}
                    placeholder="https://support.company.com"
                    style={formInput}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}
                >
                  {busy ? "Saving to Meta…" : "Save Profile to Meta"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: NUMBERS & 2-STEP PIN */}
          {isConnected && activeTab === "pin" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div>
                <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}>
                  Connected Phone Numbers
                </h3>
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>
                  Active phone numbers provisioned on the Meta Cloud API under this workspace.
                </p>

                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                    <thead style={{ background: "#f8fafc", color: "#64748b" }}>
                      <tr>
                        <th style={{ padding: "10px 14px" }}>Phone Number</th>
                        <th style={{ padding: "10px 14px" }}>Phone Number ID</th>
                        <th style={{ padding: "10px 14px" }}>Display Name</th>
                        <th style={{ padding: "10px 14px" }}>Status</th>
                        <th style={{ padding: "10px 14px" }}>Quality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.accounts.flatMap(a => a.phoneNumbers).map(p => (
                        <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0f172a" }}>{p.phoneNumber}</td>
                          <td style={{ padding: "12px 14px" }}><code>{p.phoneNumberId}</code></td>
                          <td style={{ padding: "12px 14px" }}>{p.displayName || "—"}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800 }}>
                              {p.status}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>{data.health.qualityRating || "GREEN"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TWO-STEP PIN FORM */}
              <form onSubmit={handleUpdatePin} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
                <h4 style={{ fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}>
                  Two-Step Verification 6-Digit PIN
                </h4>
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>
                  Meta Cloud API requires a 6-digit PIN to secure the phone number against hijacking.
                </p>

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="password"
                    maxLength={6}
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    style={{ ...formInput, width: 140, letterSpacing: "0.2em", fontSize: 16, textAlign: "center", fontWeight: 800 }}
                  />
                  <button
                    type="submit"
                    disabled={busy || pinInput.length !== 6}
                    style={{ background: "#0f172a", color: "#fff", border: 0, borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}
                  >
                    {busy ? "Updating…" : "Update PIN on Meta"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: LIVE MESSAGING TEST */}
          {isConnected && activeTab === "test" && (
            <form onSubmit={handleSendTestMessage} style={{ display: "grid", gap: 16 }}>
              <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
                <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}>
                  Live Outbound Test Messenger
                </h3>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                  Send a live test message from your connected WhatsApp number ({phone?.phoneNumber}) to any recipient to verify connectivity.
                </p>
              </div>

              <div>
                <label style={formLabel}>Recipient WhatsApp Number (with country code)</label>
                <input
                  type="text"
                  required
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  style={formInput}
                />
              </div>

              <div>
                <label style={formLabel}>Message Text</label>
                <textarea
                  rows={3}
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  style={formInput}
                />
              </div>

              {testResult && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12, fontSize: 12, color: "#166534" }}>
                  <strong>✓ Meta Message Dispatched:</strong> ID <code>{testResult.messageId}</code> to {testResult.recipient}. Check recipient WhatsApp!
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={busy || !testRecipient}
                  style={{ background: "#25D366", color: "#052e2b", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 850, cursor: busy ? "not-allowed" : "pointer" }}
                >
                  {busy ? "Sending…" : "🚀 Send Live Test Message"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: AUDIT LOGS & DIAGNOSTICS */}
          {isConnected && activeTab === "logs" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: 12, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "#0f172a" }}>
                    Automated Onboarding Audit Trail &amp; Diagnostics
                  </h3>
                  <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                    Real-time status changes, webhook delivery events, and Meta Cloud API diagnostics.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={loadAuditLogs}
                    disabled={logsLoading}
                    style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: "#334155", cursor: "pointer" }}
                  >
                    {logsLoading ? "Refreshing…" : "↻ Refresh Logs"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryDiagnostics}
                    disabled={retrying || busy}
                    style={{ background: "#0284c7", border: 0, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#ffffff", cursor: "pointer" }}
                  >
                    {retrying ? "Running Diagnostics…" : "⚡ Run Self-Healing Diagnostics"}
                  </button>
                </div>
              </div>

              {/* RETRY DIAGNOSTIC RESULTS IF ANY */}
              {retryResult && (
                <div style={{ background: retryResult.fullyResolved ? "#f0fdf4" : "#fffbeb", border: `1px solid ${retryResult.fullyResolved ? "#bbf7d0" : "#fef08a"}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: retryResult.fullyResolved ? "#166534" : "#854d0e", marginBottom: 8 }}>
                    {retryResult.fullyResolved ? "✓ All Diagnostic Checks Passed" : "⚠️ Attention Required in Meta Business Portfolio"}
                  </div>
                  {retryResult.diagnostics && (
                    <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                      {retryResult.diagnostics.map((d: any, idx: number) => (
                        <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span>{d.success ? "✅" : "❌"}</span>
                          <div>
                            <strong>{d.step}:</strong> <span style={{ color: "#475569" }}>{d.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* LOG ENTRIES TABLE / LIST */}
              {logsLoading && auditLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
                  Loading onboarding audit trail…
                </div>
              ) : auditLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13, background: "#f8fafc", borderRadius: 10, border: "1px dashed #cbd5e1" }}>
                  No onboarding audit events logged yet. Events will appear here as Meta webhooks and status changes occur.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {auditLogs.map((log: any) => {
                    const isError = log.eventType.includes("ERROR") || log.eventType.includes("FAIL")
                    const isSuccess = log.eventType.includes("SUCCESS") || log.eventType.includes("REGISTERED") || log.eventType.includes("CONNECTED")
                    const badgeBg = isError ? "#fef2f2" : isSuccess ? "#f0fdf4" : "#f0f9ff"
                    const badgeColor = isError ? "#b91c1c" : isSuccess ? "#166534" : "#0369a1"
                    const badgeBorder = isError ? "#fecaca" : isSuccess ? "#bbf7d0" : "#bae6fd"

                    return (
                      <div
                        key={log.id}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: "12px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                background: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeBorder}`,
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: "0.03em",
                              }}
                            >
                              {log.eventType}
                            </span>
                            {log.statusTo && (
                              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                                State: <strong style={{ color: "#334155" }}>{log.statusTo}</strong>
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, lineHeight: 1.5 }}>
                            {log.clientMessage}
                          </div>
                          {log.rawError && (
                            <details style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                              <summary style={{ cursor: "pointer", color: "#64748b" }}>Raw Diagnostic Error Object</summary>
                              <pre style={{ margin: "4px 0 0", padding: 8, background: "#f8fafc", borderRadius: 4, overflowX: "auto", fontSize: 10, color: "#334155" }}>
                                {JSON.stringify(log.rawError, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "medium",
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: DANGER ZONE & ACCOUNT MANAGEMENT */}
          {isConnected && activeTab === "danger" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
                <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 15, fontWeight: 800, margin: "0 0 4px", color: "#991b1b" }}>
                  Account Management &amp; Disconnect Safety
                </h3>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                  Control your Meta Business Account linking and active phone routing.
                </p>
              </div>

              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, color: "#991b1b", margin: "0 0 6px" }}>
                  Disconnect WhatsApp Account
                </h4>
                <p style={{ fontSize: 12, color: "#7f1d1d", margin: "0 0 16px", lineHeight: 1.6 }}>
                  Disconnecting parks the WhatsApp connection. Your historic conversations, contact tags, campaigns, templates, and analytics will remain securely preserved in your workspace.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDisconnectModal(true)}
                  style={{ background: "#dc2626", color: "#fff", border: 0, borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                >
                  Disconnect WABA from Workspace
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PRE-FLIGHT READINESS MODAL */}
      {showPreflight && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, maxWidth: 540, width: "100%", padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>
              📋 WhatsApp Onboarding Readiness Check
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Ensure your business meets these requirements before opening the Meta Embedded Signup dialog:
            </p>

            <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
              {readiness?.preflightChecklist?.map((item: any) => (
                <div key={item.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#f8fafc", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <span style={{ color: item.passed ? "#16a34a" : "#ca8a04", fontWeight: 800 }}>{item.passed ? "✓" : "!"}</span>
                  <div>
                    <strong style={{ display: "block", fontSize: 13, color: "#0f172a" }}>{item.title}</strong>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{item.description}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowPreflight(false)}
                style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, color: "#334155", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={launchMetaEmbeddedSignup}
                style={{ background: "#16a34a", border: 0, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 800, color: "#ffffff", cursor: "pointer" }}
              >
                Continue to Meta Signup →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCONNECT CONFIRMATION MODAL */}
      {showDisconnectModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, maxWidth: 440, width: "100%", padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#991b1b", margin: "0 0 8px" }}>
              Disconnect WhatsApp Account?
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.6 }}>
              Your campaigns, conversation history, templates, and analytics will be preserved. Outbound messaging will pause until you reconnect.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#334155", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                style={{ background: "#dc2626", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800, color: "#ffffff", cursor: "pointer" }}
              >
                Confirm Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 0,
        background: "transparent",
        borderBottom: active ? "2.5px solid #16a34a" : "2.5px solid transparent",
        color: active ? "#0f172a" : "#64748b",
        fontWeight: active ? 800 : 600,
        fontSize: 12,
        padding: "12px 16px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  )
}

function HealthBox({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: good ? "#16a34a" : "#334155", marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

function StepItem({ completed, title, subtitle }: { completed: boolean; title: string; subtitle: string }) {
  return (
    <div style={{ background: completed ? "#f0fdf4" : "#f8fafc", border: completed ? "1px solid #bbf7d0" : "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: completed ? "#16a34a" : "#94a3b8" }}>
          {completed ? "✓" : "○"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: completed ? "#166534" : "#475569" }}>{title}</span>
      </div>
      <div style={{ fontSize: 10, color: "#64748b", paddingLeft: 16 }}>{subtitle}</div>
    </div>
  )
}

const formLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
}

const formInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "#0f172a",
  fontFamily: "inherit",
  background: "#ffffff",
}
