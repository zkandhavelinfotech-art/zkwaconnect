"use client"
import { useCallback, useEffect, useState } from "react"

type GatewayData = {
  configured: boolean
  metaConnected: boolean
  gateway: {
    status: string
    graphVersion: string
    provider: string
    appId: string | null
    waba: {
      id: string
      wabaId: string
      name: string
      currency: string | null
      timezone: string | null
      webhookSubscribed: boolean | null
    } | null
    phone: {
      id: string
      phoneNumberId: string
      phoneNumber: string
      displayName: string | null
      qualityRating: string
      messagingLimit: string
      status: string
      verificationStatus: string | null
      callingEnabled: boolean
      countryCode: string
    } | null
    webhook: {
      callbackUrl: string
      events: string[]
      verifyTokenConfigured: boolean
      subscribed: boolean | null
    }
  }
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

export function WhatsAppGatewaySettings() {
  const [data, setData] = useState<GatewayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  // Form states
  const [callingEnabled, setCallingEnabled] = useState(false)
  const [countryCode, setCountryCode] = useState("IN")
  const [saving, setSaving] = useState(false)

  // Test message states
  const [testPhone, setTestPhone] = useState("")
  const [testText, setTestText] = useState("")
  const [sendingTest, setSendingTest] = useState(false)
  const [testSuccess, setTestSuccess] = useState("")

  // Method 2: Direct WABA & Cloud API Registration states
  const [showProvisionForm, setShowProvisionForm] = useState(true)
  const [provWabaId, setProvWabaId] = useState("")
  const [provPhoneId, setProvPhoneId] = useState("")
  const [provPhone, setProvPhone] = useState("+91 77957 83535")
  const [provName, setProvName] = useState("Recruitment Training Academy")
  const [provPin, setProvPin] = useState("123456")
  const [provBizId, setProvBizId] = useState("1707214344108990")
  const [provisioning, setProvisioning] = useState(false)
  const [provResult, setProvResult] = useState<{ ok: boolean; message: string } | null>(null)

  // OTP Verification states
  const [otpCode, setOtpCode] = useState("")
  const [requestingOtp, setRequestingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [otpMessage, setOtpMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/whatsapp/gateway", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to load gateway settings.")
      setData(body)
      if (body.gateway?.phone) {
        setCallingEnabled(Boolean(body.gateway.phone.callingEnabled))
        setCountryCode(body.gateway.phone.countryCode || "IN")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading gateway")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!data?.gateway?.phone?.id) return
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/whatsapp/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_phone_settings",
          phoneId: data.gateway.phone.id,
          callingEnabled,
          countryCode,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Could not save settings.")
      setNotice("Gateway settings updated successfully.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update gateway.")
    } finally {
      setSaving(false)
    }
  }

  async function sendTestMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!testPhone.trim()) return
    setSendingTest(true)
    setError("")
    setTestSuccess("")
    try {
      const res = await fetch("/api/whatsapp/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_test_message",
          recipientPhone: testPhone.trim(),
          messageText: testText.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to send test message.")
      setTestSuccess(body.message || "Test message transmitted successfully!")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test message failed.")
    } finally {
      setSendingTest(false)
    }
  }

  async function handleProvisionCloudApi(e: React.FormEvent) {
    e.preventDefault()
    if (!provWabaId.trim() || !provPhoneId.trim()) return
    setProvisioning(true)
    setError("")
    setNotice("")
    setProvResult(null)
    try {
      const res = await fetch("/api/whatsapp/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "provision_cloud_api",
          wabaId: provWabaId.trim(),
          phoneNumberId: provPhoneId.trim(),
          displayPhoneNumber: provPhone.trim(),
          displayName: provName.trim(),
          pin: provPin.trim(),
          businessManagerId: provBizId.trim(),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Provisioning failed.")
      setProvResult({ ok: true, message: body.message })
      setNotice(body.message)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Provisioning failed"
      setProvResult({ ok: false, message: msg })
      setError(msg)
    } finally {
      setProvisioning(false)
    }
  }

  async function handleRequestOtp(method: "SMS" | "VOICE") {
    if (!provPhoneId.trim()) {
      setError("Please enter the Phone Number ID first.")
      return
    }
    setRequestingOtp(true)
    setError("")
    setOtpMessage("")
    try {
      const res = await fetch("/api/whatsapp/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_otp",
          phoneNumberId: provPhoneId.trim(),
          codeMethod: method,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to request OTP.")
      setOtpMessage(body.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request OTP.")
    } finally {
      setRequestingOtp(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!provPhoneId.trim() || !otpCode.trim()) return
    setVerifyingOtp(true)
    setError("")
    setOtpMessage("")
    try {
      const res = await fetch("/api/whatsapp/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_otp",
          phoneNumberId: provPhoneId.trim(),
          code: otpCode.trim(),
          pin: provPin.trim() || "123456",
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Failed to verify OTP.")
      setOtpMessage(body.message)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed.")
    } finally {
      setVerifyingOtp(false)
    }
  }

  if (loading && !data) {
    return <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading WhatsApp Gateway settings…</div>
  }

  const isConnected = data?.gateway?.status === "CONNECTED"
  const gw = data?.gateway

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
            WhatsApp Gateway Settings
          </h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            Routing, sender credentials, quality limits, and live dispatch controls for your WhatsApp Cloud API gateway.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
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
          {loading ? "Checking…" : "↻ Refresh Gateway"}
        </button>
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

      {/* Gateway Status Banner */}
      <div
        style={{
          border: `1.5px solid ${isConnected ? "#bbf7d0" : "#fed7aa"}`,
          background: isConnected ? "#f0fdf4" : "#fff7ed",
          borderRadius: 12,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>{isConnected ? "🟢" : "🟠"}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: isConnected ? "#14532d" : "#9a3412" }}>
              Gateway Status: {isConnected ? "ONLINE & TRANSMITTING" : gw?.status || "NOT CONFIGURED"}
            </div>
            <div style={{ fontSize: 12, color: isConnected ? "#166534" : "#c2410c", marginTop: 2 }}>
              Provider: {gw?.provider} · Meta API {gw?.graphVersion}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "4px 10px",
              borderRadius: 20,
              background: isConnected ? "#dcfce7" : "#ffedd5",
              color: isConnected ? "#15803d" : "#c2410c",
            }}
          >
            {isConnected ? "CLOUD API READY" : "PENDING NUMBER REGISTRATION"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16 }}>
        {/* Method 2 Direct WABA & Phone Registration Tool */}
        <div style={{ ...cardStyle, gridColumn: "1 / -1", border: "1.5px solid #25D366", background: "#f0fdf4" }}>
          <div style={{ ...headStyle, color: "#14532d", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <span>Method 2: Meta Developer WhatsApp Cloud API Direct Registration Tool</span>
            </div>
            <a
              href="https://developers.facebook.com/apps/1710743377107186/whatsapp-business/wa-dev-console/"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "#1877F2",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open Meta Dev Console (App 1710743377107186) ↗
            </a>
          </div>

          <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.6, marginBottom: 14 }}>
            Directly register your <strong>WhatsApp Business Account (WABA)</strong> and Phone Number (<code>+91 77957 83535</code>) for Cloud API routing. This bypasses the mobile app and links enterprise Cloud API messaging straight to your ZKWAConnect gateway.
          </div>

          {/* 3-Step Walkthrough Banner */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 11 }}>
              <strong style={{ color: "#15803d" }}>Step 1: Open Meta Dev Console</strong>
              <div style={{ color: "#475569", marginTop: 2 }}>
                Click the blue button above to open App <code>1710743377107186</code> WhatsApp Setup.
              </div>
            </div>
            <div style={{ background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 11 }}>
              <strong style={{ color: "#15803d" }}>Step 2: Add Phone Number</strong>
              <div style={{ color: "#475569", marginTop: 2 }}>
                Click <strong>Add phone number</strong> ➔ Display Name: <code>Recruitment Training Academy</code> ➔ Enter <code>77957 83535</code>.
              </div>
            </div>
            <div style={{ background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 11 }}>
              <strong style={{ color: "#15803d" }}>Step 3: Copy IDs &amp; Register</strong>
              <div style={{ color: "#475569", marginTop: 2 }}>
                Paste the <strong>WABA ID</strong> and <strong>Phone number ID</strong> below &rarr; Click Register!
              </div>
            </div>
          </div>

          {provResult && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 14,
                background: provResult.ok ? "#dcfce7" : "#fee2e2",
                border: `1px solid ${provResult.ok ? "#86efac" : "#fca5a5"}`,
                color: provResult.ok ? "#15803d" : "#991b1b",
                fontWeight: 700,
              }}
            >
              {provResult.message}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleProvisionCloudApi} style={{ display: "grid", gap: 12, background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #cbd5e1" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  WhatsApp Business Account (WABA) ID *
                </label>
                <input
                  value={provWabaId}
                  onChange={e => setProvWabaId(e.target.value)}
                  placeholder="e.g. 104928374659102"
                  required
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Phone Number ID *
                </label>
                <input
                  value={provPhoneId}
                  onChange={e => setProvPhoneId(e.target.value)}
                  placeholder="e.g. 102938475610293"
                  required
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Display Phone Number
                </label>
                <input
                  value={provPhone}
                  onChange={e => setProvPhone(e.target.value)}
                  placeholder="+91 77957 83535"
                  required
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Verified Business Display Name
                </label>
                <input
                  value={provName}
                  onChange={e => setProvName(e.target.value)}
                  placeholder="Recruitment Training Academy"
                  required
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  6-Digit Registration PIN (for Two-Step Verification)
                </label>
                <input
                  value={provPin}
                  onChange={e => setProvPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  required
                  maxLength={6}
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace", letterSpacing: 2 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Meta Business Portfolio ID
                </label>
                <input
                  value={provBizId}
                  onChange={e => setProvBizId(e.target.value)}
                  placeholder="1707214344108990"
                  required
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <button
                type="submit"
                disabled={provisioning || !provWabaId.trim() || !provPhoneId.trim()}
                style={{
                  background: "#075e54",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "10px 18px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: provisioning || !provWabaId.trim() || !provPhoneId.trim() ? "not-allowed" : "pointer",
                  opacity: provisioning || !provWabaId.trim() || !provPhoneId.trim() ? 0.6 : 1,
                }}
              >
                {provisioning ? "Registering on Cloud API…" : "⚡ 1-Click Provision & Register on Cloud API"}
              </button>

              <div style={{ fontSize: 11, color: "#64748b" }}>
                Auto-registers the 6-digit PIN and activates webhook routing for your number.
              </div>
            </div>
          </form>

          {/* OTP Section (If Phone requires direct SMS/Call OTP) */}
          <div style={{ marginTop: 14, background: "#fff", padding: 14, borderRadius: 8, border: "1px dashed #86efac" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#14532d", marginBottom: 6 }}>
              Need to Verify Phone Number via OTP First?
            </div>
            <p style={{ fontSize: 11, color: "#475569", margin: "0 0 10px", lineHeight: 1.5 }}>
              If your Phone Number ID is newly created in Meta and requires SMS/Voice OTP verification:
            </p>

            {otpMessage && (
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: 8, borderRadius: 6, color: "#065f46", fontSize: 11, marginBottom: 10, fontWeight: 700 }}>
                {otpMessage}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                disabled={requestingOtp || !provPhoneId.trim()}
                onClick={() => handleRequestOtp("SMS")}
                style={{
                  background: "#1877F2",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "7px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: requestingOtp || !provPhoneId.trim() ? "not-allowed" : "pointer",
                }}
              >
                {requestingOtp ? "Sending SMS…" : "📲 Request SMS OTP to Phone"}
              </button>

              <button
                type="button"
                disabled={requestingOtp || !provPhoneId.trim()}
                onClick={() => handleRequestOtp("VOICE")}
                style={{
                  background: "#334155",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "7px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: requestingOtp || !provPhoneId.trim() ? "not-allowed" : "pointer",
                }}
              >
                📞 Request Voice Call OTP
              </button>

              <form onSubmit={handleVerifyOtp} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  style={{
                    border: "1.5px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontFamily: "monospace",
                    letterSpacing: 2,
                    width: 140,
                  }}
                />
                <button
                  type="submit"
                  disabled={verifyingOtp || otpCode.length !== 6}
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    border: 0,
                    borderRadius: 6,
                    padding: "7px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: verifyingOtp || otpCode.length !== 6 ? "not-allowed" : "pointer",
                  }}
                >
                  {verifyingOtp ? "Verifying…" : "✓ Verify OTP & Activate"}
                </button>
              </form>
            </div>
          </div>
        </div>
        {/* Card 1: Sender & Routing Credentials */}
        <div style={cardStyle}>
          <div style={headStyle}>
            <span>📡</span> Sender & Account Credentials
          </div>
          <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>Display Number</span>
              <strong style={{ color: "#0f172a" }}>{gw?.phone?.phoneNumber || "Not registered"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>Verified Name</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{gw?.phone?.displayName || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>Phone Number ID</span>
              <code style={{ fontSize: 11, background: "#f8fafc", padding: "2px 6px", borderRadius: 4 }}>
                {gw?.phone?.phoneNumberId || "—"}
              </code>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>WABA ID</span>
              <code style={{ fontSize: 11, background: "#f8fafc", padding: "2px 6px", borderRadius: 4 }}>
                {gw?.waba?.wabaId || "—"}
              </code>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>Quality Rating</span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: gw?.phone?.qualityRating === "GREEN" ? "#dcfce7" : "#fef9c3",
                  color: gw?.phone?.qualityRating === "GREEN" ? "#15803d" : "#a16207",
                }}
              >
                {gw?.phone?.qualityRating || "UNKNOWN"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Daily Messaging Tier</span>
              <span style={{ fontWeight: 700, color: "#1e293b" }}>{gw?.phone?.messagingLimit || "TIER_250"}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Webhook Gateway & Inbound Events */}
        <div style={cardStyle}>
          <div style={headStyle}>
            <span>⚡</span> Webhook & Inbound Gateway
          </div>
          <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Delivery Callback URL:
              </span>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  marginTop: 4,
                  color: "#0f172a",
                }}
              >
                {gw?.webhook.callbackUrl}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>Meta Webhook Subscribed</span>
              <span style={{ fontWeight: 700, color: gw?.webhook.subscribed ? "#15803d" : "#b91c1c" }}>
                {gw?.webhook.subscribed ? "Subscribed (Active) ✓" : "Not Subscribed ✕"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
              <span style={{ color: "#64748b" }}>Signature Verification</span>
              <span style={{ fontWeight: 700, color: gw?.webhook.verifyTokenConfigured ? "#15803d" : "#b91c1c" }}>
                {gw?.webhook.verifyTokenConfigured ? "HMAC-SHA256 ✓" : "Token Missing ✕"}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Subscribed Event Topics:
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {gw?.webhook.events.map(ev => (
                  <span key={ev} style={{ fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "2px 7px", borderRadius: 12, fontFamily: "monospace" }}>
                    ✓ {ev}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Gateway Configuration Controls */}
        <div style={cardStyle}>
          <div style={headStyle}>
            <span>⚙️</span> Gateway Controls
          </div>
          <form onSubmit={saveSettings} style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                Default Country Calling Code
              </label>
              <input
                value={countryCode}
                onChange={e => setCountryCode(e.target.value.toUpperCase())}
                placeholder="e.g. IN (+91), US (+1)"
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

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #f1f5f9" }}>
              <div>
                <strong style={{ fontSize: 13, color: "#0f172a" }}>WhatsApp Cloud API Calling</strong>
                <div style={{ fontSize: 11, color: "#64748b" }}>Allow browser agents to receive voice calls on this number.</div>
              </div>
              <input
                type="checkbox"
                checked={callingEnabled}
                onChange={e => setCallingEnabled(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#075e54", cursor: "pointer" }}
              />
            </div>

            <button
              type="submit"
              disabled={saving || !gw?.phone}
              style={{
                background: "#075e54",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "9px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                opacity: saving || !gw?.phone ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Gateway Controls"}
            </button>
          </form>
        </div>

        {/* Card 4: Gateway Live Test Dispatcher */}
        <div style={cardStyle}>
          <div style={headStyle}>
            <span>🚀</span> Test Gateway Dispatcher
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px", lineHeight: 1.5 }}>
            Verify end-to-end delivery by transmitting a test message through this Cloud API gateway to any WhatsApp mobile number.
          </p>

          {testSuccess && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 10, borderRadius: 8, color: "#15803d", fontSize: 12, marginBottom: 12 }}>
              {testSuccess}
            </div>
          )}

          <form onSubmit={sendTestMessage} style={{ display: "grid", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
                Recipient WhatsApp Number (with Country Code)
              </label>
              <input
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="e.g. 919876543210"
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

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
                Custom Test Text (Optional)
              </label>
              <input
                value={testText}
                onChange={e => setTestText(e.target.value)}
                placeholder="Hello from ZKWAConnect! Gateway is transmitting."
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
              disabled={sendingTest || !isConnected}
              style={{
                background: isConnected ? "#1877F2" : "#94a3b8",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "9px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isConnected ? "pointer" : "not-allowed",
              }}
            >
              {sendingTest ? "Transmitting…" : "Transmit Test Message →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

