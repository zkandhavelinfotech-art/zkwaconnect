"use client"
import { useEffect, useState } from "react"
import { NotificationSettings } from "@/components/pwa/Pwa"
import { TwoFactorSettings } from "@/components/TwoFactorSettings"

type Profile = { user: { name: string; email: string; phone: string | null; createdAt: string; lastLoginAt: string | null }
  workspaces: { id: string; name: string; role: string }[] }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, boxShadow: "0 1px 3px rgba(11,20,26,.06)" }
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#475569", margin: "12px 0 6px" }
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 42, padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14 }
const button: React.CSSProperties = { marginTop: 16, border: 0, borderRadius: 8, padding: "10px 18px", background: "#054640", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }

function Message({ value }: { value: { ok: boolean; text: string } | null }) {
  if (!value) return null
  return <div role={value.ok ? "status" : "alert"} style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 13,
    background: value.ok ? "#f0fdf4" : "#fef2f2", color: value.ok ? "#15803d" : "#991b1b" }}>{value.text}</div>
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState("")
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/profile").then(response => response.json()).then((body: Profile) => {
      setProfile(body); setName(body.user.name); setPhone(body.user.phone || "")
    }).catch(() => setProfileMessage({ ok: false, text: "Could not load your profile." }))
  }, [])

  async function call(method: "PATCH" | "POST", payload: unknown, setMessage: (value: { ok: boolean; text: string }) => void) {
    const response = await fetch("/api/profile", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const body = await response.json()
    setMessage({ ok: response.ok, text: body.message || body.error || "Done." })
    return response.ok
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setBusy("profile")
    await call("PATCH", { name, phone }, setProfileMessage).finally(() => setBusy(""))
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    if (next !== confirm) { setPasswordMessage({ ok: false, text: "The new passwords don't match." }); return }
    setBusy("password")
    const ok = await call("POST", { currentPassword: current, newPassword: next }, setPasswordMessage).finally(() => setBusy(""))
    if (ok) { setCurrent(""); setNext(""); setConfirm("") }
  }

  return <div>
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 700, margin: 0 }}>My profile</h1>
      <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>Your personal login details. They apply to every project you belong to.</p>
    </div>
    {!profile ? <p style={{ fontSize: 13, color: "#475569" }}>Loading…</p> :
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 16, alignItems: "start" }}>
      <form onSubmit={saveProfile} style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "#25D366", color: "#054640", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800 }}>
            {(name || profile.user.email)[0]?.toUpperCase()}</span>
          <div><div style={{ fontSize: 17, fontWeight: 700 }}>{profile.user.name}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>{profile.user.email}</div></div>
        </div>
        <label style={label} htmlFor="name">Full name</label>
        <input id="name" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} style={field} />
        <label style={label} htmlFor="email">Email (used to sign in)</label>
        <input id="email" value={profile.user.email} readOnly style={{ ...field, background: "#f8fafc", color: "#64748b" }} />
        <label style={label} htmlFor="phone">WhatsApp mobile number <span style={{ fontWeight: 400, color: "#94a3b8" }}>(for password reset codes)</span></label>
        <input id="phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+91 98765 43210" style={field} />
        <button type="submit" disabled={busy === "profile"} style={button}>{busy === "profile" ? "Saving…" : "Save profile"}</button>
        <Message value={profileMessage} />
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 14 }}>Member since {new Date(profile.user.createdAt).toLocaleDateString()}
          {profile.user.lastLoginAt && ` · last sign-in ${new Date(profile.user.lastLoginAt).toLocaleString()}`}</div>
      </form>

      <div style={{ display: "grid", gap: 16 }}>
        <form onSubmit={changePassword} style={card}>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: 0 }}>Change password</h2>
          <label style={label} htmlFor="current">Current password</label>
          <input id="current" type="password" autoComplete="current-password" required value={current} onChange={event => setCurrent(event.target.value)} style={field} />
          <label style={label} htmlFor="new">New password</label>
          <input id="new" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={event => setNext(event.target.value)} style={field} />
          <label style={label} htmlFor="confirm">Confirm new password</label>
          <input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={event => setConfirm(event.target.value)} style={field} />
          <button type="submit" disabled={busy === "password"} style={button}>{busy === "password" ? "Changing…" : "Change password"}</button>
          <Message value={passwordMessage} />
        </form>

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: 0 }}>My projects</h2>
            <a href="/projects" style={{ fontSize: 13, fontWeight: 700, color: "#075e54", textDecoration: "none" }}>All projects →</a>
          </div>
          {profile.workspaces.map(item => <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: "1px solid #f1f5f9", fontSize: 14 }}>
            <span>{item.name}</span><span style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{item.role.toLowerCase()}</span></div>)}
        </div>
      </div>
    </div>}
    <TwoFactorSettings />
    <NotificationSettings />
  </div>
}
