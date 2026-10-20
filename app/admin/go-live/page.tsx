"use client"
import { useEffect, useState } from "react"

type Check = { key: string; group: string; label: string; ok: boolean; warn?: boolean; detail: string }
type Data = { checks: Check[]; urls: { label: string; value: string; where: string }[]; otp: { phoneNumberId: string; templateName: string; language: string } | null
  numbers: { id: string; label: string }[]; deletions: { id: string; code: string; source: string; email: string | null; facebookUserId: string | null; status: string; note: string | null; createdAt: string }[] }

const muted = "rgba(255,255,255,.55)"
const panel: React.CSSProperties = { background: "#172235", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: 18, marginBottom: 16 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, padding: "7px 9px", fontSize: 13, background: "rgba(255,255,255,.06)", color: "#e2e8f0" }
const btn: React.CSSProperties = { border: 0, borderRadius: 6, padding: "8px 12px", background: "#25d366", color: "#053d36", fontSize: 12, fontWeight: 800, cursor: "pointer" }

// Steps that happen in Meta Business Suite / the Meta App Dashboard (no code). They take 1–3 weeks, so start early.
const META_STEPS = [
  ["Business verification", "Meta Business Suite → Settings → Security Centre → Start verification. Use the exact legal name, address and GSTIN/registration documents of the company; the website must show the same name.", "https://business.facebook.com/settings/security"],
  ["Meta app for ZKWAConnect", "developers.facebook.com → My Apps → Create app → Business type, linked to the verified business portfolio. Add the WhatsApp and Facebook Login for Business products.", "https://developers.facebook.com/apps"],
  ["App settings", "Settings → Basic: app icon, category, Privacy Policy URL, Terms URL and data deletion callback (copy them from the list below). Then switch the app to Live mode.", "https://developers.facebook.com/apps"],
  ["Become a Tech Provider", "WhatsApp → Quickstart → follow \"Become a Tech Provider\" (needs business verification). This lets customers connect their own WhatsApp numbers through Embedded Signup.", "https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers"],
  ["App Review: advanced access", "Request advanced access to whatsapp_business_management and whatsapp_business_messaging (plus business_management). Add ads_management / pages_show_list / instagram_manage_messages only if you sell Ads or Instagram. Each permission needs a screen recording of ZKWAConnect using it and a short description.", "https://developers.facebook.com/docs/app-review"],
  ["Embedded Signup configuration", "Facebook Login for Business → Configurations → Create (WhatsApp Embedded Signup). Put its ID in NEXT_PUBLIC_META_CONFIG_ID and the app ID in META_APP_ID / NEXT_PUBLIC_META_APP_ID.", "https://developers.facebook.com/docs/whatsapp/embedded-signup"],
  ["Production webhook", "WhatsApp → Configuration → Callback URL (below) + verify token (META_VERIFY_TOKEN) → Verify and save → subscribe to messages and message_template_status_update.", ""],
  ["Payment method & your own number", "In WhatsApp Manager add a payment method for your company WABA (for Meta-billed messages). Connect your company number in ZKWAConnect, create an AUTHENTICATION template (e.g. zk_login_code) and select it below for password-reset codes.", "https://business.facebook.com/wa/manage/home/"],
]

export default function GoLivePage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [testPhone, setTestPhone] = useState("")
  const [otp, setOtp] = useState({ phoneNumberId: "", templateName: "", language: "en" })
  const [busy, setBusy] = useState("")

  async function load() {
    const response = await fetch("/api/admin/go-live")
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setData(body)
    if (body.otp) setOtp(body.otp)
  }
  useEffect(() => { load() }, [])

  async function act(name: string, body: Record<string, unknown>) {
    setBusy(name); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/go-live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) setError(result.error); else { setNotice(result.message); load() }
    } catch { setError("Network error") } finally { setBusy("") }
  }

  const failing = data?.checks.filter(check => !check.ok && !check.warn).length ?? 0
  const groups = [...new Set(data?.checks.map(check => check.group) || [])]

  return <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", padding: "24px clamp(16px,4vw,40px)", fontFamily: "DM Sans,system-ui,sans-serif" }}>
    <a href="/admin/dashboard" style={{ color: "#86efac", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>← Admin dashboard</a>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, margin: "8px 0 4px" }}>Go-live checklist</h1>
    <p style={{ fontSize: 13, color: muted, margin: "0 0 18px" }}>Everything the live server needs before customers sign up. Settings come from the server&apos;s environment variables (Railway/Vercel → Variables); redeploy after changing them.</p>
    {error && <div role="alert" style={{ padding: 11, background: "rgba(239,68,68,.15)", color: "#fca5a5", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "rgba(34,197,94,.15)", color: "#86efac", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

    {data && <section style={{ ...panel, borderColor: failing ? "rgba(239,68,68,.4)" : "rgba(34,197,94,.4)" }}>
      <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>{failing ? `🚧 ${failing} item${failing === 1 ? "" : "s"} to fix before going live` : "✅ Server is ready"}</h2>
      {groups.map(group => <div key={group} style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#86efac", textTransform: "uppercase", margin: "8px 0 4px" }}>{group}</div>
        {data.checks.filter(check => check.group === group).map(check => <div key={check.key} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 13 }}>
          <span aria-hidden>{check.ok ? "✅" : check.warn ? "⚠️" : "❌"}</span>
          <div style={{ minWidth: 0 }}><div>{check.label}</div><div style={{ fontSize: 12, color: muted, wordBreak: "break-word" }}>{check.detail}</div></div>
        </div>)}
      </div>)}
    </section>}

    <section style={panel}>
      <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>Meta approval (do these in Meta — takes 1–3 weeks)</h2>
      <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
        {META_STEPS.map(([title, text, link]) => <li key={title} style={{ marginBottom: 8 }}><strong>{title}.</strong> <span style={{ color: "rgba(255,255,255,.75)" }}>{text}</span>
          {link && <> <a href={link} target="_blank" rel="noreferrer" style={{ color: "#86efac" }}>Open ↗</a></>}</li>)}
      </ol>
    </section>

    {data && <section style={panel}>
      <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>URLs to paste into Meta, Razorpay/Cashfree and your uptime monitor</h2>
      {data.urls.map(url => <div key={url.label} style={{ padding: "7px 0", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong>{url.label}</strong>
          <code style={{ background: "rgba(255,255,255,.08)", borderRadius: 4, padding: "2px 6px", wordBreak: "break-all" }}>{url.value}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(url.value)} style={{ ...btn, padding: "3px 8px", fontSize: 11 }}>Copy</button></div>
        <div style={{ fontSize: 12, color: muted }}>{url.where}</div>
      </div>)}
    </section>}

    <section style={{ ...panel, display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}>
      <div>
        <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>Test email &amp; storage</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input type="email" placeholder="you@company.com" aria-label="Send test email to" value={testEmail} onChange={event => setTestEmail(event.target.value)} style={{ ...input, flex: 1, minWidth: 160 }} />
          <button type="button" style={btn} disabled={busy === "email"} onClick={() => act("email", { action: "test-email", to: testEmail })}>Send test email</button>
        </div>
        <button type="button" style={{ ...btn, marginTop: 8 }} disabled={busy === "storage"} onClick={() => act("storage", { action: "test-storage" })}>Test file storage</button>
      </div>
      <div>
        <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>WhatsApp verification codes</h2>
        <p style={{ fontSize: 12, color: muted, margin: "0 0 8px" }}>Password-reset codes are sent from one of your company&apos;s connected numbers using an approved AUTHENTICATION template.</p>
        <div style={{ display: "grid", gap: 6 }}>
          <select aria-label="Send from number" value={otp.phoneNumberId} onChange={event => setOtp({ ...otp, phoneNumberId: event.target.value })} style={input}>
            <option value="">— Off —</option>
            {data?.numbers.map(number => <option key={number.id} value={number.id}>{number.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="Template name, e.g. zk_login_code" aria-label="Template name" value={otp.templateName} onChange={event => setOtp({ ...otp, templateName: event.target.value })} style={{ ...input, flex: 1 }} />
            <input placeholder="en" aria-label="Template language" value={otp.language} onChange={event => setOtp({ ...otp, language: event.target.value })} style={{ ...input, width: 70 }} />
          </div>
          <button type="button" style={btn} disabled={busy === "otp"} onClick={() => act("otp", { action: "save-otp", phoneNumberId: otp.phoneNumberId || null, templateName: otp.templateName || undefined, language: otp.language })}>Save</button>
          {data?.otp && <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="+91 98765 43210" aria-label="Send a test code to" value={testPhone} onChange={event => setTestPhone(event.target.value)} style={{ ...input, flex: 1 }} />
            <button type="button" style={btn} disabled={busy === "wa"} onClick={() => act("wa", { action: "test-whatsapp", phone: testPhone })}>Send test code</button>
          </div>}
          {!data?.numbers.length && <div style={{ fontSize: 12, color: "#fcd34d" }}>No connected number in an internal workspace yet — connect your company number first.</div>}
        </div>
      </div>
    </section>

    {data && <section style={panel}>
      <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Data deletion requests ({data.deletions.length})</h2>
      {!data.deletions.length && <div style={{ fontSize: 13, color: muted }}>None yet. Requests from Meta&apos;s callback and the /data-deletion form appear here; complete them within 30 days.</div>}
      {data.deletions.map(item => <div key={item.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "7px 0", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 13 }}>
        <code>{item.code}</code><span>{item.email || (item.facebookUserId ? `Facebook user ${item.facebookUserId}` : "-")}</span>
        <span style={{ color: muted }}>{item.source === "META_CALLBACK" ? "Meta" : "Form"} · {new Date(item.createdAt).toLocaleDateString("en-IN")}{item.note ? ` · ${item.note}` : ""}</span>
        <select aria-label={`Status of ${item.code}`} value={item.status} onChange={event => act("del", { action: "deletion-status", id: item.id, status: event.target.value })} style={{ ...input, marginLeft: "auto" }}>
          {["RECEIVED", "IN_PROGRESS", "COMPLETED", "REJECTED"].map(status => <option key={status}>{status}</option>)}
        </select>
      </div>)}
    </section>}
  </div>
}
