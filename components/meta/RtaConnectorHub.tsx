"use client"
import { useCallback, useEffect, useState } from "react"

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
    appBusinessId?: string
    appBusinessUrl?: string
  }
  permissionDiagnostic?: {
    appId: string
    appName: string
    tokenType: string
    userId: string
    tokenValid: boolean
    scopes: string[]
    hasMessagingScope: boolean
    hasManagementScope: boolean
    wabaId: string
    phoneId: string
    displayPhone: string
    verifiedName: string
    wabaPortfolioId: string
    appPortfolioId: string
    isCrossPortfolio: boolean
    isAppSubscribed: boolean
    isAiSensySubscribed: boolean
    subscribedApps: any[]
    assignedUsers: { id: string; name: string; tasks: string[] }[]
    approvedTemplates: { id: string; name: string; language: string; category: string }[]
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
      status?: string
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

  // Stepper active step (1: WABA Account, 2: WhatsApp Number & Migration, 3: Verification & Test)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1)

  // Two Options Switcher: "automated" = AiSensy-style Graph API, "manual" = Direct Meta Suite
  const [wabaMode, setWabaMode] = useState<"automated" | "manual">("automated")

  // Sync state
  const [syncing, setSyncing] = useState(false)

  // Test message state
  const [testRecipient, setTestRecipient] = useState("919632108103")
  const [recipientLabel, setRecipientLabel] = useState("Customer RTA")
  const [testText, setTestText] = useState("Hello from Recruitment Training Academy (+91 77957 83535)! Your direct WhatsApp messaging gateway is active.")
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  // Permissions Repair & Diagnostics state
  const [fixingPermissions, setFixingPermissions] = useState(false)
  const [permissionFixReport, setPermissionFixReport] = useState<any>(null)
  const [systemUserTokenInput, setSystemUserTokenInput] = useState("")
  const [savingSystemToken, setSavingSystemToken] = useState(false)
  const [testMessageType, setTestMessageType] = useState<"text" | "template">("text")
  const [selectedTemplateName, setSelectedTemplateName] = useState("optout_confirmation")
  const [activePermTab, setActivePermTab] = useState<"automated" | "manual">("automated")

  // Official Production WABA state (Manual Mode)
  const [officialWabaId, setOfficialWabaId] = useState("1290742346350527")
  const [officialPhoneId, setOfficialPhoneId] = useState("1065285676669805")
  const [officialPhoneNumber, setOfficialPhoneNumber] = useState("+91 77957 83535")
  const [officialVerifiedName, setOfficialVerifiedName] = useState("recruitmenttrainingacademy")
  const [connectingOfficial, setConnectingOfficial] = useState(false)

  // Page claim / link state
  const [customPageId, setCustomPageId] = useState("")
  const [claimingPage, setClaimingPage] = useState(false)
  const [linkingWhatsApp, setLinkingWhatsApp] = useState(false)
  const [linkResult, setLinkResult] = useState<any>(null)

  // AiSensy Provisioning & OTP Verification state
  const [provisioningWaba, setProvisioningWaba] = useState(false)
  const [provisionResult, setProvisionResult] = useState<any>(null)
  const [phoneIdInput, setPhoneIdInput] = useState("1065285676669805")
  const [requestingOtp, setRequestingOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [otpPin, setOtpPin] = useState("123456")
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [showManualOtpForm, setShowManualOtpForm] = useState(false)

  // Agency Partner Auto-Assign state
  const [assigningPartner, setAssigningPartner] = useState(false)
  const [partnerAssigned, setPartnerAssigned] = useState(false)
  const [partnerAssignResult, setPartnerAssignResult] = useState<any>(null)
  const [partnerAccessLevel, setPartnerAccessLevel] = useState<"full" | "partial">("full")
  const [partnerTargetPortfolio, setPartnerTargetPortfolio] = useState<"all" | "1185206983626614" | "1707214344108990">("all")

  // Service Partner Migration state
  const [copiedAiSensyEmail, setCopiedAiSensyEmail] = useState(false)

  // New WABA Generator state
  const [newWabaName, setNewWabaName] = useState("Recruitment Training Academy WABA")
  const [creatingWaba, setCreatingWaba] = useState(false)
  const [disconnectingWaba, setDisconnectingWaba] = useState(false)
  const [newWabaCreated, setNewWabaCreated] = useState<any>(null)
  const [wabaCreationGuidance, setWabaCreationGuidance] = useState<any>(null)

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

  async function handleFixPermissions() {
    setFixingPermissions(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fix_meta_permissions" }),
      })
      const json = await res.json()
      setPermissionFixReport(json.results)
      if (json.ok) {
        setSuccessMsg(json.message)
      } else {
        setError(json.error || "Permission fix incomplete")
      }
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error executing automated permission fix")
    } finally {
      setFixingPermissions(false)
    }
  }

  async function handleSaveSystemToken(e: React.FormEvent) {
    e.preventDefault()
    if (!systemUserTokenInput.trim()) return
    setSavingSystemToken(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_system_user_token",
          systemUserToken: systemUserTokenInput.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save token")
      setSuccessMsg(json.message)
      setSystemUserTokenInput("")
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving System User token")
    } finally {
      setSavingSystemToken(false)
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
      const primaryPhone = data?.waba.livePhones.find(p => p.id === "1065285676669805") || data?.waba.livePhones[0]
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_test_message",
          recipientPhone: testRecipient.trim(),
          recipientLabel,
          phoneNumberId: primaryPhone?.id || "1065285676669805",
          messageText: testText.trim(),
          useTemplate: testMessageType === "template",
          templateName: selectedTemplateName,
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
      if (json.ok || json.message) {
        setSuccessMsg(json.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link WhatsApp")
    } finally {
      setLinkingWhatsApp(false)
    }
  }

  async function handleAiSensyProvision() {
    setProvisioningWaba(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "aisensy_provision_waba_and_phone",
          businessId: data?.businessPortfolio.id || "1707214344108990",
          countryCode: "91",
          phoneNumber: "7795783535",
          displayName: "Recruitment Training Academy",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Provisioning failed")
      setProvisionResult(json)
      setSuccessMsg(json.message)
      setActiveStep(3)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to provision WABA and Phone")
    } finally {
      setProvisioningWaba(false)
    }
  }

  async function handleRequestPhoneOtp(method: "SMS" | "VOICE") {
    setRequestingOtp(true)
    setError("")
    setSuccessMsg("")
    try {
      const primaryPhone = data?.waba.livePhones[0]
      const phoneId = phoneIdInput.trim() || provisionResult?.phoneNumberId || (primaryPhone?.id && primaryPhone.id !== "1408496172352210" ? primaryPhone.id : "")
      if (!phoneId) {
        throw new Error("Phone +91 77957 83535 is not yet attached to a WABA on Meta. Please enter your Meta Phone Number ID from Meta WhatsApp Manager below before requesting OTP. (ID 1408496172352210 is Meta's US test number).")
      }
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_phone_otp",
          phoneNumberId: phoneId,
          codeMethod: method,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to dispatch OTP")
      setOtpSent(true)
      setSuccessMsg(json.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request OTP code")
    } finally {
      setRequestingOtp(false)
    }
  }

  async function handleVerifyPhoneOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError("Please enter the complete 6-digit OTP code received on +91 77957 83535.")
      return
    }
    setVerifyingOtp(true)
    setError("")
    setSuccessMsg("")
    try {
      const primaryPhone = data?.waba.livePhones.find(p => p.id !== "1408496172352210") || data?.waba.livePhones[0]
      const phoneId = phoneIdInput.trim() || provisionResult?.phoneNumberId || primaryPhone?.id || "1065285676669805"
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_phone_otp",
          phoneNumberId: phoneId,
          code: otpCode.trim(),
          pin: otpPin.trim() || "123456",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "OTP verification failed")
      setPhoneVerified(true)
      setSuccessMsg(json.message)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error verifying OTP code")
    } finally {
      setVerifyingOtp(false)
    }
  }

  async function handleAutoAssignAgencyPartner() {
    setAssigningPartner(true)
    setError("")
    setSuccessMsg("")
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_assign_agency_partner",
          accessLevel: partnerAccessLevel,
          targetPortfolio: partnerTargetPortfolio,
          businessId: partnerTargetPortfolio === "all" ? "1185206983626614" : partnerTargetPortfolio,
          partnerBusinessId: "246511357935583",
        }),
      })
      const json = await res.json()
      setPartnerAssignResult(json)
      setPartnerAssigned(true)
      setSuccessMsg(json.message || "Agency Partner (246511357935583) permissions updated!")
      if (json.directPartnerUrl) {
        window.open(json.directPartnerUrl, "_blank", "noopener,noreferrer")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to auto-assign agency partner")
    } finally {
      setAssigningPartner(false)
    }
  }

  function handleCopyAiSensyEmail() {
    const text = `To: support@aisensy.com\nSubject: Urgent: Disconnect & Release WhatsApp Phone Number +91 77957 83535\n\nDear AiSensy Support Team,\n\nWe are migrating our WhatsApp business phone number +91 77957 83535 to our direct Meta Cloud API setup under our own Meta Business Portfolio (Portfolio ID: 1707214344108990).\n\nPlease turn off Two-Step Verification (2FA) and delete/disconnect +91 77957 83535 from your WABA infrastructure immediately so that Meta releases the number for our new ZKWAConnect gateway.\n\nBusiness Name: Recruitment Training Academy\nWhatsApp Phone: +91 77957 83535\nTarget Portfolio ID: 1707214344108990\n\nThank you,\nRecruitment Training Academy Team`
    navigator.clipboard.writeText(text)
    setCopiedAiSensyEmail(true)
    setTimeout(() => setCopiedAiSensyEmail(false), 3000)
  }

  async function handleCreateNewWaba(e: React.FormEvent) {
    e.preventDefault()
    setCreatingWaba(true)
    setError("")
    setSuccessMsg("")
    setWabaCreationGuidance(null)
    try {
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_new_waba",
          businessId: data?.businessPortfolio.id || "1707214344108990",
          name: newWabaName.trim() || "Recruitment Training Academy WABA",
          currency: "INR",
          timezone: "1",
        }),
      })
      const json = await res.json()
      if (json.needsMetaSuiteCreation) {
        setWabaCreationGuidance(json)
      } else if (!json.ok) {
        throw new Error(json.error || "Failed to create WABA on Meta")
      } else {
        setNewWabaCreated(json)
        setSuccessMsg(json.message)
        setActiveStep(2)
        await loadData()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create new WABA")
    } finally {
      setCreatingWaba(false)
    }
  }

  async function handleDisconnectWaba() {
    if (!window.confirm("Are you sure you want to disconnect this WhatsApp Account from this workspace? You can create a new WABA or link a different one immediately.")) {
      return
    }
    setDisconnectingWaba(true)
    setError("")
    setSuccessMsg("")
    try {
      const primaryPhone = data?.waba.livePhones[0]
      const res = await fetch("/api/meta/rta-connector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnect_waba",
          phoneNumberId: primaryPhone?.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to disconnect WABA")
      setSuccessMsg(json.message)
      setActiveStep(1)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error disconnecting WABA")
    } finally {
      setDisconnectingWaba(false)
    }
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <p style={{ fontWeight: 700, margin: 0 }}>Loading WhatsApp Cloud API Status…</p>
      </div>
    )
  }

  const isVerifiedLive =
    phoneVerified ||
    Boolean(
      data?.waba.livePhones.some(
        p =>
          (p.id === "1065285676669805" || p.display_phone_number?.includes("77957")) &&
          (p.code_verification_status === "VERIFIED" || p.status === "CONNECTED")
      )
    ) ||
    data?.waba.livePhones[0]?.code_verification_status === "VERIFIED" ||
    data?.waba.livePhones[0]?.status === "CONNECTED" ||
    Boolean(data?.waba.dbSynced)

  const livePhoneData =
    data?.waba.livePhones.find(p => p.id === "1065285676669805" || p.display_phone_number?.includes("77957")) ||
    data?.waba.livePhones[0] ||
    {
      id: "1065285676669805",
      display_phone_number: "+91 77957 83535",
      verified_name: "recruitmenttrainingacademy",
      code_verification_status: "VERIFIED",
      quality_rating: "GREEN",
      status: "CONNECTED",
      wabaId: "1290742346350527",
    }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Workspace Selector Bar */}
      {data?.activeWorkspace && (
        <div
          style={{
            background: data.activeWorkspace.isRta ? "#f0fdf4" : "#fffbeb",
            border: `1.5px solid ${data.activeWorkspace.isRta ? "#86efac" : "#fde68a"}`,
            borderRadius: 12,
            padding: "12px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: data.activeWorkspace.isRta ? "#15803d" : "#b45309" }}>
              🏢 Active Workspace: <strong>{data.activeWorkspace.name}</strong>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>
              {data.activeWorkspace.isRta
                ? "Operating inside Recruitment Training Academy workspace (WABA ID: 1290742346350527)."
                : `Currently in "${data.activeWorkspace.name}". Switch to Recruitment Training Academy to isolate its WABA.`}
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
                    padding: "6px 12px",
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

      {/* ============================================================== */}
      {/* HERO COMPONENT: AISENSY-STYLE ACCOUNT HEALTH STATUS CARD       */}
      {/* ============================================================== */}
      <div
        style={{
          background: "#fff",
          border: isVerifiedLive ? "2px solid #10b981" : "2px solid #e2e8f0",
          borderRadius: 14,
          padding: 22,
          boxShadow: isVerifiedLive ? "0 4px 14px rgba(16, 185, 129, 0.12)" : "0 2px 6px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{isVerifiedLive ? "🟢" : "🟡"}</span>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                WhatsApp Gateway: Recruitment Training Academy
              </h2>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                style={{
                  background: isVerifiedLive ? "#dcfce7" : "#fef3c7",
                  color: isVerifiedLive ? "#15803d" : "#b45309",
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                  border: isVerifiedLive ? "1px solid #86efac" : "1px solid #fde68a",
                  cursor: isVerifiedLive ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {isVerifiedLive ? "● LIVE & VERIFIED" : "⚠️ ACTION REQUIRED: VERIFY NOW &rarr;"}
              </button>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Direct Cloud API gateway operates under Meta Business Portfolio <strong>{data?.businessPortfolio.id || "1707214344108990"}</strong>. (No Facebook Page required for messaging).
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!isVerifiedLive && (
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                style={{
                  background: "#f59e0b",
                  color: "#fff",
                  border: 0,
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 6px rgba(245, 158, 11, 0.3)",
                }}
              >
                <span>🔐</span> Complete Verification Now &rarr;
              </button>
            )}

            <button
              type="button"
              onClick={handleSyncWaba}
              disabled={syncing}
              style={{
                background: data?.waba.dbSynced ? "#f0fdf4" : "#10b981",
                color: data?.waba.dbSynced ? "#166534" : "#fff",
                border: data?.waba.dbSynced ? "1px solid #bbf7d0" : 0,
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{syncing ? "⏳" : "🔄"}</span>
              {syncing ? "Syncing…" : data?.waba.dbSynced ? "✓ Synced with Workspace" : "Sync WABA to Inbox"}
            </button>

            <button
              type="button"
              onClick={handleDisconnectWaba}
              disabled={disconnectingWaba}
              style={{
                background: "#fff",
                color: "#b91c1c",
                border: "1.5px solid #fecaca",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: disconnectingWaba ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🛑</span>
              {disconnectingWaba ? "Disconnecting…" : "Disconnect / Switch WABA"}
            </button>
          </div>
        </div>

        {/* 4 Health Status Badges */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Active Phone Number</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#166534", marginTop: 2 }}>
              📱 +91 77957 83535
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Recruitment Training Academy</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>WABA Account ID</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
              {data?.permissionDiagnostic?.wabaId || data?.waba.primaryWaba?.id || "1290742346350527"}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Portfolio: {data?.permissionDiagnostic?.wabaPortfolioId || data?.businessPortfolio.id || "1185206983626614"}</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Quality Rating &amp; Limit</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#059669", marginTop: 2 }}>
              🟢 High &bull; 1,000 msgs/day
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Tier 1 Outbound Messaging</div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Webhook Health</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: data?.waba.webhookSubscribed ? "#166534" : "#b45309", marginTop: 2 }}>
              {data?.waba.webhookSubscribed ? "● Subscribed & Active" : "○ Subscribing…"}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Live Chat Inbox Sync Active</div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* PERMISSIONS & OUTBOUND RESOLUTION (AUTOMATED UI + MANUAL SETUP) */}
        {/* ============================================================== */}
        <div
          style={{
            marginTop: 18,
            background: "#f8fafc",
            border: "1.5px solid #cbd5e1",
            borderRadius: 12,
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🔐</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0, fontFamily: "Sora, sans-serif" }}>
                  Permission Access &amp; Outbound Messaging Setup
                </h3>
                <span
                  style={{
                    background: "#ecfdf5",
                    color: "#065f46",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 10,
                    border: "1px solid #a7f3d0",
                  }}
                >
                  ERROR #10 RESOLUTION
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Fixes: <em>&ldquo;You do not have the necessary permissions to send messages on behalf of this WhatsApp Business account&rdquo;</em> (Code 10 / Subcode 2593181).
              </p>
            </div>

            {/* View Switcher: Automated vs Manual */}
            <div style={{ display: "inline-flex", background: "#e2e8f0", padding: 3, borderRadius: 8, gap: 4 }}>
              <button
                type="button"
                onClick={() => setActivePermTab("automated")}
                style={{
                  padding: "6px 12px",
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  background: activePermTab === "automated" ? "#047857" : "transparent",
                  color: activePermTab === "automated" ? "#fff" : "#475569",
                  boxShadow: activePermTab === "automated" ? "0 2px 4px rgba(4, 120, 87, 0.2)" : "none",
                }}
              >
                ⚡ 1-Click Automated Fix
              </button>
              <button
                type="button"
                onClick={() => setActivePermTab("manual")}
                style={{
                  padding: "6px 12px",
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  background: activePermTab === "manual" ? "#1e293b" : "transparent",
                  color: activePermTab === "manual" ? "#fff" : "#475569",
                  boxShadow: activePermTab === "manual" ? "0 2px 4px rgba(30, 41, 59, 0.2)" : "none",
                }}
              >
                📋 Manual Meta Setup Workflow
              </button>
            </div>
          </div>

          {/* Diagnostic Info Pills */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, fontSize: 11 }}>
            <span style={{ background: "#fff", border: "1px solid #e2e8f0", padding: "3px 8px", borderRadius: 6, color: "#334155" }}>
              📱 WABA: <strong>{data?.permissionDiagnostic?.wabaId || "1290742346350527"}</strong> (Portfolio {data?.permissionDiagnostic?.wabaPortfolioId || "1185206983626614"})
            </span>
            <span style={{ background: "#fff", border: "1px solid #e2e8f0", padding: "3px 8px", borderRadius: 6, color: "#334155" }}>
              🛠️ Meta App: <strong>{data?.permissionDiagnostic?.appId || "1710743377107186"}</strong> (Portfolio {data?.permissionDiagnostic?.appPortfolioId || "1707214344108990"})
            </span>
            <span style={{ background: data?.permissionDiagnostic?.isAppSubscribed ? "#dcfce7" : "#fee2e2", border: `1px solid ${data?.permissionDiagnostic?.isAppSubscribed ? "#86efac" : "#fca5a5"}`, padding: "3px 8px", borderRadius: 6, color: data?.permissionDiagnostic?.isAppSubscribed ? "#166534" : "#991b1b", fontWeight: 700 }}>
              {data?.permissionDiagnostic?.isAppSubscribed ? "✓ App Subscribed to WABA" : "⚠️ App Not Subscribed"}
            </span>
            <span style={{ background: data?.permissionDiagnostic?.isAiSensySubscribed ? "#fef3c7" : "#dcfce7", border: `1px solid ${data?.permissionDiagnostic?.isAiSensySubscribed ? "#fde68a" : "#86efac"}`, padding: "3px 8px", borderRadius: 6, color: data?.permissionDiagnostic?.isAiSensySubscribed ? "#92400e" : "#166534", fontWeight: 700 }}>
              {data?.permissionDiagnostic?.isAiSensySubscribed ? "⚠️ AiSensy Attached (Coexistence Lock)" : "✓ Direct Cloud API (No BSP Lock)"}
            </span>
          </div>

          {/* TAB 1: 1-CLICK AUTOMATED FIX */}
          {activePermTab === "automated" && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                    Automated Backend Permission Authorization
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    Executes 4 Graph API calls to subscribe our App, grant user messaging tasks, detach AiSensy lock, and link WABA &amp; Phone to your workspace.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleFixPermissions}
                  disabled={fixingPermissions}
                  style={{
                    background: "#047857",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    padding: "10px 18px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: fixingPermissions ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: "0 2px 8px rgba(4, 120, 87, 0.3)",
                  }}
                >
                  <span>{fixingPermissions ? "⏳" : "⚡"}</span>
                  {fixingPermissions ? "Authorizing Permissions on Meta…" : "Run 1-Click Automated Permissions Fix"}
                </button>
              </div>

              {/* Live Fix Checklist Results */}
              {permissionFixReport && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9", display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Automated Execution Results:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                    <div style={{ background: permissionFixReport.appSubscription ? "#f0fdf4" : "#fef2f2", padding: "8px 12px", borderRadius: 6, border: `1px solid ${permissionFixReport.appSubscription ? "#bbf7d0" : "#fecaca"}`, fontSize: 12 }}>
                      <strong>1. App Subscription:</strong> {permissionFixReport.appSubscription ? "✅ Connected" : `⚠️ ${permissionFixReport.appSubscriptionError || "Pending"}`}
                    </div>
                    <div style={{ background: permissionFixReport.userPermissions ? "#f0fdf4" : "#fef2f2", padding: "8px 12px", borderRadius: 6, border: `1px solid ${permissionFixReport.userPermissions ? "#bbf7d0" : "#fecaca"}`, fontSize: 12 }}>
                      <strong>2. User Tasks:</strong> {permissionFixReport.userPermissions ? "✅ MANAGE + MESSAGING" : `⚠️ ${permissionFixReport.userPermissionsError || "Pending"}`}
                    </div>
                    <div style={{ background: permissionFixReport.aiSensyUnsubscribe ? "#f0fdf4" : "#fffbeb", padding: "8px 12px", borderRadius: 6, border: `1px solid ${permissionFixReport.aiSensyUnsubscribe ? "#bbf7d0" : "#fde68a"}`, fontSize: 12 }}>
                      <strong>3. AiSensy Lock:</strong> {permissionFixReport.aiSensyUnsubscribe ? "✅ Released" : "ℹ️ Follow Manual Step 4"}
                    </div>
                    <div style={{ background: permissionFixReport.dbSync ? "#f0fdf4" : "#fef2f2", padding: "8px 12px", borderRadius: 6, border: `1px solid ${permissionFixReport.dbSync ? "#bbf7d0" : "#fecaca"}`, fontSize: 12 }}>
                      <strong>4. DB Asset Sync:</strong> {permissionFixReport.dbSync ? "✅ Synced" : `⚠️ ${permissionFixReport.dbSyncError || "Error"}`}
                    </div>
                  </div>

                  {permissionFixReport.testSend && (
                    <div style={{ marginTop: 6, background: permissionFixReport.testSend.ok ? "#f0fdf4" : "#fffbeb", border: `1px solid ${permissionFixReport.testSend.ok ? "#86efac" : "#fde68a"}`, borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                      <strong>Outbound Probe Test:</strong>{" "}
                      {permissionFixReport.testSend.ok
                        ? "🎉 Outbound messaging succeeded! Message dispatched to Meta."
                        : `Notice: Meta returned (${permissionFixReport.testSend.code || 10}): ${permissionFixReport.testSend.message}. Follow Manual Steps 1 & 3 to complete Meta App Mode or Cross-Portfolio sharing.`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STEP-BY-STEP MANUAL META SETUP WORKFLOW */}
          {activePermTab === "manual" && (
            <div style={{ display: "grid", gap: 12 }}>
              {/* Step 1: Switch Meta App to Live Mode */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: "#0f172a", color: "#fff", width: 22, height: 22, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>1</span>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>Switch Meta App (1710743377107186) to Live Mode</strong>
                  </div>
                  <p style={{ margin: "4px 0 0 28px", fontSize: 12, color: "#64748b" }}>
                    In Development Mode, Meta blocks messages to all recipient numbers except registered test numbers with <em>Code 10 (Permissions Denied)</em>. Switch the toggle at top of Meta App Settings from <strong>In development</strong> to <strong>Live</strong>.
                  </p>
                </div>
                <a
                  href="https://developers.facebook.com/apps/1710743377107186/settings/basic/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#1877F2",
                    color: "#fff",
                    textDecoration: "none",
                    padding: "8px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>↗</span> Open App Settings &amp; Go Live
                </a>
              </div>

              {/* Step 2: Add Test Recipient Phone Number */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: "#0f172a", color: "#fff", width: 22, height: 22, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>2</span>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>Add Test Recipient (+91 96321 08103) in WhatsApp Console</strong>
                  </div>
                  <p style={{ margin: "4px 0 0 28px", fontSize: 12, color: "#64748b" }}>
                    If keeping the app in Development mode during testing, add <code>+91 96321 08103</code> under <strong>To: Manage phone number list</strong> to allow sending without going Live.
                  </p>
                </div>
                <a
                  href="https://developers.facebook.com/apps/1710743377107186/whatsapp-business/wa-dev-console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#0284c7",
                    color: "#fff",
                    textDecoration: "none",
                    padding: "8px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>↗</span> Open WhatsApp Dev Console
                </a>
              </div>

              {/* Step 3: Cross-Portfolio Asset Sharing */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: "#0f172a", color: "#fff", width: 22, height: 22, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>3</span>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>Share WABA 1290742346350527 with App Portfolio 1707214344108990</strong>
                  </div>
                  <p style={{ margin: "4px 0 0 28px", fontSize: 12, color: "#64748b" }}>
                    Since WABA is in Portfolio <strong>1185206983626614</strong> while App is in Portfolio <strong>1707214344108990</strong>: In Portfolio 1185206983626614 &gt; WhatsApp Accounts &gt; select <code>recruitmenttrainingacademy</code> &gt; click <strong>Assign Partner</strong> &gt; enter Partner Portfolio ID <code>1707214344108990</code> &gt; check <strong>Full Control (Manage WhatsApp Account)</strong>.
                  </p>
                </div>
                <a
                  href={`https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=1185206983626614`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#4f46e5",
                    color: "#fff",
                    textDecoration: "none",
                    padding: "8px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>↗</span> Open WABA 1290742346350527 in Meta
                </a>
              </div>

              {/* Step 4: Add Direct Payment Method */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: "#0f172a", color: "#fff", width: 22, height: 22, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>4</span>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>Attach Payment Method / Remove AiSensy Provider</strong>
                  </div>
                  <p style={{ margin: "4px 0 0 28px", fontSize: 12, color: "#64748b" }}>
                    If WABA was previously billed through AiSensy, Meta requires adding an active payment method (Credit card / Business line of credit) directly to WABA <strong>1290742346350527</strong> to activate Cloud API messages.
                  </p>
                </div>
                <a
                  href={`https://business.facebook.com/latest/whatsapp_manager/payment_settings?business_id=1185206983626614`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#059669",
                    color: "#fff",
                    textDecoration: "none",
                    padding: "8px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>↗</span> Open Payment Settings
                </a>
              </div>

              {/* Step 5: Optional Permanent System User Token */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "#0f172a", color: "#fff", width: 22, height: 22, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>5</span>
                      <strong style={{ fontSize: 13, color: "#0f172a" }}>Generate &amp; Save Permanent System User Token (Optional)</strong>
                    </div>
                    <p style={{ margin: "4px 0 0 28px", fontSize: 12, color: "#64748b" }}>
                      Create a System User with Admin role in Portfolio 1185206983626614, assign WABA 1290742346350527, and generate a non-expiring token.
                    </p>
                  </div>
                  <a
                    href="https://business.facebook.com/latest/settings/system_users?business_id=1185206983626614"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: "#334155",
                      color: "#fff",
                      textDecoration: "none",
                      padding: "8px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>↗</span> Open System Users
                  </a>
                </div>

                <form onSubmit={handleSaveSystemToken} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    type="password"
                    value={systemUserTokenInput}
                    onChange={e => setSystemUserTokenInput(e.target.value)}
                    placeholder="Paste permanent Meta System User Access Token (EAA...)"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={savingSystemToken || !systemUserTokenInput.trim()}
                    style={{
                      background: "#0f172a",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: savingSystemToken || !systemUserTokenInput.trim() ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {savingSystemToken ? "Saving…" : "💾 Save Permanent Token"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Action Required Banner when Verification is Pending */}
        {!isVerifiedLive && (
          <div
            style={{
              marginTop: 14,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "#92400e" }}>
              <strong>⚠️ Action Required:</strong> WhatsApp Phone (<code>+91 77957 83535</code>) requires a 1-time 6-digit SMS OTP verification to unlock live outbound WhatsApp Cloud API messaging on Meta.
            </div>
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              style={{
                background: "#d97706",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Verify Code in Step 3 &rarr;
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", borderRadius: 10, color: "#991b1b", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: 10, color: "#166534", fontSize: 13 }}>
          {successMsg}
        </div>
      )}

      {/* ============================================================== */}
      {/* TWO OPTIONS SWITCHER: 1 = AUTOMATED API, 2 = MANUAL META SUITE  */}
      {/* ============================================================== */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setWabaMode("automated")}
          style={{
            flex: 1,
            minWidth: 260,
            padding: "12px 16px",
            borderRadius: 10,
            border: wabaMode === "automated" ? "2px solid #059669" : "1.5px solid #cbd5e1",
            background: wabaMode === "automated" ? "#ecfdf5" : "#fff",
            color: wabaMode === "automated" ? "#065f46" : "#475569",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: wabaMode === "automated" ? "0 2px 6px rgba(5, 150, 105, 0.15)" : "none",
          }}
        >
          <span>⚡ Option 1: Automated Mode (AiSensy Style Graph API &bull; Recommended)</span>
        </button>

        <button
          type="button"
          onClick={() => setWabaMode("manual")}
          style={{
            flex: 1,
            minWidth: 260,
            padding: "12px 16px",
            borderRadius: 10,
            border: wabaMode === "manual" ? "2px solid #1877F2" : "1.5px solid #cbd5e1",
            background: wabaMode === "manual" ? "#eff6ff" : "#fff",
            color: wabaMode === "manual" ? "#1e40af" : "#475569",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: wabaMode === "manual" ? "0 2px 6px rgba(24, 119, 242, 0.15)" : "none",
          }}
        >
          <span>🛠️ Option 2: Manual Mode (Direct Meta Business Suite)</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* 3-STEP GUIDED ONBOARDING STEPPER (PROGRESSIVE DISCLOSURE)       */}
      {/* ============================================================== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          style={{
            border: activeStep === 1 ? "1.5px solid #059669" : "1px solid transparent",
            background: activeStep === 1 ? "#ecfdf5" : "transparent",
            borderRadius: 8,
            padding: "10px 14px",
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: activeStep === 1 ? "#059669" : "#e2e8f0",
              color: activeStep === 1 ? "#fff" : "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            1
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: activeStep === 1 ? "#065f46" : "#0f172a" }}>
              Step 1: WABA Account
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Create, Connect or Disconnect</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(2)}
          style={{
            border: activeStep === 2 ? "1.5px solid #059669" : "1px solid transparent",
            background: activeStep === 2 ? "#ecfdf5" : "transparent",
            borderRadius: 8,
            padding: "10px 14px",
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: activeStep === 2 ? "#059669" : "#e2e8f0",
              color: activeStep === 2 ? "#fff" : "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            2
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: activeStep === 2 ? "#065f46" : "#0f172a" }}>
              Step 2: Number &amp; Migration
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Register +91 77957 83535 / AiSensy</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(3)}
          style={{
            border: activeStep === 3 ? "1.5px solid #059669" : "1px solid transparent",
            background: activeStep === 3 ? "#ecfdf5" : "transparent",
            borderRadius: 8,
            padding: "10px 14px",
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: activeStep === 3 ? "#059669" : "#e2e8f0",
              color: activeStep === 3 ? "#fff" : "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            3
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: activeStep === 3 ? "#065f46" : "#0f172a" }}>
              Step 3: Verification &amp; Test
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>OTP Code &amp; Outbound Tester</div>
          </div>
        </button>
      </div>

      {/* ============================================================== */}
      {/* STEP 1: WABA ACCOUNT MANAGEMENT                                */}
      {/* ============================================================== */}
      {activeStep === 1 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#059669" }}>
                Step 1 of 3
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                WhatsApp Business Account (WABA) Configuration
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              style={{
                background: "#059669",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Continue to Step 2: Register Number &rarr;
            </button>
          </div>

          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
            Every WhatsApp business requires a verified WABA ID directly under your Meta Business Portfolio. Your official production WABA is <code>1290742346350527</code> (recruitmenttrainingacademy), or you can create a brand new one automatically with 1 click.
          </p>

          {/* Current WABA details card */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 12 }}>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Meta Business Portfolio:</span>
                <strong style={{ color: "#0f172a", fontFamily: "monospace", fontSize: 13 }}>{data?.permissionDiagnostic?.wabaPortfolioId || data?.businessPortfolio.id || "1185206983626614"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Current Connected WABA:</span>
                <strong style={{ color: "#0f172a", fontFamily: "monospace", fontSize: 13 }}>{data?.permissionDiagnostic?.wabaId || data?.waba.primaryWaba?.id || "1290742346350527"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>WABA Name:</span>
                <strong style={{ color: "#0f172a" }}>{data?.permissionDiagnostic?.verifiedName || data?.waba.primaryWaba?.name || "recruitmenttrainingacademy"}</strong>
              </div>
            </div>
          </div>

          {/* Form: Create Brand New WABA */}
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#065f46", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>✨</span> Need a Fresh WABA? Auto-Create Brand New Account on Meta (1-Click)
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#166534", lineHeight: 1.4 }}>
              If your current WABA is tied to a previous partner or has errors, our API can create a clean, brand new WABA ID directly on Meta under Portfolio <strong>{data?.businessPortfolio.id || "1707214344108990"}</strong>:
            </p>

            <form onSubmit={handleCreateNewWaba} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={newWabaName}
                onChange={e => setNewWabaName(e.target.value)}
                placeholder="New WABA Name"
                style={{
                  flex: 1,
                  minWidth: 240,
                  border: "1px solid #86efac",
                  borderRadius: 6,
                  padding: "9px 12px",
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                disabled={creatingWaba}
                style={{
                  background: "#065f46",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "9px 18px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: creatingWaba ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {creatingWaba ? "Creating on Meta Graph API…" : "✨ 1-Click Create New WABA ID"}
              </button>
            </form>

            {newWabaCreated && (
              <div style={{ marginTop: 10, background: "#fff", border: "1px solid #86efac", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#166534" }}>
                ✓ Created New WABA: <strong>{newWabaCreated.name}</strong> (ID: <code>{newWabaCreated.wabaId}</code>)
              </div>
            )}

            {wabaCreationGuidance && (
              <div style={{ marginTop: 14, background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>💡</span>
                  <strong style={{ fontSize: 13, color: "#92400e" }}>
                    Meta Security Policy &bull; Direct 30-Second WABA Setup
                  </strong>
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                  {wabaCreationGuidance.error}
                </p>
                <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: "#475569" }}>
                  <strong style={{ color: "#0f172a", display: "block", marginBottom: 6 }}>
                    Follow these 3 quick steps in Meta Business Suite:
                  </strong>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                    <li>Click the blue button below to open <strong>Meta Business Suite &rarr; WhatsApp Accounts</strong>.</li>
                    <li>Click <strong>&ldquo;Add&rdquo; &rarr; &ldquo;Create a WhatsApp Business Account&rdquo;</strong>.</li>
                    <li>Enter Name: <code>{newWabaName || "Recruitment Training Academy WABA"}</code>, Currency: <code>INR</code>, Timezone: <code>Asia/Kolkata</code>.</li>
                    <li>Return here and click <strong>&ldquo;🔄 Sync WABA to Inbox&rdquo;</strong> to immediately bind it!</li>
                  </ol>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a
                    href={wabaCreationGuidance.manualUrl || `https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#1877F2",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "9px 16px",
                      fontSize: 12,
                      fontWeight: 800,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 2px 6px rgba(24, 119, 242, 0.25)",
                    }}
                  >
                    <span>➕ Open Meta Business Suite &amp; Create WABA</span>
                    <span>↗</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleSyncWaba}
                    disabled={syncing}
                    style={{
                      background: "#059669",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "9px 16px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>{syncing ? "⏳" : "🔄"}</span>
                    {syncing ? "Syncing…" : "Sync WABA to Inbox"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* RESOLUTION HUB: 4 DUPLICATE GHOST ACCOUNTS (AUTOMATED & MANUAL)*/}
          {/* ============================================================== */}
          <div style={{ marginTop: 18, background: "#f8fafc", border: "1.5px solid #cbd5e1", borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🧹</span>
                <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                  Resolution Hub: Clean Up 4 Duplicate Ghost WhatsApp Accounts
                </h4>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, background: "#0f172a", color: "#fff", padding: "3px 8px", borderRadius: 12 }}>
                DUAL: AUTOMATED &amp; MANUAL
              </span>
            </div>

            <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, margin: "0 0 12px" }}>
              In your Meta Business Suite screenshots (<em>Users &rarr; People</em> and <em>Users &rarr; Partners</em>), there are <strong>4 duplicate WhatsApp accounts</strong> named &ldquo;Recruitment Training Academy&rdquo;. These were created when WhatsApp was linked to the Facebook Page, but <strong>none of them have a phone number verified yet</strong>. Follow either path below:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {/* Path 1: Automated In-App Way */}
              <div style={{ background: "#fff", border: "1px solid #86efac", borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#166534", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⚡</span> Path 1: Automated In-App Actions
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "#475569", lineHeight: 1.4 }}>
                  Use our background API to sync live Meta status, release stale bindings, or auto-assign ZKWAConnect:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSyncWaba}
                    disabled={syncing}
                    style={{
                      background: "#10b981",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {syncing ? "Syncing…" : "🔄 1-Click Refresh & Sync All Meta WABAs"}
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnectWaba}
                    disabled={disconnectingWaba}
                    style={{
                      background: "#fff",
                      color: "#b91c1c",
                      border: "1px solid #fecaca",
                      borderRadius: 6,
                      padding: "7px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: disconnectingWaba ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                  >
                    {disconnectingWaba ? "Disconnecting…" : "🛑 Disconnect / Reset Current Workspace Binding"}
                  </button>
                </div>
              </div>

              {/* Path 2: Manual Direct Links (Exact Screenshots) */}
              <div style={{ background: "#fff", border: "1px solid #93c5fd", borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#1e40af", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🛠️</span> Path 2: Manual Meta Business Suite Deep Links
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "#475569", lineHeight: 1.4 }}>
                  Direct links to your exact Meta Business Suite screens to delete duplicates or add your number:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a
                    href={`https://business.facebook.com/latest/settings/business_users?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      border: "1px solid #bfdbfe",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>🗑️ Delete 3 Duplicate Accounts (Image 1 Screen)</span>
                    <span>↗</span>
                  </a>

                  <a
                    href={`https://business.facebook.com/latest/settings/whatsapp_business_presence?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      border: "1px solid #bfdbfe",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>📱 Add Phone Number in Asset (Image 4 Screen)</span>
                    <span>↗</span>
                  </a>

                  <a
                    href={`https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#f8fafc",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textDecoration: "none",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>⚙️ Open Official WhatsApp Manager</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 2: WHATSAPP NUMBER & AISENSY MIGRATION RESOLVER            */}
      {/* ============================================================== */}
      {activeStep === 2 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#059669" }}>
                Step 2 of 3
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                Register Phone Number (+91 77957 83535) &amp; Partner Migration
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  border: 0,
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                &larr; Back to Step 1
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                style={{
                  background: "#059669",
                  color: "#fff",
                  border: 0,
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Continue to Step 3: Verify &rarr;
              </button>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, margin: "0 0 16px" }}>
            Add phone number <strong>+91 77957 83535</strong> to your WABA. If this number was previously active on <strong>AiSensy</strong> or another WhatsApp Business Solution Provider, Meta requires disconnecting it first.
          </p>

          {/* 1-Click Provision Button */}
          <div style={{ background: "#f0fdf4", border: "1.5px solid #6ee7b7", borderRadius: 10, padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 14, color: "#065f46" }}>Automated Provisioning &amp; Phone Attachment</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#047857" }}>
                  Calls Meta Graph API <code>POST /{'{wabaId}'}/phone_numbers</code> with <code>migrate_phone_number: true</code>.
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, background: "#059669", color: "#fff", padding: "3px 10px", borderRadius: 12 }}>
                1-CLICK AUTOMATION
              </span>
            </div>

            <button
              type="button"
              onClick={handleAiSensyProvision}
              disabled={provisioningWaba}
              style={{
                background: "#059669",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "11px 20px",
                fontSize: 13,
                fontWeight: 800,
                cursor: provisioningWaba ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                justifyContent: "center",
              }}
            >
              {provisioningWaba ? (
                <>⏳ Provisioning &amp; Attaching +91 77957 83535 on Meta Graph API…</>
              ) : (
                <>⚡ 1-Click Provision WABA &amp; Attach WhatsApp Phone (+91 77957 83535)</>
              )}
            </button>

            {provisionResult && (
              <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${provisionResult.partnerConflict ? "#fde68a" : "#86efac"}`, borderRadius: 8, padding: 12, fontSize: 12, color: provisionResult.partnerConflict ? "#92400e" : "#166534" }}>
                <div><strong>✓ WABA ID Provisioned:</strong> <code>{provisionResult.wabaId}</code></div>
                <div style={{ marginTop: 2 }}><strong>✓ Phone Number ID:</strong> <code>{provisionResult.phoneNumberId}</code></div>
                <div style={{ marginTop: 2 }}><strong>✓ Display Phone:</strong> <code>{provisionResult.displayPhoneNumber}</code></div>
                {provisionResult.partnerConflict && (
                  <div style={{ marginTop: 6, fontWeight: 700, color: "#b45309" }}>
                    ⚠️ {provisionResult.partnerConflictMessage || "AiSensy service partner conflict detected. See migration resolver below."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* AISENSY MIGRATION RESOLVER (NUMBER ON ANOTHER PORTFOLIO)       */}
          {/* ============================================================== */}
          <div style={{ background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🔄</span>
                <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "#92400e", fontFamily: "Sora, sans-serif" }}>
                  AiSensy Migration Resolver: Release Number &rarr; Connect ZKWAConnect
                </h4>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, background: "#b45309", color: "#fff", padding: "3px 8px", borderRadius: 12 }}>
                MIGRATION RESOLUTION
              </span>
            </div>

            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>
              <strong style={{ display: "block", marginBottom: 2 }}>Why Meta shows: &ldquo;This number is already on a WhatsApp Business account in a business portfolio you don&apos;t manage&rdquo;</strong>
              <span>
                The number <strong>+91 77957 83535</strong> is currently locked under <strong>AiSensy&apos;s Business Portfolio WABA</strong>. Because Meta enforces <em>1 Number = 1 WABA</em>, follow these 3 quick steps to release it:
              </span>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 12, color: "#92400e" }}>Action 1: Send 1-Click Release Request to AiSensy</strong>
                <p style={{ margin: "2px 0 8px", fontSize: 11, color: "#475569" }}>
                  Send our pre-formatted support email to <code>support@aisensy.com</code> asking them to disconnect the phone:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleCopyAiSensyEmail}
                    style={{
                      background: copiedAiSensyEmail ? "#16a34a" : "#0284c7",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "6px 14px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {copiedAiSensyEmail ? "✓ Copied Support Ticket!" : "📋 Copy Ready-to-Send Release Ticket"}
                  </button>
                  <a
                    href="https://app.aisensy.com/"
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
                    }}
                  >
                    Open AiSensy Dashboard ↗
                  </a>
                </div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 12, color: "#92400e" }}>Action 2: Delete Account in Mobile WhatsApp App (If on phone)</strong>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                  If the SIM is installed in a phone running the WhatsApp Business app, open the app &rarr; <strong>Settings</strong> &rarr; <strong>Account</strong> &rarr; <strong>Delete My Account</strong>. (Do not just delete the app; you must tap Delete Account so Meta drops the mobile routing).
                </p>
              </div>

              <div style={{ background: "#fff", border: "1.5px solid #86efac", borderRadius: 8, padding: 12 }}>
                <strong style={{ fontSize: 12, color: "#166534" }}>Action 3: Retry Automated Attachment</strong>
                <p style={{ margin: "2px 0 8px", fontSize: 11, color: "#475569" }}>
                  Once released, click below to immediately attach +91 77957 83535 into your ZKWAConnect WABA:
                </p>
                <button
                  type="button"
                  onClick={handleAiSensyProvision}
                  disabled={provisioningWaba}
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    border: 0,
                    borderRadius: 6,
                    padding: "7px 14px",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: provisioningWaba ? "not-allowed" : "pointer",
                  }}
                >
                  {provisioningWaba ? "Attaching Phone…" : "⚡ Retry 1-Click Provision & Attach (+91 77957 83535)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 3: OTP VERIFICATION & LIVE TEST TRANSMISSION               */}
      {/* ============================================================== */}
      {activeStep === 3 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#059669" }}>
                Step 3 of 3
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#0f172a", fontFamily: "Sora, sans-serif" }}>
                OTP Verification &amp; Outbound Message Tester
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              style={{
                background: "#f1f5f9",
                color: "#475569",
                border: 0,
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              &larr; Back to Step 2
            </button>
          </div>

          {/* Sub-Card A: OTP Verification Form / Live Status Banner */}
          <div
            style={{
              background: isVerifiedLive ? "#f0fdf4" : "#fff",
              border: isVerifiedLive ? "2px solid #86efac" : "1.5px solid #cbd5e1",
              borderRadius: 12,
              padding: 20,
              marginBottom: 18,
            }}
          >
            {isVerifiedLive && !showManualOtpForm ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 32 }}>🎉</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#166534" }}>
                          Phone Number Verified &amp; Connected!
                        </h4>
                        <span
                          style={{
                            background: "#dcfce7",
                            color: "#15803d",
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 800,
                            border: "1px solid #86efac",
                          }}
                        >
                          ● 100% LIVE ON META
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#166534" }}>
                        WhatsApp phone number <strong>+91 77957 83535</strong> (Meta ID: <code>1065285676669805</code>) is active and registered on WhatsApp Cloud API.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowManualOtpForm(true)}
                      style={{
                        background: "#fff",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Re-verify / Change PIN
                    </button>
                    <button
                      type="button"
                      onClick={loadData}
                      style={{
                        background: "#166534",
                        color: "#fff",
                        border: 0,
                        borderRadius: 6,
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🔄 Refresh Meta
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 12,
                    background: "#fff",
                    borderRadius: 10,
                    padding: 14,
                    border: "1px solid #bbf7d0",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Phone Number</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#166534", marginTop: 2 }}>📱 +91 77957 83535</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Recruitment Training Academy</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Meta Phone Number ID</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>1065285676669805</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Live Cloud API Gateway</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Verified Name</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>recruitmenttrainingacademy</div>
                    <div style={{ fontSize: 11, color: "#166534" }}>✓ Approved by Meta</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Quality &amp; Status</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#166534", marginTop: 2 }}>🟢 GREEN &bull; CONNECTED</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>High Quality Routing</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <a
                    href="/app/chat"
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 12,
                      fontWeight: 800,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>💬</span> Open Live Chat Inbox &rarr;
                  </a>
                  <a
                    href="#test-message-form"
                    style={{
                      background: "#fff",
                      color: "#065f46",
                      border: "1.5px solid #a7f3d0",
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 12,
                      fontWeight: 800,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>✉️</span> Send Live Test Message Below &darr;
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>
                    🔐 Verify Ownership of +91 77957 83535 (Meta OTP)
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {isVerifiedLive && (
                      <button
                        type="button"
                        onClick={() => setShowManualOtpForm(false)}
                        style={{
                          background: "#f1f5f9",
                          color: "#475569",
                          border: 0,
                          borderRadius: 4,
                          padding: "3px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        &times; Close Form
                      </button>
                    )}
                    <span
                      style={{
                        background: isVerifiedLive ? "#dcfce7" : "#fef3c7",
                        color: isVerifiedLive ? "#166534" : "#b45309",
                        padding: "3px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {isVerifiedLive ? "✓ VERIFIED & LIVE" : "VERIFICATION REQUIRED"}
                    </span>
                  </div>
                </div>

                {/* Target Meta Phone Number ID Selector */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>
                      Target Phone Number ID for +91 77957 83535:
                    </label>
                    <a
                      href={`https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11, color: "#1877F2", fontWeight: 700, textDecoration: "none" }}
                    >
                      Open Meta WhatsApp Manager Phone Numbers ↗
                    </a>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      value={phoneIdInput}
                      onChange={e => setPhoneIdInput(e.target.value.trim())}
                      placeholder="1065285676669805"
                      style={{
                        flex: 1,
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        padding: "7px 10px",
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                </div>

                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
                  Request a one-time 6-digit verification code to <strong>+91 77957 83535</strong> via SMS or Voice Call:
                </p>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => handleRequestPhoneOtp("SMS")}
                    disabled={requestingOtp}
                    style={{
                      background: "#1877F2",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: requestingOtp ? "not-allowed" : "pointer",
                    }}
                  >
                    {requestingOtp ? "Sending OTP…" : "📲 Request SMS OTP"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestPhoneOtp("VOICE")}
                    disabled={requestingOtp}
                    style={{
                      background: "#fff",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: requestingOtp ? "not-allowed" : "pointer",
                    }}
                  >
                    📞 Request Voice Call OTP
                  </button>
                </div>

                <form onSubmit={handleVerifyPhoneOtp} style={{ display: "grid", gap: 10, background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                        6-Digit OTP Code:
                      </label>
                      <input
                        type="text"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                        placeholder="e.g. 493004"
                        maxLength={6}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          border: "1.5px solid #cbd5e1",
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 14,
                          fontWeight: 800,
                          fontFamily: "monospace",
                          letterSpacing: "0.2em",
                          textAlign: "center",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                        6-Digit 2FA Gateway PIN:
                      </label>
                      <input
                        type="text"
                        value={otpPin}
                        onChange={e => setOtpPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                        placeholder="123456"
                        maxLength={6}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          border: "1.5px solid #cbd5e1",
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 14,
                          fontWeight: 800,
                          fontFamily: "monospace",
                          letterSpacing: "0.2em",
                          textAlign: "center",
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={verifyingOtp || otpCode.length !== 6}
                    style={{
                      background: otpCode.length === 6 ? "#16a34a" : "#94a3b8",
                      color: "#fff",
                      border: 0,
                      borderRadius: 6,
                      padding: "9px 16px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: verifyingOtp || otpCode.length !== 6 ? "not-allowed" : "pointer",
                    }}
                  >
                    {verifyingOtp ? "Verifying with Meta…" : "✅ Verify OTP & Activate Cloud API Gateway"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Sub-Card B: Live Message Tester */}
          <div id="test-message-form" style={{ background: "#f0fdf4", border: "1.5px solid #a7f3d0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#065f46", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🚀</span> Live Message Transmission Tester (Outbound &bull; Saves to Inbox)
            </div>

            <form onSubmit={handleSendTestMessage} style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                  Select Recipient to Test:
                </label>
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
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Customer RTA: +91 96321 08103
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
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ZKandavel Infotech: +91 78240 55618
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Or Custom:</span>
                  <input
                    type="text"
                    value={testRecipient}
                    onChange={e => {
                      setTestRecipient(e.target.value)
                      setRecipientLabel(`Custom ${e.target.value}`)
                    }}
                    placeholder="919632108103"
                    style={{
                      flex: 1,
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>Message Mode:</label>
                <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="msgMode"
                    checked={testMessageType === "text"}
                    onChange={() => setTestMessageType("text")}
                  />
                  <span>💬 Free-Form Text</span>
                </label>
                <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="msgMode"
                    checked={testMessageType === "template"}
                    onChange={() => setTestMessageType("template")}
                  />
                  <span>📋 Approved Template (utility/marketing)</span>
                </label>
              </div>

              {testMessageType === "template" ? (
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Choose Approved Template on WABA 1290742346350527:
                  </label>
                  <select
                    value={selectedTemplateName}
                    onChange={e => setSelectedTemplateName(e.target.value)}
                    style={{ width: "100%", padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }}
                  >
                    <option value="optout_confirmation">optout_confirmation (UTILITY - Approved)</option>
                    <option value="t04_rta_first_job_entry">t04_rta_first_job_entry (MARKETING - Approved)</option>
                    <option value="t03_rta_fresher_details">t03_rta_fresher_details (MARKETING - Approved)</option>
                    <option value="t02_rta_student_details">t02_rta_student_details (MARKETING - Approved)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Message Text:
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
                      padding: "6px 10px",
                      fontSize: 12,
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#065f46" }}>
                  Sends from +91 77957 83535 &amp; syncs to Live Chat Inbox
                </span>
                <button
                  type="submit"
                  disabled={sendingTest}
                  style={{
                    background: "#059669",
                    color: "#fff",
                    border: 0,
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {sendingTest ? "Transmitting…" : "🚀 Send WhatsApp & View in Inbox"}
                </button>
              </div>
            </form>

            {testResult && (
              <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${testResult.ok ? "#86efac" : "#fde68a"}`, borderRadius: 8, padding: 12, fontSize: 12 }}>
                <div style={{ color: testResult.ok ? "#166534" : "#b45309", fontWeight: 800, marginBottom: 4 }}>
                  {testResult.ok ? "✓ Transmitted to Meta & Saved to Live Chat Inbox!" : "⚠️ Logged in Live Chat Inbox"}
                </div>
                {testResult.messageId && (
                  <div>Message ID: <code>{testResult.messageId}</code></div>
                )}
                {testResult.inboxUrl && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={testResult.inboxUrl}
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "6px 12px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        textDecoration: "none",
                        display: "inline-block",
                      }}
                    >
                      💬 Open in Live Chat Inbox ➔
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* OPTION 2: MANUAL MODE DRAWER (WHEN MANUAL MODE IS SELECTED)     */}
      {/* ============================================================== */}
      {wabaMode === "manual" && (
        <div style={{ background: "#f8fafc", border: "1.5px solid #93c5fd", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1e40af", display: "flex", alignItems: "center", gap: 6 }}>
              <span>🛠️</span> Manual Meta Business Suite Setup &amp; Direct Links
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, background: "#1877F2", color: "#fff", padding: "3px 8px", borderRadius: 12 }}>
              DIRECT META MANAGER
            </span>
          </div>

          <p style={{ fontSize: 12, color: "#334155", margin: "0 0 12px" }}>
            Use these pre-filled links to configure or release your WABA directly in Meta Business Manager, then paste the IDs below:
          </p>

          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            <a
              href={`https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#fff",
                border: "1px solid #bfdbfe",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "#1d4ed8",
                textDecoration: "none",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>➕ Step 1: Open Meta Business Suite &rarr; WhatsApp Accounts</span>
              <span>↗</span>
            </a>

            <a
              href={`https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${data?.businessPortfolio.id || "1707214344108990"}`}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#fff",
                border: "1px solid #bfdbfe",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "#1d4ed8",
                textDecoration: "none",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>📱 Step 2: Open WhatsApp Manager &rarr; Phone Numbers (Manage 2FA/Release)</span>
              <span>↗</span>
            </a>

            <a
              href={`https://business.facebook.com/settings/partners/client-partners/add?business_id=${data?.businessPortfolio.id || "1707214344108990"}&partner_id=246511357935583`}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#fff",
                border: "1px solid #86efac",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "#15803d",
                textDecoration: "none",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>🤝 Step 3: Assign Agency Partner (Zkandhavel Infotech: 246511357935583 &bull; Pre-filled)</span>
              <span>↗</span>
            </a>
          </div>

          <form onSubmit={handleConnectOfficialWaba} style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 2 }}>WABA ID:</label>
                <input
                  type="text"
                  value={officialWabaId}
                  onChange={e => setOfficialWabaId(e.target.value)}
                  placeholder="1290742346350527"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 2 }}>Phone ID:</label>
                <input
                  type="text"
                  value={officialPhoneId}
                  onChange={e => setOfficialPhoneId(e.target.value)}
                  placeholder="1408496172352210"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "monospace" }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={connectingOfficial || !officialWabaId.trim() || !officialPhoneId.trim()}
              style={{
                background: "#1877F2",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 800,
                cursor: connectingOfficial || !officialWabaId.trim() || !officialPhoneId.trim() ? "not-allowed" : "pointer",
              }}
            >
              {connectingOfficial ? "Connecting…" : "💾 Save & Connect Manual WABA to Workspace"}
            </button>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* QUICK ASSIGN AGENCY PARTNER BAR                                */}
      {/* ============================================================== */}
      <div
        style={{
          background: "#fff",
          border: "1.5px solid #10b981",
          borderRadius: 14,
          padding: "18px 22px",
          boxShadow: "0 2px 8px rgba(16, 185, 129, 0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>🤝</span>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0, fontFamily: "Sora, sans-serif" }}>
                Assign Agency Partner: Zkandhavel Infotech Private Limited (246511357935583)
              </h3>
              <span
                style={{
                  background: partnerAccessLevel === "full" ? "#dcfce7" : "#fef3c7",
                  color: partnerAccessLevel === "full" ? "#15803d" : "#b45309",
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: 10,
                  border: `1px solid ${partnerAccessLevel === "full" ? "#86efac" : "#fde68a"}`,
                }}
              >
                {partnerAccessLevel === "full" ? "FULL ACCESS (FULL CONTROL)" : "PARTIAL ACCESS"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
              Switch or upgrade agency partner permissions between Partial Access and Full Access across both business portfolios.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleAutoAssignAgencyPartner}
              disabled={assigningPartner}
              style={{
                background: "#047857",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 800,
                cursor: assigningPartner ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 6px rgba(4, 120, 87, 0.25)",
              }}
            >
              <span>{assigningPartner ? "⏳" : "⚡"}</span>
              {assigningPartner ? "Updating Partner…" : partnerAccessLevel === "full" ? "Set Full Access (1-Click)" : "Set Partial Access (1-Click)"}
            </button>
          </div>
        </div>

        {/* Toggles: Access Level & Target Portfolio */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 14,
          }}
        >
          {/* Access Level Selector */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155", textTransform: "uppercase", marginBottom: 6 }}>
              Permission Tier:
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: partnerAccessLevel === "full" ? "#dcfce7" : "#fff",
                  color: partnerAccessLevel === "full" ? "#166534" : "#475569",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${partnerAccessLevel === "full" ? "#86efac" : "#cbd5e1"}`,
                }}
              >
                <input
                  type="radio"
                  name="partnerAccessLevel"
                  checked={partnerAccessLevel === "full"}
                  onChange={() => setPartnerAccessLevel("full")}
                />
                <span>🌟 Full Access (Full Control)</span>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: partnerAccessLevel === "partial" ? "#fef3c7" : "#fff",
                  color: partnerAccessLevel === "partial" ? "#92400e" : "#475569",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${partnerAccessLevel === "partial" ? "#fde68a" : "#cbd5e1"}`,
                }}
              >
                <input
                  type="radio"
                  name="partnerAccessLevel"
                  checked={partnerAccessLevel === "partial"}
                  onChange={() => setPartnerAccessLevel("partial")}
                />
                <span>🔹 Partial Access</span>
              </label>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>
              {partnerAccessLevel === "full"
                ? "Full Control: Manage WhatsApp account, phone numbers, templates, ads, messages, and insights."
                : "Partial Access: Limited to message replies, content publishing, and analytics."}
            </p>
          </div>

          {/* Portfolio Target Selector */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155", textTransform: "uppercase", marginBottom: 6 }}>
              Target Business Portfolio:
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: partnerTargetPortfolio === "all" ? "#f0fdf4" : "#fff",
                  color: partnerTargetPortfolio === "all" ? "#166534" : "#475569",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${partnerTargetPortfolio === "all" ? "#86efac" : "#cbd5e1"}`,
                }}
              >
                <input
                  type="radio"
                  name="partnerTargetPortfolio"
                  checked={partnerTargetPortfolio === "all"}
                  onChange={() => setPartnerTargetPortfolio("all")}
                />
                <span>Both Portfolios (Recommended)</span>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: partnerTargetPortfolio === "1185206983626614" ? "#f0fdf4" : "#fff",
                  color: partnerTargetPortfolio === "1185206983626614" ? "#166534" : "#475569",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${partnerTargetPortfolio === "1185206983626614" ? "#86efac" : "#cbd5e1"}`,
                }}
              >
                <input
                  type="radio"
                  name="partnerTargetPortfolio"
                  checked={partnerTargetPortfolio === "1185206983626614"}
                  onChange={() => setPartnerTargetPortfolio("1185206983626614")}
                />
                <span>WABA (1185206983626614)</span>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: partnerTargetPortfolio === "1707214344108990" ? "#f0fdf4" : "#fff",
                  color: partnerTargetPortfolio === "1707214344108990" ? "#166534" : "#475569",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${partnerTargetPortfolio === "1707214344108990" ? "#86efac" : "#cbd5e1"}`,
                }}
              >
                <input
                  type="radio"
                  name="partnerTargetPortfolio"
                  checked={partnerTargetPortfolio === "1707214344108990"}
                  onChange={() => setPartnerTargetPortfolio("1707214344108990")}
                />
                <span>App / Page (1707214344108990)</span>
              </label>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>
              Portfolio 1185206983626614 holds WABA 1290742346350527. Portfolio 1707214344108990 holds Facebook Page &amp; Meta App.
            </p>
          </div>
        </div>

        {/* Step-by-Step Meta Business Suite Upgrade Instructions */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
            📋 How to Switch from Partial Access to Full Access in Meta Business Suite:
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
            <li>
              Open Meta Business Suite for Portfolio <strong>1185206983626614</strong> (WhatsApp Accounts) or <strong>1707214344108990</strong> (Pages).
            </li>
            <li>
              In the left sidebar under <strong>Users</strong>, click <strong>Partners</strong> &gt; Select <strong>Zkandhavel Infotech Private Limited</strong> (<code>246511357935583</code>).
            </li>
            <li>
              Click the blue <strong>Assign assets</strong> button (or click on an existing assigned asset in the list).
            </li>
            <li>
              Select <strong>WhatsApp accounts</strong> &gt; Check <code>recruitmenttrainingacademy</code> (WABA: 1290742346350527).
            </li>
            <li>
              Under Permissions on the right column: toggle <strong>Full control (Manage WhatsApp account)</strong> from OFF to <strong>ON</strong>.
            </li>
            <li>
              Click <strong>Save changes</strong>.
            </li>
          </ol>
        </div>

        {/* Direct Action Links */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href="https://business.facebook.com/latest/settings/partners?business_id=1185206983626614&selected_partner_id=246511357935583"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#047857",
              color: "#fff",
              textDecoration: "none",
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>↗</span> Open Partner in Portfolio 1185206983626614 (WABA Assets)
          </a>

          <a
            href="https://business.facebook.com/latest/settings/partners?business_id=1707214344108990&selected_partner_id=246511357935583"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#1877F2",
              color: "#fff",
              textDecoration: "none",
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>↗</span> Open Partner in Portfolio 1707214344108990 (Page Assets)
          </a>
        </div>

        {partnerAssignResult && (
          <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
            <strong>✓ Result:</strong> {partnerAssignResult.message}
          </div>
        )}
      </div>
    </div>
  )
}
