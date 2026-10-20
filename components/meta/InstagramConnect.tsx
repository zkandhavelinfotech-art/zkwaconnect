"use client"
import { useEffect, useState } from "react"

type Account = { id: string; pageId: string; pageName: string; username: string; pictureUrl: string | null; status: string }
type Available = { pageId: string; pageName: string; username: string | null; pictureUrl: string | null }

// Meta Account → Instagram: connect an Instagram professional account (via its Facebook Page) to the inbox.
export function InstagramConnect() {
  const [data, setData] = useState<{ accounts: Account[]; available: Available[]; error: string | null } | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState("")

  const load = () => fetch("/api/instagram").then(response => response.json()).then(body => setData(body.accounts ? body : { accounts: [], available: [], error: body.error }))
  useEffect(() => { load() }, [])

  async function act(method: string, body?: unknown, query = "") {
    setBusy(query || JSON.stringify(body)); setMessage("")
    const response = await fetch(`/api/instagram${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    const result = await response.json()
    setMessage(result.message || result.error); setBusy(""); load()
  }

  const avatar = (url: string | null) => url ? <img src={url} alt="" width={36} height={36} style={{ borderRadius: "50%" }} />
    : <span style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(45deg,#f58529,#dd2a7b,#8134af)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>IG</span>

  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginTop: 18 }}>
    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "0 0 4px", color: "#102a2a" }}>📸 Instagram inbox</h2>
    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Reply to Instagram DMs from the same inbox as WhatsApp. Needs an Instagram professional account linked to your Facebook Page,
      and <em>Allow access to messages</em> turned on in the Instagram app (Settings → Messages → Connected tools).</p>
    {message && <div role="status" style={{ fontSize: 13, background: "#f1f5f9", borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>{message}</div>}
    {!data ? <p style={{ fontSize: 12, color: "#64748b" }}>Loading…</p> : <>
      {data.accounts.map(account => <div key={account.id} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 8 }}>
        {avatar(account.pictureUrl)}<div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>@{account.username}</div><div style={{ fontSize: 12, color: "#64748b" }}>Page: {account.pageName}</div></div>
        {account.status === "CONNECTED" ? <><span style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>● Connected</span>
          <button disabled={Boolean(busy)} onClick={() => window.confirm(`Disconnect @${account.username}?`) && act("DELETE", undefined, `?id=${account.id}`)}
            style={{ border: "1px solid #cbd5d3", background: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#b91c1c", cursor: "pointer" }}>Disconnect</button></>
          : <button disabled={Boolean(busy)} onClick={() => act("POST", { pageId: account.pageId })} style={{ border: 0, background: "#075e54", color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Reconnect</button>}
      </div>)}
      {data.available.map(page => <div key={page.pageId} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px dashed #cbd5d3", borderRadius: 8, padding: 10, marginBottom: 8 }}>
        {avatar(page.pictureUrl)}<div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>@{page.username || "instagram"}</div><div style={{ fontSize: 12, color: "#64748b" }}>Page: {page.pageName}</div></div>
        <button disabled={Boolean(busy)} onClick={() => act("POST", { pageId: page.pageId })} style={{ border: 0, background: "#075e54", color: "#fff", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Connecting…" : "Connect"}</button>
      </div>)}
      {data.error && <p style={{ fontSize: 12, color: "#92400e" }}>{data.error}</p>}
      {!data.error && !data.accounts.length && !data.available.length && <p style={{ fontSize: 12, color: "#64748b" }}>No Facebook Page with a linked Instagram professional account was found.
        Link one in Meta Business Settings → Instagram accounts, then reconnect Facebook.</p>}
    </>}
  </section>
}
