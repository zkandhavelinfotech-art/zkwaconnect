"use client"
import { use, useEffect, useState } from "react"

type Invite = { workspace: string; email: string; roleLabel: string; roleSummary: string; signedInAs: string | null; accountExists: boolean }

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/invitations/${token}`).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setInvite(body) })
      .catch(reason => setError(reason.message))
  }, [token])

  async function act(body: Record<string, string>) {
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/invitations/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      window.location.href = result.redirect
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong.") } finally { setBusy(false) }
  }

  const here = `/invite/${token}`
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5d3", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginTop: 6 }
  const button: React.CSSProperties = { width: "100%", border: 0, borderRadius: 8, padding: "12px 16px", background: "#075e54", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 14 }
  const signedInMatches = invite?.signedInAs?.toLowerCase() === invite?.email
  return <main style={{ minHeight: "100vh", background: "#efeae2", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "DM Sans,system-ui,sans-serif" }}>
    <section style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 10px 30px rgba(0,0,0,.08)" }}>
      <img src="/icons/zkwaconnect-icon-96.png" alt="ZKWAConnect" width={48} height={48} style={{ borderRadius: 12 }} />
      {!invite ? <p style={{ color: error ? "#9f2d22" : "#64748b", marginTop: 16 }}>{error || "Loading invite…"}</p> : <>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 20, margin: "14px 0 6px", color: "#0f172a" }}>Join {invite.workspace}</h1>
        <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>You&apos;re invited as <strong>{invite.roleLabel}</strong> — {invite.roleSummary.charAt(0).toLowerCase() + invite.roleSummary.slice(1)}</p>
        <p style={{ fontSize: 13, color: "#64748b" }}>Invite for <strong>{invite.email}</strong></p>
        {error && <div role="alert" style={{ background: "#fff1f0", color: "#9f2d22", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{error}</div>}
        {signedInMatches ? <button disabled={busy} onClick={() => act({ action: "accept" })} style={button}>{busy ? "Joining…" : `Join ${invite.workspace}`}</button>
          : invite.signedInAs ? <p style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: 10 }}>You&apos;re signed in as {invite.signedInAs}.
            <a href={`/api/auth/logout?next=${encodeURIComponent(`/login?from=${here}`)}`} style={{ color: "#075e54", fontWeight: 700, marginLeft: 4 }}>Sign out</a> and sign in as {invite.email} to accept.</p>
          : invite.accountExists ? <a href={`/login?from=${encodeURIComponent(here)}`} style={{ ...button, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>Sign in to accept</a>
          : <form onSubmit={event => { event.preventDefault(); act({ action: "register", name, password }) }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginTop: 12 }}>Your name<input required minLength={2} value={name} onChange={event => setName(event.target.value)} style={input} /></label>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginTop: 12 }}>Create a password<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} style={input} /></label>
            <button disabled={busy} type="submit" style={button}>{busy ? "Creating account…" : "Create account & join"}</button>
          </form>}
      </>}
    </section>
  </main>
}
