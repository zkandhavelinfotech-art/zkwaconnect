"use client"
import { useCallback, useEffect, useState } from "react"

type Account = {
  organization: { id: string; name: string; status: string; createdAt: string }
  viewer: { isAdmin: boolean; viewingOther: boolean; canManage: boolean }
  connection: {
    status: string; connectedAt: string | null; lastSyncedAt: string | null; tokenStored: boolean; tokenValid: boolean; tokenError: string | null
    facebookUser: { id: string; name: string | null } | null; tokenType: string | null; expiresAt: string | null; dataAccessExpiresAt: string | null
    permissions: { scope: string; granted: boolean }[] | null
  } | null
  business: { id: string; name: string | null; verificationStatus: string | null } | null
  activeWaba: {
    wabaId: string; name: string; reviewStatus: string | null; currency: string | null; timezone: string | null; webhookSubscribed: boolean | null
    phones: { phoneNumberId: string; display: string; verifiedName: string | null; status: string; registered: boolean; quality: string | null
      nameStatus: string | null; metaStatus: string | null; messagingLimit: string | null }[]
    unlinkedPhones: { phoneNumberId: string; display: string; verifiedName: string | null }[]
  } | null
  otherWabas: { wabaId: string; name: string; status: string; phones: number }[]
  onboarding: { metaConnected: boolean; wabaCreated: boolean; phoneRegistered: boolean; completedAt: string | null }
  warnings: string[]
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }
const head: React.CSSProperties = { fontFamily: "Sora,sans-serif", fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }
const keyStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", padding: "9px 0", width: 190, verticalAlign: "top" }

function Badge({ value, good = [], bad = [] }: { value: string | null | undefined; good?: string[]; bad?: string[] }) {
  if (!value) return <span style={{ color: "#94a3b8" }}>—</span>
  const upper = value.toUpperCase()
  const tone = good.includes(upper) ? ["#dcfce7", "#15803d"] : bad.includes(upper) ? ["#fee2e2", "#b91c1c"] : upper === "YELLOW" || upper === "PENDING" ? ["#fef9c3", "#a16207"] : ["#f1f5f9", "#475569"]
  return <span style={{ background: tone[0], color: tone[1], borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{value.replace(/_/g, " ")}</span>
}

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
    <code style={{ fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 7px" }}>{value}</code>
    <button type="button" onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 6, padding: "1px 7px", fontSize: 10, cursor: "pointer", color: "#475569" }}>{copied ? "Copied" : "Copy"}</button>
  </span>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <tr style={{ borderTop: "1px solid #f1f5f9" }}><td style={keyStyle}>{label}</td><td style={{ padding: "9px 0", fontSize: 13, color: "#0f172a" }}>{children}</td></tr>
}

function date(value: string | null | undefined, fallback = "—") {
  return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : fallback
}

// Shows the Meta Business Manager, WhatsApp Business Account, phone numbers and token health for one workspace.
export function MetaAccountDetails({ organizationId }: { organizationId?: string }) {
  const [data, setData] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/meta/account${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load Meta account details.")
      setData(body)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load Meta account details.") }
    finally { setLoading(false) }
  }, [organizationId])
  useEffect(() => { load() }, [load])

  if (!data) return <div style={{ fontSize: 13, color: error ? "#b91c1c" : "#64748b" }}>{error || "Loading Meta account details…"}</div>
  const c = data.connection, w = data.activeWaba
  const connectedOk = Boolean(c?.tokenValid)
  const missing = c?.permissions?.filter(item => !item.granted) || []
  const manageLinks = !data.viewer.viewingOther

  return <div style={{ display: "grid", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {[["Meta connected", data.onboarding.metaConnected], ["WhatsApp account", data.onboarding.wabaCreated], ["Number registered", data.onboarding.phoneRegistered]].map(([label, ok]) =>
        <span key={label as string} style={{ fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "5px 12px",
          background: ok ? "#dcfce7" : "#fef2f2", color: ok ? "#15803d" : "#b91c1c" }}>{ok ? "✓" : "✕"} {label}</span>)}
      <div style={{ flex: 1 }} />
      <button type="button" onClick={load} disabled={loading} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        {loading ? "Refreshing…" : "↻ Refresh from Meta"}</button>
    </div>
    {error && <div role="alert" style={{ padding: 11, background: "#fef2f2", color: "#991b1b", borderRadius: 8, fontSize: 13 }}>{error}</div>}
    {data.warnings.map(item => <div key={item} style={{ padding: "9px 11px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 8, fontSize: 12 }}>⚠ {item}</div>)}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: 16, alignItems: "start" }}>
      <section style={{ ...card, borderTop: `3px solid ${connectedOk ? "#25D366" : "#f59e0b"}` }}>
        <h2 style={head}>📘 Facebook connection</h2>
        {!c ? <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>This workspace hasn&apos;t connected Facebook yet.</p> :
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            <Row label="Status">{connectedOk ? <Badge value="CONNECTED" good={["CONNECTED"]} /> : <Badge value={c.tokenStored ? "TOKEN NOT WORKING" : c.status} bad={["TOKEN NOT WORKING", "DISCONNECTED", "ERROR"]} />}
              {c.tokenError && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>{c.tokenError}</div>}</Row>
            <Row label="Facebook user">{c.facebookUser ? <>{c.facebookUser.name || "—"} <span style={{ color: "#94a3b8" }}>·</span> <CopyId value={c.facebookUser.id} /></> : "—"}</Row>
            <Row label="Access type">{c.tokenType === "SYSTEM_USER" ? "Business system user (Embedded Signup)" : c.tokenType === "USER" ? "Facebook user login" : c.tokenType || "—"}</Row>
            <Row label="Connected">{date(c.connectedAt)}</Row>
            <Row label="Access expires">{c.expiresAt ? date(c.expiresAt) : connectedOk ? "Never" : "—"}</Row>
            {c.dataAccessExpiresAt && <Row label="Data access until">{date(c.dataAccessExpiresAt)}</Row>}
          </tbody></table>}
        {c?.permissions && <div style={{ marginTop: 12 }}>
          <div style={keyStyle}>Permissions {missing.length ? <span style={{ color: "#b91c1c", textTransform: "none" }}>· {missing.length} missing</span> : <span style={{ color: "#15803d", textTransform: "none" }}>· all granted</span>}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{c.permissions.map(item => <span key={item.scope} style={{ fontSize: 10, fontFamily: "monospace", borderRadius: 20, padding: "2px 8px",
            background: item.granted ? "#dcfce7" : "#fee2e2", color: item.granted ? "#15803d" : "#b91c1c" }}>{item.granted ? "✓" : "✕"} {item.scope}</span>)}</div>
        </div>}
        {manageLinks && <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <a href="/onboarding" style={{ fontSize: 12, fontWeight: 700, color: "#075e54" }}>{connectedOk ? "Reconnect or switch →" : "Connect Facebook →"}</a>
        </div>}
      </section>

      <section style={card}>
        <h2 style={head}>🏢 Meta Business Manager</h2>
        {!data.business ? <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Not known yet — choose a WhatsApp account to link the business portfolio.</p> :
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            <Row label="Business name">{data.business.name || "—"}</Row>
            <Row label="Business ID"><CopyId value={data.business.id} /></Row>
            <Row label="Verification"><Badge value={data.business.verificationStatus} good={["VERIFIED"]} bad={["REJECTED", "FAILED"]} /></Row>
          </tbody></table>}
        <a href={`https://business.facebook.com/settings/info${data.business ? `?business_id=${data.business.id}` : ""}`} target="_blank" rel="noreferrer"
          style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 700, color: "#1877F2" }}>Open in Meta Business Suite ↗</a>
      </section>
    </div>

    <section style={{ ...card, borderTop: "3px solid #075e54" }}>
      <h2 style={head}>📱 WhatsApp Business API account</h2>
      {!w ? <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>No active WhatsApp Business Account. {manageLinks && <a href="/onboarding" style={{ color: "#075e54", fontWeight: 700 }}>Choose one →</a>}</p> : <>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}><tbody>
          <Row label="Account name">{w.name}</Row>
          <Row label="WABA ID"><CopyId value={w.wabaId} /></Row>
          <Row label="Account review"><Badge value={w.reviewStatus} good={["APPROVED"]} bad={["REJECTED"]} /></Row>
          <Row label="Currency · Timezone">{w.currency || "—"} · {w.timezone || "—"}</Row>
          <Row label="Incoming messages">{w.webhookSubscribed === null ? "Couldn't check" : w.webhookSubscribed
            ? <span style={{ color: "#15803d", fontWeight: 600 }}>✓ Subscribed — messages reach ZKWAConnect</span>
            : <span style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Not subscribed {manageLinks && <a href="/app/settings" style={{ color: "#b91c1c" }}>— fix in Settings</a>}</span>}</Row>
        </tbody></table>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
          <thead style={{ background: "#f8fafc", color: "#64748b" }}><tr>{["Phone number", "Phone Number ID", "Display name", "Quality", "Status"].map(name =>
            <th key={name} style={{ padding: "9px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 }}>{name}</th>)}</tr></thead>
          <tbody>
            {w.phones.map(phone => <tr key={phone.phoneNumberId} style={{ borderTop: "1px solid #f1f5f9" }}>
              <td style={{ padding: 10, fontFamily: "monospace" }}>{phone.display}</td>
              <td style={{ padding: 10 }}><CopyId value={phone.phoneNumberId} /></td>
              <td style={{ padding: 10 }}>{phone.verifiedName || "—"} {phone.nameStatus && <Badge value={phone.nameStatus} good={["APPROVED", "AVAILABLE_WITHOUT_REVIEW"]} bad={["DECLINED"]} />}</td>
              <td style={{ padding: 10 }}><Badge value={phone.quality} good={["GREEN"]} bad={["RED"]} /></td>
              <td style={{ padding: 10 }}>{phone.registered ? <Badge value="REGISTERED" good={["REGISTERED"]} /> : <Badge value={phone.status} />}</td>
            </tr>)}
            {w.unlinkedPhones.map(phone => <tr key={phone.phoneNumberId} style={{ borderTop: "1px solid #f1f5f9", color: "#64748b" }}>
              <td style={{ padding: 10, fontFamily: "monospace" }}>{phone.display}</td>
              <td style={{ padding: 10 }}><CopyId value={phone.phoneNumberId} /></td>
              <td style={{ padding: 10 }}>{phone.verifiedName || "—"}</td><td style={{ padding: 10 }}>—</td>
              <td style={{ padding: 10 }}>Not registered in ZKWAConnect {manageLinks && <a href="/onboarding/phone-registration" style={{ color: "#075e54", fontWeight: 700 }}>Register →</a>}</td>
            </tr>)}
            {!w.phones.length && !w.unlinkedPhones.length && <tr><td colSpan={5} style={{ padding: 12, color: "#64748b" }}>No phone numbers on this account yet.</td></tr>}
          </tbody>
        </table></div>
      </>}
      {data.otherWabas.length > 0 && <div style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
        Other accounts linked before (inactive): {data.otherWabas.map(item => `${item.name} (${item.wabaId})`).join(", ")}
        {manageLinks && <> · <a href="/onboarding/waba-setup" style={{ color: "#075e54", fontWeight: 700 }}>Switch account →</a></>}</div>}
    </section>
    <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Access tokens are stored encrypted and are never shown. All details above are read live from Meta.</p>
  </div>
}
