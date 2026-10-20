"use client"
import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { FEATURES, type FeatureKey } from "@/lib/billing/features"

type Stats = { openConversations: number; unread: number; contacts: number; optedIn: number; runningCampaigns: number; messagesSent: number; activeFlows: number
  whatsapp: { phoneNumber: string; displayName: string | null } | null }
type Me = { user: { name: string }; workspace: { name: string; walletBalance: number; currency: string }
  plan: { name: string; status: string; interval: string; renewsOn: string | null; trialEndsAt: string | null } | null
  whatsapp: { connected: boolean; phoneNumber: string | null }
  access?: { onFree: boolean; planName: string | null; features: FeatureKey[]; messagesUsed: number; messagesLimit: number | null
    next: { name: string; slug: string; monthlyPrice: number; adds: FeatureKey[] } | null } }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(11,20,26,.06)" }
const smallBtn: React.CSSProperties = { border: "1px solid #075e54", color: "#075e54", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700,
  cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(amount) } catch { return `₹ ${amount.toFixed(2)}` }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    fetch("/api/dashboard").then(response => response.ok ? response.json() : null).then(setStats).catch(() => null)
    fetch("/api/me").then(response => response.ok ? response.json() : null).then(setMe).catch(() => null)
  }, [])

  const cards = [
    { label: "Open conversations", value: stats?.openConversations, sub: stats?.unread ? `${stats.unread} unread` : "All caught up", icon: "💬", color: "#075E54", href: "/app/inbox" },
    { label: "Contacts", value: stats?.contacts, sub: stats ? `${stats.optedIn.toLocaleString()} opted in` : "", icon: "👥", color: "#1d4ed8", href: "/app/contacts" },
    { label: "Running campaigns", value: stats?.runningCampaigns, sub: "Broadcasts in progress", icon: "📣", color: "#7c3aed", href: "/app/campaigns" },
    { label: "Messages sent", value: stats?.messagesSent, sub: "Last 30 days", icon: "📤", color: "#d97706", href: "/app/analytics" },
  ]
  const actions = [
    { label: "Live Chat", href: "/app/inbox", icon: "💬", desc: "Reply to customers" },
    { label: "New broadcast", href: "/app/campaigns", icon: "📣", desc: "Send a template to many" },
    { label: "Create New Ad", href: "/app/ads/create", icon: "✨", desc: "Facebook & Instagram ads" },
    { label: "Flow Builder", href: "/app/automation", icon: "🔀", desc: `${stats?.activeFlows ?? 0} active chatbot flow${stats?.activeFlows === 1 ? "" : "s"}` },
    { label: "Templates", href: "/app/templates", icon: "📋", desc: "Message template library" },
    { label: "Contacts", href: "/app/contacts", icon: "👥", desc: "Import, tag & segment" },
  ]

  return (
    <div className="zk-dash">
      <style>{`.zk-dash-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
        .zk-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .zk-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        @media(max-width:1250px){.zk-dash-grid{grid-template-columns:minmax(0,1fr)}.zk-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:640px){.zk-stats,.zk-actions{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 700, margin: 0 }}>{me?.workspace.name || "Dashboard"}</h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>Welcome back{me?.user.name ? `, ${me.user.name.split(" ")[0]}` : ""} 👋 Here&apos;s what&apos;s happening on WhatsApp.</p>
      </div>

      <div className="zk-dash-grid">
        <div>
          {stats && !stats.whatsapp && <div style={{ background: "linear-gradient(135deg,#075E54,#128C7E)", borderRadius: 14, padding: "18px 20px", marginBottom: 18,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", boxShadow: "0 4px 14px rgba(7,94,84,.2)" }}>
            <div>
              <div style={{ fontFamily: "Sora,sans-serif", fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 3 }}>Connect your WhatsApp Business Account</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)" }}>Finish setup to start messaging customers — it takes about 5 minutes.</div>
            </div>
            <a href="/onboarding" style={{ background: "#25D366", color: "#053d36", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Connect WhatsApp →</a>
          </div>}
          {stats?.whatsapp && <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, marginBottom: 18, padding: "14px 18px" }}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#25D366", display: "grid", placeItems: "center", fontSize: 20 }}>💬</span>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{stats.whatsapp.displayName || "WhatsApp Business"}</div>
              <div style={{ fontSize: 13, color: "#475569" }}>{stats.whatsapp.phoneNumber} · Connected to the WhatsApp Business API</div></div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#dcfce7", borderRadius: 20, padding: "3px 10px" }}>● LIVE</span>
          </div>}

          <div className="zk-stats" style={{ marginBottom: 18 }}>
            {cards.map(item => <a key={item.label} href={item.href} style={{ ...card, textDecoration: "none", color: "inherit", borderTop: `3px solid ${item.color}`, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>{item.label}</span>
                <span style={{ fontSize: 18 }}>{item.icon}</span></div>
              <div style={{ fontFamily: "Sora,sans-serif", fontSize: 28, fontWeight: 800, color: item.color }}>{item.value === undefined ? "…" : item.value.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{item.sub}</div>
            </a>)}
          </div>

          <div style={card}>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Quick actions</div>
            <div className="zk-actions">
              {actions.map(action => <a key={action.label} href={action.href} style={{ textDecoration: "none", color: "inherit", display: "block", border: "1px solid #e2e8f0",
                borderRadius: 10, padding: 14 }} onMouseOver={e => { e.currentTarget.style.borderColor = "#25D366"; e.currentTarget.style.background = "#f0fdf4" }}
                onMouseOut={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{action.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{action.label}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{action.desc}</div>
              </a>)}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <aside style={{ display: "grid", gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 14, color: "#334155" }}>Wallet balance</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 24, fontWeight: 600 }}>{me ? money(me.workspace.walletBalance, me.workspace.currency) : "…"}</span>
              <a href="/app/billing#messaging" style={smallBtn}>Top up / compare costs</a>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, color: "#64748b" }}>Current Plan</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "6px 0 16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{me?.access?.onFree ? "FREE" : me?.plan ? me.plan.name.toUpperCase() : "FREE"}{" "}
                <span style={{ fontSize: 12, fontWeight: 400, color: "#64748b" }}>({me?.access?.onFree ? "forever" : me?.plan?.status === "TRIAL" ? "trial" : me?.plan ? me.plan.interval : "forever"})</span></span>
              {!me?.access?.onFree && me?.plan?.renewsOn && <span style={{ fontSize: 12, color: "#475569" }}>{me.plan.status === "TRIAL" ? "trial ends" : "renews on"} {new Date(me.plan.renewsOn).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>}
            </div>
            {me?.access && <>
              {me.access.messagesLimit !== null && <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Messages this month</span><strong>{me.access.messagesUsed.toLocaleString("en-IN")} / {me.access.messagesLimit.toLocaleString("en-IN")}</strong></div>
                <div style={{ height: 5, background: "#e9efed", borderRadius: 3, marginTop: 4 }}><div style={{ height: "100%", borderRadius: 3, background: "#25d366",
                  width: `${Math.min(100, Math.round(me.access.messagesUsed / me.access.messagesLimit * 100))}%` }} /></div></div>}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>Included in your plan</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", fontSize: 12, color: "#334155" }}>
                {me.access.features.filter(feature => FEATURES[feature].group !== "Essentials").slice(0, 5).map(feature => <li key={feature} style={{ padding: "2px 0" }}>✓ {FEATURES[feature].label}</li>)}
                {me.access.features.every(feature => FEATURES[feature].group === "Essentials") && <li style={{ padding: "2px 0" }}>✓ Official WhatsApp API, team inbox, templates & contacts</li>}
              </ul>
              {me.access.next && me.access.next.adds.length > 0 && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", marginBottom: 4 }}>Upgrade to {me.access.next.name} to unlock</div>
                {me.access.next.adds.slice(0, 5).map(feature => <div key={feature} title={FEATURES[feature].description} style={{ fontSize: 12, color: "#14532d", padding: "1px 0" }}>🔓 {FEATURES[feature].label}</div>)}
                {me.access.next.adds.length > 5 && <div style={{ fontSize: 11, color: "#166534" }}>+ {me.access.next.adds.length - 5} more</div>}
              </div>}
            </>}
            <a href={me?.access?.next ? `/app/billing?plan=${me.access.next.slug}#plans` : "/app/billing#plans"} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "#fff", borderRadius: 8,
              padding: "11px 14px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>💎 {me?.access?.next ? `Upgrade to ${me.access.next.name}` : "See plans"}</a>
          </div>

          <WhatsAppLinkCard phone={me?.whatsapp.phoneNumber || stats?.whatsapp?.phoneNumber || null} />
          <WebsiteButtonCard phone={me?.whatsapp.phoneNumber || stats?.whatsapp?.phoneNumber || null} />
        </aside>
      </div>
    </div>
  )
}

function useCopy() {
  const [copied, setCopied] = useState("")
  return { copied, copy: (key: string, text: string) => navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(""), 1500) }) }
}

// Customize WhatsApp Link: wa.me link with a pre-filled message, plus a downloadable QR code.
function WhatsAppLinkCard({ phone }: { phone: string | null }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("Hi! I'd like to know more about your services.")
  const [qr, setQr] = useState("")
  const { copied, copy } = useCopy()
  const digits = (phone || "").replace(/\D/g, "")
  const link = digits ? `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ""}` : ""
  useEffect(() => { if (open && link) QRCode.toDataURL(link, { width: 220, margin: 1, color: { dark: "#054640" } }).then(setQr).catch(() => setQr("")) }, [open, link])
  return <div style={card}>
    <div style={{ fontSize: 36 }}>🔗</div>
    <div style={{ fontSize: 17, fontWeight: 700, margin: "8px 0 4px" }}>Customize WhatsApp Link</div>
    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>Create shareable links &amp; QR for your WA business number</div>
    {!digits ? <a href="/onboarding" style={{ ...smallBtn, display: "inline-block", marginTop: 12 }}>Connect WhatsApp first</a>
      : !open ? <button type="button" onClick={() => setOpen(true)} style={{ ...smallBtn, marginTop: 12 }}>Create link</button>
      : <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Pre-filled message
          <textarea rows={2} maxLength={500} value={message} onChange={event => setMessage(event.target.value)} style={{ ...input, marginTop: 4, resize: "vertical" }} /></label>
        <code style={{ fontSize: 11, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, wordBreak: "break-all" }}>{link}</code>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => copy("link", link)} style={smallBtn}>{copied === "link" ? "Copied ✓" : "Copy link"}</button>
          <a href={link} target="_blank" rel="noreferrer" style={smallBtn}>Test ↗</a>
          {qr && <a href={qr} download="whatsapp-qr.png" style={smallBtn}>Download QR</a>}
        </div>
        {qr && <img src={qr} alt="WhatsApp QR code" width={150} height={150} style={{ justifySelf: "center", borderRadius: 8 }} />}
      </div>}
  </div>
}

// WhatsApp Website Button: copy-paste HTML for a floating chat button.
function WebsiteButtonCard({ phone }: { phone: string | null }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("Chat with us")
  const [side, setSide] = useState<"right" | "left">("right")
  const [message, setMessage] = useState("Hi! I came from your website.")
  const { copied, copy } = useCopy()
  const digits = (phone || "").replace(/\D/g, "")
  const snippet = useMemo(() => {
    const safeLabel = label.replace(/[<>&"]/g, "")
    const href = `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ""}`
    return `<a href="${href}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp" style="position:fixed;${side}:20px;bottom:20px;z-index:9999;display:flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:12px 18px;border-radius:30px;font:600 15px/1 sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.2)"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 13.9c-.2.6-1.3 1.2-1.8 1.3-.5 0-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2.1 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.2 1.4z"/></svg>${safeLabel}</a>`
  }, [digits, label, side, message])
  return <div style={card}>
    <div style={{ fontSize: 36 }}>🖥️</div>
    <div style={{ fontSize: 17, fontWeight: 700, margin: "8px 0 4px" }}>WhatsApp Website Button</div>
    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>Drive WhatsApp sales with personalised CTAs</div>
    {!digits ? <a href="/onboarding" style={{ ...smallBtn, display: "inline-block", marginTop: 12 }}>Connect WhatsApp first</a>
      : !open ? <button type="button" onClick={() => setOpen(true)} style={{ ...smallBtn, marginTop: 12 }}>Create button</button>
      : <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Button text<input maxLength={30} value={label} onChange={event => setLabel(event.target.value)} style={{ ...input, marginTop: 4 }} /></label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Position<select value={side} onChange={event => setSide(event.target.value as "right" | "left")} style={{ ...input, marginTop: 4 }}>
            <option value="right">Bottom right</option><option value="left">Bottom left</option></select></label>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Message customers start with<input maxLength={300} value={message} onChange={event => setMessage(event.target.value)} style={{ ...input, marginTop: 4 }} /></label>
        <div style={{ background: "#f0f2f5", borderRadius: 8, height: 70, position: "relative", overflow: "hidden" }} aria-label="Button preview">
          <span style={{ position: "absolute", [side]: 10, bottom: 10, background: "#25D366", color: "#fff", borderRadius: 30, padding: "7px 12px", fontSize: 12, fontWeight: 600 }}>💬 {label || "Chat with us"}</span>
        </div>
        <textarea readOnly rows={4} value={snippet} onFocus={event => event.target.select()} style={{ ...input, fontFamily: "monospace", fontSize: 11 }} />
        <button type="button" onClick={() => copy("snippet", snippet)} style={smallBtn}>{copied === "snippet" ? "Copied ✓" : "Copy code"}</button>
        <div style={{ fontSize: 11, color: "#64748b" }}>Paste it just before <code>&lt;/body&gt;</code> on your website.</div>
      </div>}
  </div>
}
