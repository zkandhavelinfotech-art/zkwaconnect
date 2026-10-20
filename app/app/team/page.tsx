"use client"
import { useEffect, useState } from "react"

type Role = "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER"
type Member = { id: string; name: string; email: string; lastLoginAt: string | null; role: Role; status: string; joinedAt: string; openChats: number; canManage: boolean }
type Data = { me: { userId: string; role: Role }; roles: { role: Role; label: string; summary: string }[]; seats: { used: number; limit: number | null; plan: string | null }
  members: Member[]; invites: { id: string; email: string; role: Role; createdAt: string; expiresAt: string }[] }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginBottom: 18 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid #cbd5d3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#183633", background: "#fff" }
const primary: React.CSSProperties = { border: 0, borderRadius: 6, padding: "9px 14px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }
const link: React.CSSProperties = { border: 0, background: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }
const ROLE_COLORS: Record<Role, string> = { OWNER: "#7c3aed", ADMIN: "#1d4ed8", MANAGER: "#0f766e", AGENT: "#475569", VIEWER: "#94a3b8" }

export default function TeamPage() {
  const [data, setData] = useState<Data | null>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("AGENT")
  const [invite, setInvite] = useState<{ email: string; link: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function load() {
    const response = await fetch("/api/team")
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setData(body)
  }
  useEffect(() => { load() }, [])

  async function call(method: string, body?: unknown, query = "") {
    setError(""); setNotice("")
    const response = await fetch(`/api/team${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    const result = await response.json()
    if (!response.ok) { setError(result.error); return null }
    setNotice(result.message); await load(); return result
  }

  if (!data) return <div style={{ padding: 24, color: error ? "#9f2d22" : "#64748b" }}>{error || "Loading team…"}</div>
  const canInvite = ["OWNER", "ADMIN"].includes(data.me.role)
  const assignable = data.roles.filter(item => data.me.role === "OWNER" || !["OWNER", "ADMIN"].includes(item.role))
  const full = data.seats.limit !== null && data.seats.used >= data.seats.limit

  return <div style={{ maxWidth: 980 }}>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Team</h1>
    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 18px" }}>Invite teammates and choose what each person can do.
      {" "}Seats: <strong>{data.seats.used}{data.seats.limit !== null ? ` of ${data.seats.limit}` : ""}</strong>{data.seats.plan ? ` on ${data.seats.plan}` : ""} (members + pending invites).</p>
    {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

    {canInvite && <section style={card}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "0 0 10px" }}>Invite a teammate</h2>
      {full ? <p style={{ fontSize: 13, color: "#92400e" }}>All seats on your plan are in use. <a href="/app/billing" style={{ color: "#075e54", fontWeight: 700 }}>Upgrade</a> or remove someone to invite more.</p> :
        <form onSubmit={async event => { event.preventDefault(); const result = await call("POST", { email, role }); if (result) { setInvite({ email, link: result.link }); setEmail(""); setCopied(false) } }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input required type="email" placeholder="teammate@company.com" value={email} onChange={event => setEmail(event.target.value)} style={{ ...input, flex: 1, minWidth: 220 }} />
          <select value={role} onChange={event => setRole(event.target.value as Role)} style={input}>{assignable.map(item => <option key={item.role} value={item.role}>{item.label}</option>)}</select>
          <button type="submit" style={primary}>Create invite</button>
        </form>}
      <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0" }}>{data.roles.find(item => item.role === role)?.summary}</p>
      {invite && <div style={{ background: "#f0faf6", border: "1px solid #b9e4d1", borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>
        Send this link to <strong>{invite.email}</strong> (works once, for 7 days):
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <code style={{ flex: 1, minWidth: 240, background: "#fff", border: "1px solid #d7e2df", borderRadius: 6, padding: "7px 9px", fontSize: 12, wordBreak: "break-all" }}>{invite.link}</code>
          <button onClick={async () => { try { await navigator.clipboard.writeText(invite.link); setCopied(true) } catch { /* blocked */ } }} style={primary}>{copied ? "Copied ✓" : "Copy"}</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`You're invited to join our ZKWAConnect workspace: ${invite.link}`)}`} target="_blank" rel="noreferrer"
            style={{ ...primary, background: "#25d366", color: "#053d36", textDecoration: "none" }}>Share on WhatsApp</a>
          <a href={`mailto:${invite.email}?subject=${encodeURIComponent("Join our ZKWAConnect workspace")}&body=${encodeURIComponent(`Hi,\n\nJoin our WhatsApp team inbox on ZKWAConnect:\n${invite.link}\n`)}`}
            style={{ ...primary, background: "#fff", color: "#075e54", border: "1px solid #cbd5d3", textDecoration: "none" }}>Email it</a>
        </div>
      </div>}
    </section>}

    <section style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
        <thead style={{ background: "#f7faf9", color: "#647b77", fontSize: 12 }}><tr>{["Member", "Role", "Open chats", "Last sign-in", ""].map(text => <th key={text} style={{ padding: 11, fontWeight: 600 }}>{text}</th>)}</tr></thead>
        <tbody>
          {data.members.map(member => <tr key={member.id} style={{ borderTop: "1px solid #edf1f0", opacity: member.status === "SUSPENDED" ? .55 : 1 }}>
            <td style={{ padding: 11 }}><div style={{ fontWeight: 700, color: "#183633" }}>{member.name}{member.id === data.me.userId ? " (you)" : ""}</div><div style={{ fontSize: 12, color: "#64748b" }}>{member.email}</div></td>
            <td style={{ padding: 11 }}>{member.canManage ? <select value={member.role} onChange={event => call("PATCH", { userId: member.id, role: event.target.value })} style={{ ...input, padding: "5px 8px" }}>
              {(data.me.role === "OWNER" ? data.roles : data.roles.filter(item => !["OWNER", "ADMIN"].includes(item.role))).map(item => <option key={item.role} value={item.role}>{item.label}</option>)}</select>
              : <span style={{ color: ROLE_COLORS[member.role], fontWeight: 700 }}>{data.roles.find(item => item.role === member.role)?.label}</span>}
              {member.status === "SUSPENDED" && <span style={{ marginLeft: 6, fontSize: 11, color: "#991b1b" }}>suspended</span>}</td>
            <td style={{ padding: 11 }}>{member.openChats}</td>
            <td style={{ padding: 11, color: "#64748b", fontSize: 12 }}>{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "never"}</td>
            <td style={{ padding: 11, whiteSpace: "nowrap", textAlign: "right" }}>{member.canManage && <span style={{ display: "inline-flex", gap: 12 }}>
              <button onClick={() => call("PATCH", { userId: member.id, status: member.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" })} style={{ ...link, color: "#92400e" }}>{member.status === "SUSPENDED" ? "Restore" : "Suspend"}</button>
              <button onClick={() => window.confirm(`Remove ${member.name} from this workspace?`) && call("DELETE", undefined, `?userId=${member.id}`)} style={{ ...link, color: "#b91c1c" }}>Remove</button>
            </span>}</td>
          </tr>)}
          {data.invites.map(item => <tr key={item.id} style={{ borderTop: "1px solid #edf1f0", background: "#fcfdfd" }}>
            <td style={{ padding: 11 }}><div style={{ fontWeight: 700, color: "#64748b" }}>{item.email}</div><div style={{ fontSize: 12, color: "#94a3b8" }}>Invite pending · expires {new Date(item.expiresAt).toLocaleDateString("en-IN")}</div></td>
            <td style={{ padding: 11, color: ROLE_COLORS[item.role] }}>{data.roles.find(role => role.role === item.role)?.label}</td><td /><td />
            <td style={{ padding: 11, textAlign: "right" }}>{canInvite && <button onClick={() => call("DELETE", undefined, `?invite=${item.id}`)} style={{ ...link, color: "#b91c1c" }}>Revoke</button>}</td>
          </tr>)}
        </tbody>
      </table></div>
    </section>

    <section style={card}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 8px" }}>What each role can do</h2>
      {data.roles.map(item => <div key={item.role} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 13 }}>
        <strong style={{ minWidth: 80, color: ROLE_COLORS[item.role] }}>{item.label}</strong><span style={{ color: "#475569" }}>{item.summary}</span></div>)}
    </section>
  </div>
}
