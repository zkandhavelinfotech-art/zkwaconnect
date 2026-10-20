"use client"
import { useState } from "react"
import { AuthCard, authButton, authError, authNotice } from "@/components/AuthCard"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ message: string; whatsapp: boolean; phone?: string } | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
      const body = await response.json()
      if (!response.ok) setError(body.error || "Couldn't send reset instructions.")
      else setDone(body)
    } catch { setError("Network error. Please try again.") }
    setBusy(false)
  }

  return <AuthCard title="Forgot your password?" subtitle="Enter the email you sign in with. We'll email you a reset link, and send a code to your WhatsApp if your profile has a mobile number.">
    {done ? <>
      <div role="status" style={authNotice}>{done.message}
        {done.whatsapp && <> We also sent a 6-digit code to WhatsApp {done.phone}.</>} The link and code expire in 30 minutes.</div>
      {done.whatsapp && <a href={`/reset-password?email=${encodeURIComponent(email)}`} style={{ ...authButton(false), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
        Enter WhatsApp code →</a>}
    </> : <form onSubmit={submit}>
      <label className="form-label" htmlFor="email">Email address</label>
      <input id="email" className="form-input" type="email" required autoComplete="email" placeholder="you@company.com" value={email}
        onChange={event => setEmail(event.target.value)} style={{ marginBottom: 16 }} />
      {error && <div role="alert" style={authError}>{error}</div>}
      <button type="submit" disabled={busy} style={authButton(busy)}>{busy ? "Sending…" : "Send reset instructions"}</button>
    </form>}
    <div style={{ textAlign: "center", fontSize: 13 }}><a href="/login" style={{ color: "#075E54", fontWeight: 600, textDecoration: "none" }}>← Back to sign in</a></div>
  </AuthCard>
}
