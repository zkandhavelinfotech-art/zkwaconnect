"use client"
import { useCallback, useEffect, useState } from "react"
import { EmbeddedSignupButton } from "@/components/onboarding/EmbeddedSignupButton"

type UpgradeData = {
  ok: boolean
  workspace: {
    id: string
    name: string
    slug: string
  }
  currentDbWaba: any
  liveMetaWabas: any[]
  livePhones: any[]
  businessManagerId: string
  embeddedSignup: {
    appId: string
    configId: string
    graphVersion: string
    ready: boolean
  }
}

export function ProductionUpgradeManager() {
  const [activeTab, setActiveTab] = useState<"auto" | "manual">("auto")
  const [data, setData] = useState<UpgradeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // Auto Method A state
  const [methodAWabaId, setMethodAWabaId] = useState("1169391638991834")
  const [methodACountryCode, setMethodACountryCode] = useState("91")
  const [methodAPhone, setMethodAPhone] = useState("7795783535")
  const [methodAName, setMethodAName] = useState("Recruitment Training Academy")
  const [methodAPhoneId, setMethodAPhoneId] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [pin, setPin] = useState("123456")
  const [busyMethodA, setBusyMethodA] = useState(false)
  const [sandboxLimitInfo, setSandboxLimitInfo] = useState<any>(null)

  // Manual Tab state
  const [manualWabaId, setManualWabaId] = useState("1169391638991834")
  const [manualPhoneId, setManualPhoneId] = useState("")
  const [manualPhone, setManualPhone] = useState("+91 77957 83535")
  const [manualName, setManualName] = useState("Recruitment Training Academy")
  const [busyManual, setBusyManual] = useState(false)

  // Dynamic Auto-Link & Slot state
  const [linkingId, setLinkingId] = useState("")
  const [slotInfo, setSlotInfo] = useState<any>(null)
  const [checkingSlots, setCheckingSlots] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/meta/production-upgrade", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load upgrade data")
      setData(json)
      if (json.workspace?.name && json.workspace.name !== "Demo Business") {
        setMethodAName(json.workspace.name)
        setManualName(json.workspace.name)
      }
      if (json.liveMetaWabas?.[0]?.id) {
        setMethodAWabaId(json.liveMetaWabas[0].id)
        setManualWabaId(json.liveMetaWabas[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Method A: Step 1 - Add Phone and Request OTP
  async function handleMethodAAddAndSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setBusyMethodA(true)
    setError("")
    setSuccessMsg("")
    setSandboxLimitInfo(null)
    try {
      // 1. Add phone to WABA
      const addRes = await fetch("/api/meta/production-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_add_phone",
          wabaId: methodAWabaId,
          countryCode: methodACountryCode,
          phoneNumber: methodAPhone,
          verifiedName: methodAName,
        }),
      })
      const addJson = await addRes.json()

      if (addJson.limitReached) {
        setSandboxLimitInfo(addJson)
        setError(addJson.error)
        setBusyMethodA(false)
        return
      }

      if (!addRes.ok) throw new Error(addJson.error || "Failed to create phone on Meta")

      const newPhoneId = addJson.phoneNumberId
      setMethodAPhoneId(newPhoneId)

      // 2. Request OTP via SMS
      const otpRes = await fetch("/api/meta/production-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_otp",
          phoneNumberId: newPhoneId,
          codeMethod: "SMS",
        }),
      })
      const otpJson = await otpRes.json()
      if (!otpRes.ok) throw new Error(otpJson.error || "Phone created, but SMS code failed")

      setOtpSent(true)
      setSuccessMsg(`✓ Phone created on Meta! 6-digit SMS verification code sent to +${methodACountryCode} ${methodAPhone}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Method A operation failed")
    } finally {
      setBusyMethodA(false)
    }
  }

  // Method A: Step 2 - Verify OTP Code & Register PIN
  async function handleMethodAVerifyAndRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!methodAPhoneId) return
    setBusyMethodA(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/production-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_and_register",
          phoneNumberId: methodAPhoneId,
          wabaId: methodAWabaId,
          code: otpCode.trim(),
          pin: pin.trim(),
          displayPhoneNumber: `+${methodACountryCode} ${methodAPhone}`,
          verifiedName: methodAName,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Verification and registration failed")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify and register")
    } finally {
      setBusyMethodA(false)
    }
  }

  // Tab 2: Manual Upgrade
  async function handleManualUpgrade(e: React.FormEvent) {
    e.preventDefault()
    if (!manualWabaId.trim() || !manualPhoneId.trim()) return
    setBusyManual(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/production-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_upgrade",
          wabaId: manualWabaId.trim(),
          phoneNumberId: manualPhoneId.trim(),
          displayPhoneNumber: manualPhone.trim(),
          verifiedName: manualName.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Manual connection failed")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual connection failed")
    } finally {
      setBusyManual(false)
    }
  }

  // Auto-Activate dynamically detected WABA & Phone
  async function handleAutoLink(wabaId: string, phoneId: string, displayPhone: string, verifiedName: string) {
    setLinkingId(phoneId)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/production-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_link_detected",
          wabaId,
          phoneNumberId: phoneId,
          displayPhoneNumber: displayPhone,
          verifiedName,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Auto-activation failed")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-activation failed")
    } finally {
      setLinkingId("")
    }
  }

  // Check slots and payment status dynamically
  async function handleCheckSlots(wabaIdToUse?: string) {
    setCheckingSlots(true)
    setError("")
    try {
      const res = await fetch("/api/meta/production-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_slots",
          wabaId: wabaIdToUse || methodAWabaId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Check slots failed")
      setSlotInfo(json)
      if (json.canAddNumber) {
        setSuccessMsg(json.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check slots failed")
    } finally {
      setCheckingSlots(false)
    }
  }

  if (loading && !data) {
    return <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading production upgrade configuration…</div>
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Top Header & Client Context */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#059669" }}>
            Production Upgrade Engine &bull; Multi-Client
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "4px 0 0", fontFamily: "Sora, sans-serif" }}>
            🌟 WhatsApp Production Upgrade: {data?.workspace.name || "Client Workspace"}
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Upgrade from sandbox test accounts to official live production WhatsApp numbers for broadcasts and live customer chat.
          </p>
        </div>

        {/* Tab Switcher Pills */}
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
              background: activeTab === "auto" ? "#059669" : "transparent",
              color: activeTab === "auto" ? "#fff" : "#334155",
              boxShadow: activeTab === "auto" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            ⚡ Tab 1: Automated Production Upgrade
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
              background: activeTab === "manual" ? "#059669" : "transparent",
              color: activeTab === "manual" ? "#fff" : "#334155",
              boxShadow: activeTab === "manual" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
          >
            📋 Tab 2: Manual Production Upgrade
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

      {/* ============================================================== */}
      {/* TAB 1: AUTOMATED PRODUCTION UPGRADE (DYNAMIC METHOD A & B)     */}
      {/* ============================================================== */}
      {activeTab === "auto" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Card 0: Dynamically Detected Meta Accounts & Numbers (Zero Manual Typing) */}
          <div style={{ background: "#fff", border: "1.5px solid #0284c7", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(2,132,199,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#0284c7" }}>
                  Live Meta Graph API Discovery
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                  ⚡ Auto-Detected Meta WhatsApp Accounts &amp; Numbers
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>↻</span> Rescan Meta Accounts
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px", lineHeight: 1.5 }}>
              The accounts and phone numbers below are dynamically queried from Meta Graph API under Business Portfolio <code>{data?.businessManagerId || "1707214344108990"}</code>. Click <strong>Auto-Activate</strong> to connect any number directly into your workspace without manual typing.
            </p>

            {data?.livePhones && data.livePhones.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {data.livePhones.map((phone: any) => {
                  const isCurrentDb = data.currentDbWaba?.phoneNumbers?.some((p: any) => p.phoneNumberId === phone.id)
                  const isBusy = linkingId === phone.id
                  return (
                    <div
                      key={phone.id}
                      style={{
                        background: isCurrentDb ? "#f0fdf4" : "#f8fafc",
                        border: `1.5px solid ${isCurrentDb ? "#86efac" : "#e2e8f0"}`,
                        borderRadius: 10,
                        padding: "12px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: "#0f172a" }}>
                            {phone.display_phone_number}
                          </span>
                          <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                            {phone.quality_rating || "GREEN"}
                          </span>
                          {phone.status && (
                            <span style={{ fontSize: 11, background: "#eff6ff", color: "#1e40af", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                              {phone.status}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                          <strong>{phone.verified_name || "WhatsApp Business"}</strong> &bull; WABA: <code>{phone.wabaName || phone.wabaId}</code> (ID: <code>{phone.wabaId}</code>) &bull; Phone ID: <code>{phone.id}</code>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isCurrentDb ? (
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span>✓</span> Active in Workspace
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(linkingId)}
                            onClick={() => handleAutoLink(phone.wabaId, phone.id, phone.display_phone_number, phone.verified_name)}
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
                            {isBusy ? "Activating…" : "⚡ 1-Click Auto-Activate"}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: 14, textAlign: "center", fontSize: 12, color: "#64748b" }}>
                No phone numbers found on Meta yet. Use Option 1 or Method A below to create or register.
              </div>
            )}
          </div>

          {/* Option 1 & 2 Unified Dynamic Manager */}
          <div style={{ background: "#fff", border: "1.5px solid #d97706", borderRadius: 12, padding: 22, boxShadow: "0 2px 8px rgba(217,119,6,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#d97706" }}>
                  Multi-Number Production Strategy &bull; Keep Both Numbers
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                  💡 Auto-Create Real Number Without Deleting Test Number
                </h3>
              </div>
              <span style={{ background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                Two Automated Paths
              </span>
            </div>

            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
              Because WABA <code>{methodAWabaId}</code> is in developer sandbox tier, Meta restricts it to 1 number. Choose either automated path below to add your official number (+91 77957 83535) while preserving the test number:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, marginBottom: 16 }}>
              {/* Option 1 Card */}
              <div style={{ background: "#fdf8f6", border: "1.5px solid #fed7aa", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#c2410c", marginBottom: 4 }}>
                  🌟 Path 1: Create 2nd WABA (Recommended)
                </div>
                <p style={{ fontSize: 11, color: "#7c2d12", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Portfolio <code>1707214344108990</code> can hold multiple WABAs. Create a 2nd WABA in Meta Business Suite, add +91 77957 83535 there, and click Rescan above — our app auto-detects and activates it with 1 click!
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href="https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=1707214344108990"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#c2410c",
                      color: "#fff",
                      padding: "7px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open Business Suite ➔ Add 2nd WABA ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => loadData()}
                    style={{
                      background: "#fff",
                      color: "#c2410c",
                      border: "1px solid #fed7aa",
                      padding: "7px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ↻ Scan for 2nd WABA
                  </button>
                </div>
              </div>

              {/* Option 2 Card */}
              <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#15803d", marginBottom: 4 }}>
                  💳 Path 2: Unlock 2nd Slot via Free Payment Method
                </div>
                <p style={{ fontSize: 11, color: "#166534", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Attach a payment method (Card/UPI) to WABA <code>{methodAWabaId}</code> in Meta. Meta raises the limit from 1 to 2 numbers immediately (first 1,000 conversations/month remain 100% free).
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <a
                    href={`https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${methodAWabaId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#15803d",
                      color: "#fff",
                      padding: "7px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Attach Payment Card/UPI in Meta ↗
                  </a>
                  <button
                    type="button"
                    disabled={checkingSlots}
                    onClick={() => handleCheckSlots(methodAWabaId)}
                    style={{
                      background: "#fff",
                      color: "#15803d",
                      border: "1px solid #bbf7d0",
                      padding: "7px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {checkingSlots ? "Checking…" : "⚡ Check Slot Status"}
                  </button>
                </div>
                {slotInfo && (
                  <div style={{ marginTop: 10, fontSize: 11, color: slotInfo.canAddNumber ? "#15803d" : "#b45309", fontWeight: 600 }}>
                    {slotInfo.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Method A Card: Direct API Add Phone & SMS OTP */}
          <div style={{ background: "#fff", border: "1.5px solid #059669", borderRadius: 12, padding: 22, boxShadow: "0 2px 8px rgba(5,150,105,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#059669" }}>
                  Automated Method A &bull; Direct Meta Graph API
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                  📱 Register Real WhatsApp Number via SMS OTP Verification
                </h3>
              </div>
              <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                In-App Dynamic Flow
              </span>
            </div>

            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
              Adds your real business phone number directly into Meta WABA (<code>{methodAWabaId}</code>), sends a real 6-digit SMS verification code to your phone, and registers it on Meta Cloud API without opening Meta Business Suite.
            </p>

            {/* Sandbox Limit Warning / Action Box */}
            {sandboxLimitInfo && (
              <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 12, color: "#92400e" }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6, display: "flex", alignItems: "center", gap: 6, color: "#b45309" }}>
                  <span>💡</span> How to Add Real WhatsApp (+91 77957 83535) Without Deleting Test Number:
                </div>
                <p style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
                  Because WABA <code>{methodAWabaId}</code> is currently in Meta&apos;s Developer Sandbox tier, Meta restricts this specific account to 1 number. You have two options to keep both:
                </p>
                <div style={{ display: "grid", gap: 8, margin: "0 0 12px" }}>
                  <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                    <strong>Option 1 (Recommended &bull; Keep Both Numbers):</strong> Create a separate official WABA under Business Portfolio <code>1707214344108990</code> in Meta Business Suite. Then paste its WABA ID &amp; Phone ID into <strong>Tab 2 (Manual Connect)</strong>.
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                    <strong>Option 2 (Unlock 2nd Number Slot):</strong> Add a payment method (Card/UPI) to WABA <code>{methodAWabaId}</code> in Meta WhatsApp Manager. Meta immediately raises the limit from 1 to 2 numbers (first 1,000 conversations/month remain 100% free).
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href="https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=1707214344108990"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#047857",
                      color: "#fff",
                      padding: "8px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open Meta Business Suite ➔ Create 2nd WABA ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => setActiveTab("manual")}
                    style={{
                      background: "#059669",
                      color: "#fff",
                      border: 0,
                      padding: "8px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Go to Tab 2: Manual Connect ➔
                  </button>
                  <a
                    href={sandboxLimitInfo.whatsappManagerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#fff",
                      color: "#b45309",
                      border: "1px solid #fde68a",
                      padding: "8px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Manage Existing Numbers (+1 555...) ↗
                  </a>
                </div>
              </div>
            )}

            {/* Step 1: Add Phone & Request OTP Form */}
            {!otpSent ? (
              <form onSubmit={handleMethodAAddAndSendOtp} style={{ display: "grid", gap: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      Target WABA ID:
                    </label>
                    <input
                      type="text"
                      required
                      value={methodAWabaId}
                      onChange={e => setMethodAWabaId(e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      Country Code &amp; Phone Number:
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="text"
                        value={methodACountryCode}
                        onChange={e => setMethodACountryCode(e.target.value)}
                        placeholder="91"
                        style={{ width: 60, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                      />
                      <input
                        type="text"
                        required
                        value={methodAPhone}
                        onChange={e => setMethodAPhone(e.target.value)}
                        placeholder="7795783535"
                        style={{ flex: 1, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      Verified Business Display Name:
                    </label>
                    <input
                      type="text"
                      required
                      value={methodAName}
                      onChange={e => setMethodAName(e.target.value)}
                      placeholder="Recruitment Training Academy"
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    Meta will deliver a 6-digit OTP code to +{methodACountryCode} {methodAPhone} via SMS
                  </span>
                  <button
                    type="submit"
                    disabled={busyMethodA || !methodAPhone.trim()}
                    style={{
                      background: "#059669",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "9px 18px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {busyMethodA ? "Contacting Meta Graph API…" : "1. Add Number to WABA & Send SMS Code ➔"}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: Enter OTP & Register PIN Form */
              <form onSubmit={handleMethodAVerifyAndRegister} style={{ display: "grid", gap: 14, background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#166534" }}>
                  Step 2 &bull; Enter the 6-Digit SMS Code Sent to +{methodACountryCode} {methodAPhone}:
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      6-Digit SMS Verification Code:
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      autoFocus
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value)}
                      placeholder="123456"
                      style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #059669", borderRadius: 6, padding: "8px 10px", fontSize: 16, letterSpacing: 4, fontFamily: "monospace" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      Two-Step Verification PIN (6 Digits):
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      placeholder="123456"
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 16, letterSpacing: 4, fontFamily: "monospace" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    style={{ background: "#fff", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 12px", fontSize: 11, cursor: "pointer" }}
                  >
                    ← Back / Re-enter Number
                  </button>
                  <button
                    type="submit"
                    disabled={busyMethodA || otpCode.trim().length !== 6}
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "9px 20px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(22, 163, 74, 0.3)",
                    }}
                  >
                    {busyMethodA ? "Verifying with Meta…" : "2. Verify Code & Register Live WhatsApp 🚀"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Method B Card: Meta Embedded Signup Popup */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1877F2" }}>
                  Automated Method B &bull; Official Meta Embedded Signup SDK
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                  ⚡ One-Click Meta Popup Onboarding
                </h3>
              </div>
              <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                Zero Manual Copying
              </span>
            </div>

            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 14px" }}>
              Launches Meta&apos;s official popup window. The business owner logs into Facebook, creates or chooses their official WhatsApp Business Account and registers their phone number. The credentials automatically return to your workspace without typing anything.
            </p>

            {data?.embeddedSignup.ready ? (
              <EmbeddedSignupButton
                config={{
                  appId: data.embeddedSignup.appId,
                  configId: data.embeddedSignup.configId,
                  graphVersion: data.embeddedSignup.graphVersion,
                }}
                onDone={result => {
                  setSuccessMsg(result.message || "✓ Meta Embedded Signup complete! Your WhatsApp account is active.")
                  loadData()
                }}
                onError={err => setError(err)}
              />
            ) : (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, fontSize: 12, color: "#475569" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>💡 Method B Embedded Signup Setup Notice:</div>
                <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
                  Meta Embedded Signup requires an active Meta Login Configuration ID from your Meta App (<code>WhatsApp &gt; Quickstart / Embedded Signup</code>) and enforces HTTPS.
                </p>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  👉 <strong>Recommended for now:</strong> Use <strong>Method A (Direct Meta API)</strong> above or <strong>Tab 2 (Manual Production Upgrade)</strong> below. Both communicate directly server-to-server with Meta Graph API without requiring client-side HTTPS.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: MANUAL PRODUCTION UPGRADE (COPY & PASTE FROM META)      */}
      {/* ============================================================== */}
      {activeTab === "manual" && (
        <div style={{ background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569" }}>
                Tab 2 &bull; Manual Connect
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a" }}>
                📋 Connect Production Credentials from Meta Business Suite
              </h3>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={`https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=${data?.businessManagerId || "1707214344108990"}`}
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Meta WhatsApp Accounts ↗
              </a>
              <a
                href={`https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${manualWabaId || "1169391638991834"}`}
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                WhatsApp Manager Phone Numbers ↗
              </a>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
            Paste the official WABA ID and Phone Number ID from Meta Business Suite or WhatsApp Manager. The system will link them to <strong>{data?.workspace.name}</strong>, subscribe incoming webhooks, and activate live messaging.
          </p>

          <form onSubmit={handleManualUpgrade} style={{ display: "grid", gap: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }}>
            {data?.livePhones && data.livePhones.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", background: "#f1f5f9", borderRadius: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Quick-fill from detected Meta numbers:</span>
                {data.livePhones.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setManualWabaId(p.wabaId)
                      setManualPhoneId(p.id)
                      setManualPhone(p.display_phone_number)
                      setManualName(p.verified_name || "Recruitment Training Academy")
                    }}
                    style={{
                      background: "#fff",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span>👉 Fill {p.display_phone_number}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Official WABA ID:
                </label>
                <input
                  type="text"
                  required
                  value={manualWabaId}
                  onChange={e => setManualWabaId(e.target.value)}
                  placeholder="e.g. 1169391638991834"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Official Phone Number ID (for +91 77957 83535):
                </label>
                <input
                  type="text"
                  required
                  value={manualPhoneId}
                  onChange={e => setManualPhoneId(e.target.value)}
                  placeholder="e.g. 1222715594258482 (from Meta WhatsApp Manager)"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Display Phone Number:
                </label>
                <input
                  type="text"
                  value={manualPhone}
                  onChange={e => setManualPhone(e.target.value)}
                  placeholder="+91 77957 83535"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Verified Business Name:
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Recruitment Training Academy"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="submit"
                disabled={busyManual || !manualPhoneId.trim()}
                style={{
                  background: "#059669",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "10px 22px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(5,150,105,0.25)",
                }}
              >
                {busyManual ? "Connecting Credentials…" : "Connect & Activate Production Credentials ➔"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

