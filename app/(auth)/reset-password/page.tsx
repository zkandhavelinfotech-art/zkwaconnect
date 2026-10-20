"use client"
import { useEffect, useState } from "react"
import { AuthCard, authButton, authError, authNotice } from "@/components/AuthCard"

// Opened from the email link (?token=…) or after choosing "Enter WhatsApp code" (?email=…).
export default function ResetPasswordPage() {
  const [token, setToken] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setToken(params.get("token") || ""); setEmail(params.get("email") || "")
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) { setError("The two passwords don't match."); return }
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, password } : { email, code, password }) })
      const body = await response.json()
      if (!response.ok) setError(body.error || "Couldn't change the password.")
      else setDone(body.message)
    } catch { setError("Network error. Please try again.") }
    setBusy(false)
  }

  return <AuthCard title="Choose a new password" subtitle={token ? "Use at least 8 characters. You'll be signed out on other devices." : "Enter the 6-digit code we sent to your WhatsApp, then your new password."}>
    {done ? <>
      <div role="status" style={authNotice}>{done}</div>
      <a href="/login" style={{ ...authButton(false), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>Sign in →</a>
    </> : <form onSubmit={submit}>
      {!token && <>
        <label className="form-label" htmlFor="email">Email address</label>
        <input id="email" className="form-input" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} style={{ marginBottom: 14 }} />
        <label className="form-label" htmlFor="code">WhatsApp code</label>
        <input id="code" className="form-input" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} placeholder="· · · · · ·" value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, ""))} style={{ marginBottom: 14, fontFamily: "monospace", fontSize: 20, letterSpacing: 8, textAlign: "center" }} />
      </>}
      <label className="form-label" htmlFor="password">New password</label>
      <input id="password" className="form-input" type="password" required minLength={8} autoComplete="new-password" value={password}
        onChange={event => setPassword(event.target.value)} style={{ marginBottom: 14 }} />
      <label className="form-label" htmlFor="confirm">Confirm new password</label>
      <input id="confirm" className="form-input" type="password" required minLength={8} autoComplete="new-password" value={confirm}
        onChange={event => setConfirm(event.target.value)} style={{ marginBottom: 16 }} />
      {error && <div role="alert" style={authError}>{error}</div>}
      <button type="submit" disabled={busy} style={authButton(busy)}>{busy ? "Saving…" : "Change password"}</button>
    </form>}
    <div style={{ textAlign: "center", fontSize: 13 }}><a href="/forgot-password" style={{ color: "#075E54", fontWeight: 600, textDecoration: "none" }}>Request a new link or code</a></div>
  </AuthCard>
}
