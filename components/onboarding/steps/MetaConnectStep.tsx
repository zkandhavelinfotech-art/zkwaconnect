"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Notice, primaryButton, secondaryButton } from "@/components/onboarding/OnboardingShell"
import { EmbeddedSignupButton, type EmbeddedSignupConfig } from "@/components/onboarding/EmbeddedSignupButton"
import { META_SCOPES } from "@/lib/meta/scopes"

const oauthErrors: Record<string, string> = {
  meta_config_missing: "Facebook login isn't set up on this server yet.",
  oauth_denied: "Facebook login was cancelled or permission was declined.",
  oauth_state_invalid: "The Facebook response didn't match this browser session. Please try again.",
  oauth_state_expired: "The Facebook login took too long and expired. Please try again.",
  oauth_exchange_failed: "Meta could not complete the connection.",
  session_expired: "Your ZKWAConnect session expired. Sign in again, then connect Facebook.",
}

const permissionLabels: Record<string, string> = {
  whatsapp_business_management: "Manage your WhatsApp account and templates",
  whatsapp_business_messaging: "Send and receive WhatsApp messages",
  business_management: "See your business portfolios",
  ads_read: "Read ad performance",
  ads_management: "Create ads for you (always created paused)",
  pages_manage_ads: "Run ads from your Facebook Page",
  leads_retrieval: "Import Lead Form leads",
  pages_show_list: "List your Facebook Pages",
  pages_read_engagement: "Read Page Lead Forms",
}

export type SetupStatus = {
  account: { name: string; email: string; workspace: string; role: string; isPlatformAdmin: boolean }
  metaLogin: { ready: boolean; missing: string[] }
  embeddedSignup: EmbeddedSignupConfig | null
  metaConnected: boolean
  meta: { name: string | null; metaUserId: string | null; connectedAt: string | null; tokenExpiresAt: string | null } | null
  metaError: string | null
  wabaCreated: boolean
  phoneVerified: boolean
  completedAt: string | null
  waba: { name: string; wabaId: string } | null
  phone: { phoneNumber: string } | null
}

export function useSetupStatus() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/status", { cache: "no-store" })
      if (response.status === 401) { window.location.href = `/api/auth/logout?next=${encodeURIComponent(`/login?from=${window.location.pathname}`)}`; return }
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not read setup status.")
      setStatus(body); setError("")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read setup status.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { reload() }, [reload])
  return { status, loading, error, reload }
}

const InstagramIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>

const FacebookIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>

// Connect Meta: Embedded Signup (new businesses) or Facebook login (existing accounts), plus the connected state.
export function MetaConnectStep({ status, reload, returnTo, onDone, showAccount = true }: {
  status: SetupStatus | null; reload: () => Promise<void>; returnTo?: string
  onDone: (redirect: string) => void; showAccount?: boolean
}) {
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [disconnecting, setDisconnecting] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // The Facebook popup reports back with postMessage from our own callback page.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== "zk-meta-oauth") return
      setWaiting(false)
      if (event.data.ok) {
        setError(""); setNotice("Facebook connected. Loading your WhatsApp accounts…")
        reload().then(() => onDoneRef.current("/onboarding/waba-setup"))
      } else {
        setNotice("")
        setError(`${oauthErrors[event.data.error] || "Facebook login could not be completed."}${event.data.reason ? ` Meta said: “${event.data.reason}”` : ""}`)
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [reload])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("error")
    if (!code) return
    const reason = params.get("reason")
    setError(`${oauthErrors[code] || "Facebook login could not be completed."}${reason ? ` Meta said: “${reason}”` : ""}`)
    window.history.replaceState(null, "", window.location.pathname)
  }, [])

  async function disconnect() {
    if (!window.confirm("Disconnect Meta from this workspace? Sending and receiving WhatsApp messages will stop until you reconnect.")) return
    setDisconnecting(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/meta/disconnect", { method: "POST" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not disconnect Meta.")
      setNotice(body.message)
      await reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not disconnect Meta.") }
    finally { setDisconnecting(false) }
  }

  if (!status) return <p style={{ fontSize: 13, color: "#64748b" }}>Checking your Meta connection…</p>
  const ready = status.metaLogin.ready
  const canManage = ["OWNER", "ADMIN"].includes(status.account.role)
  const oauthHref = `/api/meta/oauth/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`

  // Opens Facebook login in a centred popup; falls back to a full-page redirect if popups are blocked.
  function openFacebook() {
    const width = 600, height = 720
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
    const popup = window.open(`${oauthHref}${oauthHref.includes("?") ? "&" : "?"}popup=1`, "zk-facebook-login",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`)
    if (!popup) { window.location.href = oauthHref; return }
    popup.focus(); setWaiting(true); setError(""); setNotice("")
    const timer = window.setInterval(() => { if (popup.closed) { window.clearInterval(timer); setWaiting(false) } }, 500)
  }

  return <div>
    {showAccount && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", background: "#f8fafc",
      border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 18, fontSize: 12, color: "#475569" }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#075E54", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12 }}>
        {(status.account.name || status.account.email)[0]?.toUpperCase()}</span>
      <span>Signed in as <strong style={{ color: "#0f172a" }}>{status.account.name}</strong> ({status.account.email}) · Workspace <strong style={{ color: "#0f172a" }}>{status.account.workspace}</strong></span>
      <a href="/api/auth/logout?next=/login" style={{ marginLeft: "auto", color: "#075E54", fontWeight: 700, textDecoration: "none" }}>Not you? Sign out</a>
    </div>}

    {error && <Notice>{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {status.metaError && <Notice tone="warning">{status.metaError}</Notice>}
    {!ready && <Notice tone="warning">
      <strong>Facebook login isn&apos;t set up on this server yet.</strong>{" "}
      {status.account.isPlatformAdmin
        ? <>Missing or placeholder: {status.metaLogin.missing.join(", ")}. <a href="/admin/meta-setup" style={{ color: "#b45309", fontWeight: 700 }}>Open Meta app setup →</a></>
        : <>The ZKWAConnect team needs to finish connecting the Meta app. Please contact support and try again later.</>}
    </Notice>}

    {status.metaConnected && status.meta ? (
      <div style={{ border: "1.5px solid #bbf7d0", background: "#f0fdf4", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ width: 48, height: 48, borderRadius: "50%", background: "#1877F2", display: "grid", placeItems: "center", flexShrink: 0 }}><FacebookIcon /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#14532d" }}>✓ Connected as {status.meta.name || "your Facebook account"}</div>
            <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>
              Verified with Meta just now{status.meta.connectedAt ? ` · connected ${new Date(status.meta.connectedAt).toLocaleDateString()}` : ""}
              {status.meta.tokenExpiresAt ? ` · access valid until ${new Date(status.meta.tokenExpiresAt).toLocaleDateString()}` : " · no expiry"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" onClick={() => onDone("/onboarding/waba-setup")} style={primaryButton}>Choose WhatsApp account →</button>
          {ready && <button type="button" onClick={openFacebook} disabled={waiting} style={secondaryButton}>{waiting ? "Waiting for Facebook…" : "Reconnect / switch account"}</button>}
          {canManage && <button type="button" onClick={disconnect} disabled={disconnecting} style={{ ...secondaryButton, color: "#b91c1c", borderColor: "#fecaca" }}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}</button>}
        </div>
      </div>
    ) : (
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: status.embeddedSignup ? "repeat(auto-fit,minmax(min(100%,260px),1fr))" : "1fr", marginBottom: 20 }}>
        {status.embeddedSignup && <div style={{ border: "2px solid #25D366", borderRadius: 12, padding: 18, background: "#f0fdf4" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Recommended for new businesses</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Embedded Signup</div>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, margin: "0 0 14px" }}>In Meta&apos;s popup, create or pick your Business Manager, WhatsApp account and phone number,
            and verify the number — all in one go.</p>
          <EmbeddedSignupButton config={status.embeddedSignup}
            onError={message => { setNotice(""); setError(message) }}
            onDone={result => { setError(""); setNotice([result.message, ...(result.warnings || [])].filter(Boolean).join(" ")); reload().then(() => onDone(result.redirect)) }} />
        </div>}
        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "24px 22px", background: "#fff", maxWidth: 440,
          justifySelf: status.embeddedSignup ? "stretch" : "center", width: "100%", boxSizing: "border-box", boxShadow: "0 4px 20px rgba(15,23,42,.06)" }}>
          {status.embeddedSignup && <div style={{ fontSize: 11, fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Already have a WhatsApp account?</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(145deg,#128C7E,#075E54)", display: "grid", placeItems: "center",
              fontFamily: "Arial", fontWeight: 900, fontSize: 13, flexShrink: 0 }}><span><span style={{ color: "#fff" }}>Z</span><span style={{ color: "#25D366" }}>K</span></span></span>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, fontWeight: 700 }}>Log in to connect your Meta business</div>
          </div>
          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "0 0 18px" }}>
            Use the account that manages your Meta Business Suite. Facebook opens in a popup — ZKWAConnect never sees your password.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <button type="button" onClick={openFacebook} disabled={!ready || waiting}
              style={{ ...primaryButton, width: "100%", background: ready ? "#1877F2" : "#94a3b8", cursor: ready ? "pointer" : "not-allowed", opacity: waiting ? .75 : 1 }}>
              <FacebookIcon />{waiting ? "Waiting for Facebook…" : status.metaError ? "Reconnect with Facebook" : "Log in with Facebook"}
            </button>
            <button type="button" disabled title="Coming soon — WhatsApp Business API connects through Facebook"
              style={{ ...primaryButton, width: "100%", background: "#fff", color: "#94a3b8", border: "1.5px solid #e2e8f0", cursor: "not-allowed" }}>
              <InstagramIcon />Log in with Instagram
              <span style={{ fontSize: 10, fontWeight: 700, background: "#f1f5f9", color: "#64748b", borderRadius: 20, padding: "2px 8px" }}>Coming soon</span>
            </button>
          </div>
          {waiting && <p style={{ fontSize: 12, color: "#475569", margin: "12px 0 0" }}>Finish logging in in the Facebook window. Don&apos;t see it?{" "}
            <a href={oauthHref} style={{ color: "#1877F2", fontWeight: 700 }}>Continue in this tab</a></p>}
          <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, margin: "14px 0 0" }}>
            WhatsApp Business API access is granted through Facebook login. You can remove access anytime in your Meta business settings or with <strong>Disconnect</strong>.</p>
        </div>
      </div>
    )}

    <details style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
      <summary style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>Permissions requested ({META_SCOPES.length})</summary>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {META_SCOPES.map(item => <div key={item.scope} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#334155" }}>
          <span aria-hidden="true" style={{ color: "#25D366", fontWeight: 800 }}>✓</span>
          <span style={{ flex: 1 }}>{permissionLabels[item.scope] || item.purpose}</span>
          <code style={{ fontSize: 10, background: item.scope.startsWith("whatsapp") ? "#dcfce7" : "#dbeafe", color: item.scope.startsWith("whatsapp") ? "#075E54" : "#1d4ed8",
            borderRadius: 20, padding: "2px 8px" }}>{item.scope}</code>
        </div>)}
      </div>
    </details>
  </div>
}
