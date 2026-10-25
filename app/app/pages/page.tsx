"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PAGE_TYPES, type PageType } from "@/lib/pages/types"

type Row = { id: string; type: PageType; slug: string; title: string; status: string; views: number; clicks: number; chats: number; publishedAt: string | null; updatedAt: string }
type Template = { id: string; type: PageType; label: string; emoji: string; description: string }
type Data = { pages: Row[]; allowance: { limit: number | null; used: number; canCreate: boolean; poweredBy: boolean; planName: string | null }; templates: Template[]; base: string }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18 }
const btn = (bg = "#075e54", color = "#fff"): React.CSSProperties => ({ border: bg === "#fff" ? "1px solid #cbd5e1" : 0, borderRadius: 7, padding: "8px 12px", background: bg, color, fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" })

export default function PagesListPage() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState<PageType | null>(null)
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState("")

  async function load() {
    const response = await fetch("/api/pages")
    const body = await response.json()
    if (response.ok) setData(body); else setError(body.error)
  }
  useEffect(() => { load() }, [])

  async function create(templateId: string) {
    setBusy(templateId); setError("")
    const response = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, title: title || undefined }) })
    const body = await response.json()
    if (response.ok) router.push(`/app/pages/${body.id}`); else { setError(body.error); setBusy("") }
  }
  async function action(id: string, method: string, body?: unknown) {
    if (method === "DELETE" && !window.confirm("Delete this page? Its address stops working.")) return
    const response = await fetch(`/api/pages/${id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    const result = await response.json()
    if (!response.ok) setError(result.error); else { if (result.id && method === "POST") router.push(`/app/pages/${result.id}`); load() }
  }

  const allowance = data?.allowance
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div><h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, margin: 0 }}>WhatsApp Pages</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0", maxWidth: 680 }}>Build a mini-website, link-in-bio or campaign landing page where every button opens a WhatsApp chat with you — with the message pre-filled, tracked, and ready for your chatbot.</p></div>
      {allowance && <div style={{ fontSize: 12, color: "#475569" }}>{allowance.used} of {allowance.limit ?? "unlimited"} page{allowance.limit === 1 ? "" : "s"} used{allowance.poweredBy ? " · Free plan shows “Powered by ZKWAConnect”" : ""}
        {!allowance.canCreate && <> · <a href="/app/billing" style={{ color: "#075e54", fontWeight: 700 }}>Upgrade for more</a></>}</div>}
    </div>
    {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}

    <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", marginBottom: 18 }}>
      {(Object.keys(PAGE_TYPES) as PageType[]).map(type => <button key={type} type="button" disabled={!allowance?.canCreate} onClick={() => { setCreating(type); setTitle("") }}
        style={{ ...card, textAlign: "left", cursor: allowance?.canCreate ? "pointer" : "not-allowed", opacity: allowance?.canCreate === false ? .6 : 1, borderColor: creating === type ? "#075e54" : "#e2e8f0", borderWidth: creating === type ? 2 : 1 }}>
        <div style={{ fontSize: 26 }}>{type === "SITE" ? "🏪" : type === "LINKS" ? "🔗" : "🎯"}</div>
        <div style={{ fontWeight: 800, margin: "6px 0 4px" }}>+ New {PAGE_TYPES[type].label.toLowerCase()}</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{PAGE_TYPES[type].description}</div></button>)}
    </section>

    {creating && <section style={{ ...card, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Choose a starting design — {PAGE_TYPES[creating].label}</h2>
        <button type="button" style={btn("#fff", "#475569")} onClick={() => setCreating(null)}>Cancel</button></div>
      {creating !== "SITE" && <label style={{ display: "block", fontSize: 12, fontWeight: 700, margin: "12px 0 0" }}>Page name (e.g. Diwali offer)
        <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} style={{ display: "block", width: "100%", maxWidth: 360, marginTop: 4, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 7 }} /></label>}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,210px),1fr))", marginTop: 14 }}>
        {data?.templates.filter(template => template.type === creating).map(template => <button key={template.id} type="button" disabled={busy !== ""} onClick={() => create(template.id)}
          style={{ textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, background: "#f8fafc", cursor: "pointer" }}>
          <div style={{ fontSize: 24 }}>{template.emoji}</div><div style={{ fontWeight: 700, margin: "4px 0" }}>{busy === template.id ? "Creating…" : template.label}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{template.description}</div></button>)}
      </div>
    </section>}

    <section style={{ ...card, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
        <thead style={{ background: "#f8fafc", color: "#64748b", fontSize: 12 }}><tr>{["Page", "Address", "Status", "Views", "WhatsApp taps (30d)", "Chats started", ""].map(text => <th key={text} style={{ padding: 11, fontWeight: 600 }}>{text}</th>)}</tr></thead>
        <tbody>{data?.pages.map(page => <tr key={page.id} style={{ borderTop: "1px solid #eef2f6" }}>
          <td style={{ padding: 11 }}><strong>{page.title}</strong><div style={{ fontSize: 11, color: "#64748b" }}>{PAGE_TYPES[page.type]?.label}</div></td>
          <td style={{ padding: 11 }}>{page.status === "PUBLISHED" ? <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer" style={{ color: "#075e54" }}>/p/{page.slug} ↗</a> : <span style={{ color: "#94a3b8" }}>/p/{page.slug}</span>}</td>
          <td style={{ padding: 11, fontWeight: 700, color: page.status === "PUBLISHED" ? "#15803d" : "#b45309" }}>{page.status === "PUBLISHED" ? "Live" : "Draft"}</td>
          <td style={{ padding: 11 }}>{page.views}</td><td style={{ padding: 11 }}>{page.clicks}</td>
          <td style={{ padding: 11 }}>{page.chats}{page.clicks ? <span style={{ color: "#64748b" }}> ({Math.round(page.chats / page.clicks * 100)}%)</span> : ""}</td>
          <td style={{ padding: 11, whiteSpace: "nowrap" }}><a href={`/app/pages/${page.id}`} style={btn()}>Edit</a>{" "}
            <button type="button" style={btn("#fff", "#334155")} onClick={() => action(page.id, "POST", { action: "duplicate" })}>Duplicate</button>{" "}
            <button type="button" style={btn("#fff", "#b91c1c")} onClick={() => action(page.id, "DELETE")}>Delete</button></td>
        </tr>)}</tbody>
      </table>
      {data && !data.pages.length && <div style={{ padding: 18, fontSize: 13, color: "#64748b" }}>No pages yet — pick a page type above to start.</div>}
    </section>
  </div>
}
