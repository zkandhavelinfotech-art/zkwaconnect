"use client"
import { useCallback, useEffect, useState } from "react"
import { ProductionUpgradeManager } from "@/components/meta/ProductionUpgradeManager"

type WabaInfo = {
  id: string
  name: string
  currency?: string
  timezone_id?: string
  phoneNumbers?: {
    id: string
    display_phone_number: string
    verified_name?: string
    code_verification_status?: string
    quality_rating?: string
  }[]
}

type RtaData = {
  ok: boolean
  activeWorkspace?: {
    id: string
    name: string
    isRta: boolean
  }
  workspaces?: {
    id: string
    name: string
    slug: string
    isRta: boolean
  }[]
  businessPortfolio: {
    id: string
    name: string
    verificationStatus: string
    url: string
  }
  waba: {
    hasWaba: boolean
    primaryWaba: WabaInfo | null
    allWabas: WabaInfo[]
    livePhones: {
      id: string
      display_phone_number: string
      verified_name?: string
      code_verification_status?: string
      quality_rating?: string
      wabaId: string
      wabaName: string
    }[]
    webhookSubscribed: boolean
    webhookUrl: string
    verifyToken: string
    dbSynced: boolean
  }
  pageIntegration: {
    url: string
    inspection: {
      status: number
      title: string | null
      numericId: string | null
      isProfile: boolean
      hasDirectPageId: boolean
      error?: string
    }
    ownedPages: { id: string; name: string; link?: string }[]
    managedPages: { id: string; name: string; link?: string }[]
    isPageClaimed: boolean
    createPageUrl: string
    addPageUrl: string
  }
  metaAppId: string
  graphVersion: string
}

export function RtaConnectorHub() {
  const [data, setData] = useState<RtaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // Sync state
  const [syncing, setSyncing] = useState(false)

  // Test message state
  const [testRecipient, setTestRecipient] = useState("919632108103")
  const [recipientLabel, setRecipientLabel] = useState("Customer RTA")
  const [testText, setTestText] = useState("Hello from Recruitment Training Academy (+91 77957 83535)! Your direct WhatsApp messaging is active.")
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  // Official Production WABA state
  const [officialWabaId, setOfficialWabaId] = useState("1169391638991834")
  const [officialPhoneId, setOfficialPhoneId] = useState("")
  const [officialPhoneNumber, setOfficialPhoneNumber] = useState("+91 77957 83535")
  const [officialVerifiedName, setOfficialVerifiedName] = useState("Recruitment Training Academy")
  const [connectingOfficial, setConnectingOfficial] = useState(false)

  // Page claim / link state
  const [customPageId, setCustomPageId] = useState("")
  const [claimingPage, setClaimingPage] = useState(false)
  const [linkingWhatsApp, setLinkingWhatsApp] = useState(false)
  const [linkResult, setLinkResult] = useState<any>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/meta/rta-connector", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load RTA data")
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading RTA configuration")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSwitchWorkspace(orgId: string) {
    try {
      const res = await fetch("/api/workspaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch {
      // ignore
    }
  }

  async function handleSyncWaba() {
    if (!data?.waba.primaryWaba) return
    setSyncing(true)
    setError("")
    setSuccessMsg("")
    try {
      const primaryPhone = data.waba.livePhones[0]
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_waba",
          wabaId: data.waba.primaryWaba.id,
          phoneNumberId: primaryPhone?.id || "1408496172352210",
          displayPhoneNumber: primaryPhone?.display_phone_number || "+91 77957 83535",
          verifiedName: primaryPhone?.verified_name || "Recruitment Training Academy",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Sync failed")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync WABA")
    } finally {
      setSyncing(false)
    }
  }

  async function handleSendTestMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!testRecipient.trim()) return
    setSendingTest(true)
    setError("")
    setSuccessMsg("")
    setTestResult(null)
    try {
      const primaryPhone = data?.waba.livePhones[0]
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_test_message",
          recipientPhone: testRecipient.trim(),
          recipientLabel,
          phoneNumberId: primaryPhone?.id || "1408496172352210",
          messageText: testText.trim(),
        }),
      })
      const json = await res.json()
      if (json.recordedInInbox && json.inboxUrl) {
        setTestResult(json)
        setSuccessMsg(json.message)
      } else if (!res.ok) {
        throw new Error(json.error || "Failed to send message")
      } else {
        setTestResult(json)
        setSuccessMsg(json.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test message")
    } finally {
      setSendingTest(false)
    }
  }

  async function handleConnectOfficialWaba(e: React.FormEvent) {
    e.preventDefault()
    if (!officialWabaId.trim() || !officialPhoneId.trim()) return
    setConnectingOfficial(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect_official_waba",
          wabaId: officialWabaId.trim(),
          phoneNumberId: officialPhoneId.trim(),
          displayPhoneNumber: officialPhoneNumber.trim(),
          verifiedName: officialVerifiedName.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to connect official WABA")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting official WABA")
    } finally {
      setConnectingOfficial(false)
    }
  }

  async function handleClaimPage(e: React.FormEvent) {
    e.preventDefault()
    const pageIdToUse = customPageId.trim() || data?.pageIntegration.inspection.numericId
    if (!pageIdToUse) return
    setClaimingPage(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim_facebook_page",
          pageId: pageIdToUse,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to claim page")
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim page")
    } finally {
      setClaimingPage(false)
    }
  }

  async function handleLinkWhatsAppToPage() {
    const pageIdToUse = customPageId.trim() || data?.pageIntegration.inspection.numericId || "100075867504434"
    setLinkingWhatsApp(true)
    setError("")
    setSuccessMsg("")
    setLinkResult(null)
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_whatsapp_to_page",
          pageId: pageIdToUse,
          phoneNumber: "7795783535",
        }),
      })
      const json = await res.json()
      setLinkResult(json)
      if (json.ok) {
        setSuccessMsg(json.message)
      } else if (json.message) {
        setSuccessMsg(json.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link WhatsApp")
    } finally {
      setLinkingWhatsApp(false)
    }
  }

  if (loading && !data) {
    return <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Loading RTA WhatsApp & Facebook status…</div>
  }

  return (
    <div style={{ display: "grid", gap: 20, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {/* Multi-Tenant Workspace Selector Banner */}
      {data?.activeWorkspace && (
        <div
          style={{
            background: data.activeWorkspace.isRta ? "#f0fdf4" : "#fffbeb",
            border: `1.5px solid ${data.activeWorkspace.isRta ? "#86efac" : "#fde68a"}`,
            borderRadius: 12,
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: data.activeWorkspace.isRta ? "#15803d" : "#b45309" }}>
              🏢 Active Project Workspace: <strong>{data.activeWorkspace.name}</strong>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>
              {data.activeWorkspace.isRta
                ? "✓ You are currently operating inside the Recruitment Training Academy project workspace with WABA 1169391638991834."
                : `You are in "${data.activeWorkspace.name}". Switch to Recruitment Training Academy to isolate its WABA, contacts, and live inbox.`}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {data.workspaces
              ?.filter(w => w.id !== data.activeWorkspace?.id)
              .map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleSwitchWorkspace(w.id)}
                  style={{
                    background: w.isRta ? "#047857" : "#fff",
                    color: w.isRta ? "#fff" : "#334155",
                    border: w.isRta ? 0 : "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {w.isRta ? "👉 Switch to " + w.name + " ⇄" : "Switch to " + w.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Top Banner: Explaining Direct WhatsApp Cloud API without Facebook Page */}
      <div
        style={{
          background: "linear-gradient(135deg, #065f46 0%, #047857 100%)",
          borderRadius: 14,
          padding: "24px 26px",
          color: "#fff",
          boxShadow: "0 4px 14px rgba(6, 95, 70, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>💡</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "Sora, sans-serif" }}>
            Good News for WhatsApp Business: A Facebook Page is NOT Required!
          </h2>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "#d1fae5", margin: "0 0 14px", maxWidth: 900 }}>
          Your WhatsApp Cloud API gateway operates <strong>directly</strong> on your WhatsApp Business Account (WABA ID:{" "}
          <strong style={{ color: "#fff" }}>{data?.waba.primaryWaba?.id || "1169391638991834"}</strong>) under Business Portfolio{" "}
          <strong style={{ color: "#fff" }}>{data?.businessPortfolio.id || "1707214344108990"}</strong> (
          <em>{data?.businessPortfolio.name}</em>). You can send broadcasts, chat with candidates, and trigger automated alerts immediately without waiting for Facebook Page approval!
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: "rgba(255,255,255,0.2)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            ⚡ Business Portfolio: {data?.businessPortfolio.id || "1707214344108990"}
          </span>
          <span style={{ background: "rgba(255,255,255,0.2)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            📱 WhatsApp Phone: +91 77957 83535
          </span>
          <span style={{ background: "rgba(255,255,255,0.2)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            🚀 Meta App: {data?.metaAppId || "1710743377107186"}
          </span>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: 8, color: "#166534", fontSize: 13 }}>
          {successMsg}
        </div>
      )}

      {/* Main Grid: Left = Direct WhatsApp Cloud API; Right = Facebook Page Linking */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))", gap: 20 }}>
        
        {/* ============================================================== */}
        {/* SECTION 1: HOW TO USE DIRECT WHATSAPP CLOUD API FOR RTA       */}
        {/* ============================================================== */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#059669" }}>
                Part 1 &bull; Direct WhatsApp Cloud API
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "4px 0 0", color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                ⚡ How to Use WhatsApp for RTA Now
              </h3>
            </div>
            <button
              type="button"
              onClick={handleSyncWaba}
              disabled={syncing}
              style={{
                background: data?.waba.dbSynced ? "#f0fdf4" : "#10b981",
                color: data?.waba.dbSynced ? "#166534" : "#fff",
                border: data?.waba.dbSynced ? "1px solid #bbf7d0" : 0,
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {syncing ? "Syncing…" : data?.waba.dbSynced ? "✓ Synced with Workspace" : "🔄 Sync WABA to Inbox"}
            </button>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
            WhatsApp Cloud API sends and receives messages <strong>without</strong> passing through a Facebook Page. Here are your verified Cloud API credentials:
          </p>

          {/* WABA & Phone Details */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "8px 12px", alignItems: "center" }}>
              <span style={{ color: "#64748b", fontWeight: 600 }}>Active WhatsApp Phone:</span>
              <span style={{ fontWeight: 800, color: "#166534", fontSize: 13, background: "#dcfce7", padding: "3px 8px", borderRadius: 4, display: "inline-block" }}>
                📱 +91 77957 83535 (Official Business Phone &bull; RTA)
              </span>

              <span style={{ color: "#64748b", fontWeight: 600 }}>WABA Account:</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>
                {data?.waba.primaryWaba?.name || "Test Messaging Account"} (ID: {data?.waba.primaryWaba?.id || "1169391638991834"})
              </span>

              <span style={{ color: "#64748b", fontWeight: 600 }}>Cloud API Phone ID:</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>
                {data?.waba.livePhones[0]?.id || "1408496172352210"} ({data?.waba.livePhones[0]?.display_phone_number || "+1 555-140-6238"})
              </span>

              <span style={{ color: "#64748b", fontWeight: 600 }}>Webhook URL:</span>
              <code style={{ fontSize: 11, background: "#e2e8f0", padding: "2px 6px", borderRadius: 4, overflowX: "auto" }}>
                {data?.waba.webhookUrl}
              </code>

              <span style={{ color: "#64748b", fontWeight: 600 }}>Webhook Status:</span>
              <span style={{ color: data?.waba.webhookSubscribed ? "#166534" : "#b45309", fontWeight: 700 }}>
                {data?.waba.webhookSubscribed ? "● Subscribed & Active" : "○ Ready for Subscription"}
              </span>
            </div>
          </div>

          {/* Live Message Tester Form */}
          <div style={{ border: "1.5px solid #a7f3d0", borderRadius: 8, padding: 16, background: "#f0fdf4" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#065f46", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🚀</span> Test Live WhatsApp Transmission &amp; Live Chat Inbox
            </div>
            <form onSubmit={handleSendTestMessage} style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 6 }}>
                  Target Phone (Select recipient to test):
                </label>
                
                {/* 2 Quick Select Buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTestRecipient("919632108103")
                      setRecipientLabel("Customer RTA")
                    }}
                    style={{
                      background: testRecipient === "919632108103" ? "#065f46" : "#fff",
                      color: testRecipient === "919632108103" ? "#fff" : "#1e293b",
                      border: `1.5px solid ${testRecipient === "919632108103" ? "#065f46" : "#cbd5e1"}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>🎯 1. Customer RTA:</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 800 }}>+91 96321 08103</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTestRecipient("917824055618")
                      setRecipientLabel("ZKandavel Infotech")
                    }}
                    style={{
                      background: testRecipient === "917824055618" ? "#065f46" : "#fff",
                      color: testRecipient === "917824055618" ? "#fff" : "#1e293b",
                      border: `1.5px solid ${testRecipient === "917824055618" ? "#065f46" : "#cbd5e1"}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>🎯 2. ZKandavel Infotech:</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 800 }}>+91 78240 55618</span>
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Or custom number:</span>
                  <input
                    type="text"
                    value={testRecipient}
                    onChange={e => {
                      setTestRecipient(e.target.value)
                      setRecipientLabel(`Custom ${e.target.value}`)
                    }}
                    placeholder="e.g. 919632108103"
                    style={{
                      flex: 1,
                      boxSizing: "border-box",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                  Message Text (Sent from +91 77957 83535):
                </label>
                <textarea
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#065f46" }}>
                  Transmits via WhatsApp Cloud API &amp; records in Live Chat Inbox
                </span>
                <button
                  type="submit"
                  disabled={sendingTest}
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
                  {sendingTest ? "Transmitting…" : "🚀 Send & View in Inbox"}
                </button>
              </div>
            </form>

            {testResult && (
              <div style={{ marginTop: 14, background: "#fff", border: `1.5px solid ${testResult.ok ? "#86efac" : "#fde68a"}`, borderRadius: 8, padding: 14, fontSize: 12 }}>
                <div style={{ color: testResult.ok ? "#166534" : "#b45309", fontWeight: 800, fontSize: 13, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{testResult.ok ? "✓" : "⚠️"}</span>
                  {testResult.ok
                    ? "Transmitted to Meta & Saved to Live Chat Inbox!"
                    : "Logged in Live Chat Inbox (Meta Sandbox Recipient Verification Notice)"}
                </div>
                <div style={{ color: "#334155", marginBottom: 4 }}>
                  <strong>Sender Business Phone:</strong> <span style={{ color: "#166534", fontWeight: 700 }}>+91 77957 83535</span> (Recruitment Training Academy)
                </div>
                <div style={{ color: "#334155", marginBottom: 4 }}>
                  <strong>Recipient Target:</strong> <strong>{testResult.contactName || recipientLabel}</strong> (+{testResult.recipient})
                </div>
                {testResult.messageId && (
                  <div style={{ color: "#334155", marginBottom: 8 }}>
                    <strong>WhatsApp Message ID:</strong> <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{testResult.messageId}</code>
                  </div>
                )}

                {testResult.error && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: 6, padding: "8px 12px", marginTop: 8, marginBottom: 8, color: "#92400e", fontSize: 11, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Meta Cloud API Response:</div>
                    <div>{testResult.error}</div>
                    {testResult.error.includes("allowed list") && (
                      <div style={{ marginTop: 6 }}>
                        💡 <strong>Meta Sandbox Rule:</strong> Test numbers can only deliver WhatsApp messages to recipient numbers verified in Meta App Console.
                        <a
                          href="https://developers.facebook.com/apps/1710743377107186/whatsapp-business/wa-dev-console/"
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: 6, color: "#b45309", fontWeight: 800, textDecoration: "underline" }}
                        >
                          Add +{testResult.recipient} to Meta Allowed Numbers ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {testResult.inboxUrl && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <a
                      href={testResult.inboxUrl}
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "8px 16px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: "0 2px 6px rgba(22, 163, 74, 0.3)",
                      }}
                    >
                      💬 Open Conversation in Live Chat Inbox ➔
                    </a>
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      See live message thread, candidate notes &amp; replies
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: FACEBOOK PAGE INTEGRATION & WHATSAPP BUTTON LINKING */}
        {/* ============================================================== */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1877F2" }}>
                Part 2 &bull; Facebook Page Integration
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "4px 0 0", color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                📄 Link Facebook Page & WhatsApp CTA
              </h3>
            </div>
            <a
              href="https://www.facebook.com/Recruitmenttrainingacademy"
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#1877F2",
                textDecoration: "none",
                background: "#eff6ff",
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #bfdbfe",
              }}
            >
              Open Page ↗
            </a>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "0 0 14px" }}>
            Connecting your Facebook Page lets you put a prominent <strong>“Send WhatsApp Message”</strong> chat button on your Facebook Page header, directing candidates to your WhatsApp number <code>+91 77957 83535</code>.
          </p>

          {/* Diagnostic Box for Recruitmenttrainingacademy */}
          <div style={{ background: "#f8fafc", border: "1.5px solid #cbd5e1", borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
              🔍 Live Facebook Detection: <span style={{ fontFamily: "monospace", color: "#1877F2" }}>/Recruitmenttrainingacademy</span>
            </div>

            <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
              <div>
                <strong>Page / Account Title:</strong> {data?.pageIntegration.inspection.title || "Recruitment Training Academy - RTA"}
              </div>
              <div>
                <strong>Resolved Numeric ID:</strong> <code>{data?.pageIntegration.inspection.numericId || "100075867504434"}</code>
              </div>
              <div>
                <strong>Account Type:</strong>{" "}
                {data?.pageIntegration.inspection.isProfile ? (
                  <span style={{ color: "#d97706", fontWeight: 700, background: "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>
                    ⚠️ Personal Facebook Profile (1000...)
                  </span>
                ) : (
                  <span style={{ color: "#166534", fontWeight: 700, background: "#dcfce7", padding: "2px 8px", borderRadius: 4 }}>
                    ✓ Official Facebook Page
                  </span>
                )}
              </div>
            </div>

            {/* Explanation if currently a personal profile */}
            {data?.pageIntegration.inspection.isProfile && (
              <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 10, fontSize: 11, color: "#92400e", lineHeight: 1.5 }}>
                <strong>Important Meta Rule:</strong> Account ID <code>100075867504434</code> is registered as a personal user profile. Meta's WhatsApp API and Business Suite only allow official <strong>Facebook Business Pages</strong> to be linked to WhatsApp Business accounts.
              </div>
            )}
          </div>

          {/* Step A: Create or Connect Official Page */}
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e40af", marginBottom: 4 }}>
              Step 1: Add or Create Official Page in Portfolio 1707214344108990
            </div>
            <p style={{ fontSize: 11, color: "#3b82f6", margin: "0 0 10px", lineHeight: 1.4 }}>
              If you have already created the official Page, paste its numeric Page ID below to claim it into your Business Portfolio:
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#1e40af" }}>Official Page:</span>
              <button
                type="button"
                onClick={() => setCustomPageId("1466798486509943")}
                style={{
                  background: "#fff",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                👉 Use Official Page ID: 1466798486509943
              </button>
            </div>

            <form onSubmit={handleClaimPage} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input
                type="text"
                value={customPageId}
                onChange={e => setCustomPageId(e.target.value)}
                placeholder="Enter Official Page ID or URL"
                style={{
                  flex: 1,
                  minWidth: 180,
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                }}
              />
              <button
                type="submit"
                disabled={claimingPage}
                style={{
                  background: "#1877F2",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {claimingPage ? "Adding…" : "Add to Portfolio 1707214344108990"}
              </button>
            </form>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={`https://business.facebook.com/settings/pages?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#fff",
                  color: "#1877F2",
                  border: "1px solid #93c5fd",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ➕ Create/Add Page in Meta Business Suite ↗
              </a>
            </div>
          </div>

          {/* Step B: Link WhatsApp Number to Facebook Page */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              Step 2: Connect WhatsApp Number (+91 77957 83535) as Chat CTA
            </div>
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 10px", lineHeight: 1.4 }}>
              This enables the green WhatsApp button on your Facebook Page header:
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleLinkWhatsAppToPage}
                disabled={linkingWhatsApp}
                style={{
                  background: "#16a34a",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {linkingWhatsApp ? "Connecting…" : "🔗 Link WhatsApp to Facebook Page"}
              </button>

              <a
                href={`https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
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
                Open Business Suite WhatsApp Settings ↗
              </a>
            </div>

            {linkResult && (
              <div style={{ marginTop: 10, background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 6, padding: 10, fontSize: 11 }}>
                <p style={{ margin: "0 0 6px", color: "#0f172a", lineHeight: 1.4 }}>{linkResult.message}</p>
                {linkResult.pageWhatsappSettingsUrl && (
                  <a
                    href={linkResult.pageWhatsappSettingsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#1877F2", fontWeight: 700, textDecoration: "underline" }}
                  >
                    Open Page WhatsApp Connection Settings ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION 3: PRODUCTION UPGRADE ENGINE (METHOD A & B DUAL TABS)  */}
      {/* ============================================================== */}
      <ProductionUpgradeManager />
    </div>
  )
}

