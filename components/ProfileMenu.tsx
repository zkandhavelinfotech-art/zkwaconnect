"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

// Avatar button with My profile / All projects / Sign out, used in the app top bar and on the Projects page.
export function ProfileMenu({ name, email, workspace }: { name: string; email: string; workspace?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape) }
  }, [open])

  const item: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: 0, background: "none",
    fontSize: 13, color: "#0f172a", textDecoration: "none", cursor: "pointer", textAlign: "left", borderRadius: 8 }
  return <div ref={ref} style={{ position: "relative" }}>
    <button type="button" onClick={() => setOpen(value => !value)} aria-haspopup="menu" aria-expanded={open} aria-label="Profile menu" title={name}
      style={{ width: 36, height: 36, borderRadius: "50%", background: "#dcf8c6", color: "#054640", border: "2px solid rgba(255,255,255,.7)",
        display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{(name || email)[0]?.toUpperCase() || "Z"}</button>
    {open && <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 250, background: "#fff", borderRadius: 12,
      boxShadow: "0 12px 32px rgba(11,20,26,.22)", border: "1px solid #e2e8f0", padding: 6, zIndex: 80 }}>
      <div style={{ padding: "10px 14px 12px", borderBottom: "1px solid #f1f5f9", marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
        {workspace && <div style={{ fontSize: 11, color: "#075e54", marginTop: 4 }}>Project: <strong>{workspace}</strong></div>}
      </div>
      <a role="menuitem" href="/app/profile" style={item} onMouseOver={e => (e.currentTarget.style.background = "#f0f2f5")} onMouseOut={e => (e.currentTarget.style.background = "none")}>👤 My profile</a>
      <a role="menuitem" href="/projects" style={item} onMouseOver={e => (e.currentTarget.style.background = "#f0f2f5")} onMouseOut={e => (e.currentTarget.style.background = "none")}>🗂️ All projects</a>
      <a role="menuitem" href="/app/billing" style={item} onMouseOver={e => (e.currentTarget.style.background = "#f0f2f5")} onMouseOut={e => (e.currentTarget.style.background = "none")}>💎 Plans &amp; billing</a>
      <button role="menuitem" type="button" style={{ ...item, color: "#b91c1c" }} onMouseOver={e => (e.currentTarget.style.background = "#fef2f2")}
        onMouseOut={e => (e.currentTarget.style.background = "none")}
        onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login") }}>🚪 Sign out</button>
    </div>}
  </div>
}
