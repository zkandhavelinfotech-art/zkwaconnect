"use client"
import { useEffect, useState } from "react"

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, boxShadow: "0 1px 3px rgba(11,20,26,.06)", marginTop: 16 }
const field: React.CSSProperties = { boxSizing: "border-box", minHeight: 42, padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, width: "100%", maxWidth: 260 }
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 16px", background: "#054640", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }
const ghost: React.CSSProperties = { ...button, background: "transparent", color: "#475569", border: "1px solid #cbd5e1" }

// Profile → two-factor sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy …).
export function TwoFactorSettings() {
  const [status, setStatus] = useState<{ enabled: boolean; recoveryLeft: number } | null>(null)
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [mode, setMode] = useState<"" | "disable" | "recovery">("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetch("/api/profile/two-factor").then(response => response.ok ? response.json() : null).then(setStatus).catch(() => null)
  useEffect(() => { load() }, [])

  async function call(body: Record<string, string>) {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch("/api/profile/two-factor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) { setMessage({ ok: false, text: result.error }); return null }
      if (result.message) setMessage({ ok: true, text: result.message })
      return result
    } finally { setBusy(false) }
  }

  async function start() { const result = await call({ action: "setup" }); if (result) { setSetup(result); setCode("") } }
  async function enable(event: React.FormEvent) {
    event.preventDefault()
    const result = await call({ action: "enable", code })
    if (result) { setSetup(null); setCodes(result.recoveryCodes); setCode(""); load() }
  }
  async function submitMode(event: React.FormEvent) {
    event.preventDefault()
    const result = await call(mode === "disable" ? { action: "disable", password, code } : { action: "recovery", code })
    if (result) { if (result.recoveryCodes) setCodes(result.recoveryCodes); setMode(""); setCode(""); setPassword(""); load() }
  }

  return <section style={card}>
    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "0 0 4px", color: "#102a2a" }}>🔐 Two-factor sign-in</h2>
    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px", lineHeight: 1.5 }}>
      After your password, sign-in also asks for a 6-digit code from an authenticator app on your phone. Strongly recommended for owners, admins and super admins.</p>
    {status && <div style={{ fontSize: 13, marginBottom: 12 }}>Status: {status.enabled
      ? <strong style={{ color: "#15803d" }}>On</strong> : <strong style={{ color: "#b45309" }}>Off</strong>}
      {status.enabled && <span style={{ color: "#64748b" }}> · {status.recoveryLeft} recovery code{status.recoveryLeft === 1 ? "" : "s"} left</span>}</div>}

    {codes && <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <strong style={{ fontSize: 13 }}>Save these recovery codes now</strong>
      <p style={{ fontSize: 12, color: "#92400e", margin: "4px 0 8px" }}>Each one signs you in once if you lose your phone. They won&apos;t be shown again.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6, fontFamily: "monospace", fontSize: 14 }}>{codes.map(item => <span key={item}>{item}</span>)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" style={ghost} onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy</button>
        <button type="button" style={button} onClick={() => setCodes(null)}>I&apos;ve saved them</button>
      </div>
    </div>}

    {status && !status.enabled && !setup && <button type="button" style={button} disabled={busy} onClick={start}>Turn on two-factor sign-in</button>}
    {setup && <form onSubmit={enable}>
      <ol style={{ fontSize: 13, color: "#334155", paddingLeft: 18, lineHeight: 1.6, margin: "0 0 10px" }}>
        <li>Open your authenticator app and scan this QR code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ display: "block", border: "1px solid #e2e8f0", borderRadius: 8 }} />
      <div style={{ fontSize: 12, color: "#64748b", margin: "8px 0 12px", wordBreak: "break-all" }}>Can&apos;t scan? Enter this key: <code>{setup.secret}</code></div>
      <input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))}
        placeholder="123456" style={{ ...field, fontFamily: "monospace", letterSpacing: 4 }} required />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="submit" style={button} disabled={busy}>Verify &amp; turn on</button>
        <button type="button" style={ghost} onClick={() => setSetup(null)}>Cancel</button>
      </div>
    </form>}

    {status?.enabled && !mode && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={ghost} onClick={() => setMode("recovery")}>New recovery codes</button>
      <button type="button" style={{ ...ghost, color: "#b91c1c", borderColor: "#fecaca" }} onClick={() => setMode("disable")}>Turn off</button>
    </div>}
    {mode && <form onSubmit={submitMode} style={{ display: "grid", gap: 8, maxWidth: 300 }}>
      {mode === "disable" && <input type="password" aria-label="Your password" placeholder="Your password" autoComplete="current-password" value={password}
        onChange={event => setPassword(event.target.value)} style={field} required />}
      <input aria-label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={mode === "disable" ? 11 : 6} value={code}
        onChange={event => setCode(event.target.value)} placeholder={mode === "disable" ? "Code or recovery code" : "6-digit code"} style={field} required />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={button} disabled={busy}>{mode === "disable" ? "Turn off" : "Create new codes"}</button>
        <button type="button" style={ghost} onClick={() => { setMode(""); setCode(""); setPassword("") }}>Cancel</button>
      </div>
    </form>}
    {message && <div role={message.ok ? "status" : "alert"} style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 13,
      background: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#15803d" : "#991b1b" }}>{message.text}</div>}
  </section>
}
