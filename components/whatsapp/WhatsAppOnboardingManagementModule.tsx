"use client"

import React, { useState, useEffect, useCallback } from "react"

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

export function WhatsAppOnboardingManagementModule() {
  const [data, setData] = useState<OnboardingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showPreflight, setShowPreflight] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [readiness, setReadiness] = useState<any>(null)
  const [metaConfig, setMetaConfig] = useState<any>(null)

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

  // 2. Load Meta SDK & Config
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

  // 3. Initiate Onboarding Pre-Flight
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

  // 4. Launch Meta Embedded Signup v4 Modal with Real-Time Session Event Capture
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

  // 5. 1-Click Status Refresh
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

  // 6. 1-Click Automated Retry
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

  // 7. Safe Disconnect
  const handleDisconnect = async () => {
    if (!data?.primaryAccount?.id) return
    setBusy(true)
    setShowDisconnectModal(false)
    try {
      const res = await fetch(`/api/whatsapp/accounts/${data.primaryAccount.id}/disconnect`, { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        setActionMessage("✓ WhatsApp account disconnected. Past message logs and templates are preserved.")
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
    <div style={{ display: "grid", gap: 20 }}>
      {/* ACTION & ERROR NOTICES */}
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

      {/* SECTION A: CONNECTION OVERVIEW HERO */}
      <div style={{ background: isConnected ? "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)" : "#ffffff", border: isConnected ? "1.5px solid #86efac" : "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>📱</span>
              <h2 style={{ fontFamily: "Sora, sans-serif", fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                WhatsApp Business API
              </h2>
              <span style={{ background: isConnected ? "#dcfce7" : "#fef9c3", color: isConnected ? "#15803d" : "#a16207", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {isConnected ? "● Connected" : "○ Setup Required"}
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              Official Meta Cloud API integration with automated WABA provisioning &amp; live number routing.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={busy}
                  style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#334155", cursor: busy ? "not-allowed" : "pointer" }}
                >
                  🔄 Refresh Status
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisconnectModal(true)}
                  disabled={busy}
                  style={{ background: "#fff", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#b91c1c", cursor: busy ? "not-allowed" : "pointer" }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartOnboarding}
                disabled={busy}
                style={{ background: "#16a34a", color: "#ffffff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(22,163,74,0.3)" }}
              >
                {busy ? "Connecting…" : "🚀 Connect WhatsApp Number"}
              </button>
            )}
          </div>
        </div>

        {/* HERO NUMBER & IDENTIFIERS */}
        {isConnected && phone ? (
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderBottom: "1px solid #f1f5f9", paddingBottom: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  Connected WhatsApp Business Number
                </div>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 900, color: "#0f172a", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>{phone.phoneNumber}</span>
                  <span style={{ fontSize: 14, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                    ✓ Verified
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Display Name: <strong>{phone.displayName || data?.primaryAccount?.name}</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", minWidth: 160 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>WABA ID</div>
                  <code style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{data?.primaryAccount?.wabaId}</code>
                </div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", minWidth: 160 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Phone Number ID</div>
                  <code style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{phone.phoneNumberId}</code>
                </div>
              </div>
            </div>

            {/* TRI-PARTITE HEALTH MONITOR */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>API Connection</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a", marginTop: 2 }}>
                  ● {data?.health.apiConnection || "Active"}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Webhook Status</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a", marginTop: 2 }}>
                  ● {data?.health.webhook || "Active"}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Number Registration</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a", marginTop: 2 }}>
                  ✓ {data?.health.numberRegistration || "Complete"}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Quality Rating</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#334155", marginTop: 2 }}>
                  {phone.qualityRating || "PENDING"}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Messaging Tier</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#334155", marginTop: 2 }}>
                  {data?.health.messagingLimit || "TIER_250"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SECTION B: CONNECT CTA CALLOUT */
          <div style={{ background: "#f8fafc", border: "1.5px dashed #cbd5e1", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚡</div>
            <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
              Connect your WhatsApp Business Account with Meta
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", maxWidth: 540, margin: "0 auto 18px", lineHeight: 1.6 }}>
              Connect an existing account or create a brand new WhatsApp Business Account in minutes through official Meta Embedded Signup v4.
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

        {/* SECTION C: 6-STAGE ONBOARDING PROGRESS STEPPER */}
        <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
            Onboarding Verification Stepper
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

      {/* PRE-FLIGHT READINESS MODAL */}
      {showPreflight && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, maxWidth: 540, width: "100%", padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>
              📋 WhatsApp Onboarding Readiness Check
            </h3>
            <p style="margin: 0 0 16px; font-size: 13px; color: #64748b;">
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
