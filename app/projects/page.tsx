"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/Logo"
import { ProfileMenu } from "@/components/ProfileMenu"

type Workspace = {
  id: string; name: string; role: string; status: string; createdAt: string
  plan: { name: string; status: string; renewsOn: string | null } | null
  whatsapp: string | null; setupComplete: boolean; contacts: number
}
type Data = { user: { name: string; email: string; isPlatformAdmin: boolean }; activeId: string | null; workspaces: Workspace[] }

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14 }

export default function ProjectsPage() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [gstin, setGstin] = useState("")
  const [busy, setBusy] = useState("")

  useEffect(() => {
    fetch("/api/workspaces").then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load your projects.")
      setData(body)
      if (!body.workspaces.length) setCreating(true)
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load your projects."))
  }, [])

  async function open(id: string) {
    setBusy(id); setError("")
    try {
      const response = await fetch("/api/workspaces/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: id }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not open the project.")
      router.push(body.redirect)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open the project."); setBusy("") }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy("new"); setError("")
    try {
      const response = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), gstin: gstin.trim() }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create the project.")
      router.push(body.redirect)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the project."); setBusy("") }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#efeae2", fontFamily: "DM Sans,sans-serif", color: "#0f172a" }}>
      <header style={{ height: 60, background: "#008069", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(16px,4vw,40px)",
        boxShadow: "0 2px 8px rgba(0,64,52,.25)" }}>
        <Logo size={34} showText />
        {data && <ProfileMenu name={data.user.name} email={data.user.email} />}
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px clamp(16px,4vw,40px) 60px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, fontWeight: 700, color: "#054640", margin: 0 }}>All projects</h1>
            <p style={{ fontSize: 14, color: "#475569", margin: "6px 0 0" }}>
              {data ? `Welcome${data.user.name ? `, ${data.user.name.split(" ")[0]}` : ""}! ` : ""}Each project is a separate business with its own WhatsApp number, contacts, campaigns and plan.</p>
          </div>
          {data && data.workspaces.length > 0 && !creating && <button type="button" onClick={() => setCreating(true)} style={{ border: 0, borderRadius: 8,
            padding: "11px 18px", background: "#25D366", color: "#053d36", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>+ Create new project</button>}
        </div>

        {error && <div role="alert" style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        {creating && <form onSubmit={create} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 22, marginBottom: 20, boxShadow: "0 1px 3px rgba(11,20,26,.08)" }}>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 17, margin: "0 0 4px" }}>{data?.workspaces.length ? "Create a new project" : "Create your first project"}</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>Use one project per business or brand. You&apos;ll connect its WhatsApp number next.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
            <label><span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Business / project name</span>
              <input required minLength={2} maxLength={100} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="ZK SaaS Products" style={field} /></label>
            <label><span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>GSTIN (optional)</span>
              <input maxLength={15} value={gstin} onChange={event => setGstin(event.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" style={{ ...field, fontFamily: "monospace" }} /></label>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="submit" disabled={busy === "new" || name.trim().length < 2} style={{ border: 0, borderRadius: 8, padding: "11px 18px", background: "#054640", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: busy === "new" ? .7 : 1 }}>{busy === "new" ? "Creating…" : "Create & set up WhatsApp →"}</button>
            {Boolean(data?.workspaces.length) && <button type="button" onClick={() => setCreating(false)} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 16px",
              background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>}
          </div>
        </form>}

        {!data && !error ? <p style={{ fontSize: 14, color: "#475569" }}>Loading your projects…</p> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,320px),1fr))", gap: 16 }}>
            {data?.workspaces.map(workspace => {
              const current = workspace.id === data.activeId
              return <div key={workspace.id} style={{ background: "#fff", borderRadius: 14, border: `${current ? 2 : 1}px solid ${current ? "#25D366" : "#e2e8f0"}`,
                padding: 20, boxShadow: "0 1px 3px rgba(11,20,26,.08)", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(145deg,#128C7E,#075E54)", color: "#fff", display: "grid", placeItems: "center",
                    fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{workspace.name[0]?.toUpperCase()}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{workspace.role.toLowerCase()}</div>
                  </div>
                  {current && <span style={{ fontSize: 10, fontWeight: 800, background: "#dcf8c6", color: "#054640", borderRadius: 20, padding: "3px 9px" }}>CURRENT</span>}
                </div>
                <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155", flex: 1 }}>
                  <div>📱 {workspace.whatsapp ? <strong>{workspace.whatsapp}</strong> : <span style={{ color: "#b45309" }}>WhatsApp not connected</span>}</div>
                  <div>💎 {workspace.plan ? <>{workspace.plan.name} <span style={{ color: "#64748b" }}>({workspace.plan.status === "TRIAL" ? "trial" : "monthly"})</span></> : "No plan"}
                    {workspace.plan?.renewsOn && <span style={{ color: "#64748b" }}> · {workspace.plan.status === "TRIAL" ? "ends" : "renews"} {new Date(workspace.plan.renewsOn).toLocaleDateString()}</span>}</div>
                  <div>👥 {workspace.contacts.toLocaleString()} contact{workspace.contacts === 1 ? "" : "s"}</div>
                </div>
                <button type="button" onClick={() => open(workspace.id)} disabled={Boolean(busy)} style={{ marginTop: 16, border: 0, borderRadius: 8, padding: "11px 14px",
                  background: workspace.setupComplete ? "#054640" : "#25D366", color: workspace.setupComplete ? "#fff" : "#053d36", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  opacity: busy && busy !== workspace.id ? .6 : 1 }}>
                  {busy === workspace.id ? "Opening…" : workspace.setupComplete ? "Open dashboard →" : "Continue WhatsApp setup →"}</button>
              </div>
            })}
          </div>}
      </div>
    </main>
  )
}
