"use client"
import { useEffect, useState } from "react"

type NumberSettings = { id: string; phoneNumber: string; displayName: string | null; error: string | null
  enableWelcome: boolean; prompts: string[]; commands: { name: string; description: string }[] }

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 38, padding: "8px 10px", border: "1px solid #cbd5d3", borderRadius: 6, fontSize: 13 }
const small: React.CSSProperties = { border: "1px solid #d7e2df", borderRadius: 6, padding: "6px 10px", background: "#fff", fontSize: 12, cursor: "pointer", color: "#183633" }

// Ice breakers (tappable starter questions), /commands and the welcome-message switch for each WhatsApp number.
export function IceBreakers() {
  const [numbers, setNumbers] = useState<NumberSettings[] | null>(null)
  const [selected, setSelected] = useState("")
  const [draft, setDraft] = useState<NumberSettings | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch("/api/flows/conversational").then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load ice breakers.")
      setNumbers(body.numbers); setSelected(body.numbers[0]?.id || ""); setDraft(body.numbers[0] || null)
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load ice breakers."))
  }, [])

  function pick(id: string) { setSelected(id); setDraft(numbers?.find(item => item.id === id) || null); setNotice(""); setError("") }

  async function save() {
    if (!draft) return
    setSaving(true); setError(""); setNotice("")
    try {
      const prompts = draft.prompts.map(prompt => prompt.trim()).filter(Boolean)
      const commands = draft.commands.filter(command => command.name.trim())
      const response = await fetch("/api/flows/conversational", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneId: draft.id, enableWelcome: draft.enableWelcome, prompts, commands }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not save.")
      const saved = { ...draft, prompts, commands }
      setNumbers(current => current?.map(item => item.id === saved.id ? saved : item) || null); setDraft(saved); setNotice(body.message)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save.") }
    finally { setSaving(false) }
  }

  const update = (patch: Partial<NumberSettings>) => setDraft(current => current && { ...current, ...patch })
  const summary = numbers?.[0] ? `${numbers[0].prompts.length} ice breaker${numbers[0].prompts.length === 1 ? "" : "s"} · ${numbers[0].commands.length} command${numbers[0].commands.length === 1 ? "" : "s"} · welcome ${numbers[0].enableWelcome ? "on" : "off"}` : ""

  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 18, overflow: "hidden" }}>
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
      padding: "14px 18px", background: "none", border: 0, cursor: "pointer" }}>
      <span style={{ fontSize: 20 }}>🧊</span>
      <span style={{ flex: 1 }}><span style={{ display: "block", fontFamily: "Sora,sans-serif", fontSize: 15, fontWeight: 700, color: "#183633" }}>Ice breakers &amp; commands</span>
        <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>Starter questions customers can tap when they open your chat, /commands, and the welcome message.{summary ? ` ${summary}.` : ""}</span></span>
      <span style={{ fontSize: 12, color: "#075e54", fontWeight: 700 }}>{open ? "Close" : "Set up"}</span>
    </button>
    {open && <div style={{ padding: "0 18px 18px", borderTop: "1px solid #e8efee" }}>
      {error && <div role="alert" style={{ padding: 10, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, margin: "12px 0", fontSize: 13 }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 10, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, margin: "12px 0", fontSize: 13 }}>{notice}</div>}
      {!numbers ? !error && <p style={{ fontSize: 13, color: "#64748b" }}>Loading from WhatsApp…</p> : !numbers.length ? <p style={{ fontSize: 13, color: "#64748b" }}>
        Connect a WhatsApp number first. <a href="/onboarding" style={{ color: "#075e54", fontWeight: 700 }}>Set up WhatsApp →</a></p> : draft && <div style={{ display: "grid",
        gridTemplateColumns: "minmax(0,1.4fr) minmax(220px,.8fr)", gap: 18, marginTop: 14 }}>
        <div>
          {numbers.length > 1 && <select value={selected} onChange={event => pick(event.target.value)} style={{ ...field, marginBottom: 12 }}>
            {numbers.map(item => <option key={item.id} value={item.id}>{item.displayName || "WhatsApp"} · {item.phoneNumber}</option>)}</select>}
          {draft.error && <div style={{ fontSize: 12, color: "#b45309", marginBottom: 10 }}>Couldn&apos;t read current settings from WhatsApp: {draft.error}</div>}

          <div style={{ fontSize: 12, fontWeight: 700, color: "#526763", marginBottom: 6 }}>Ice breakers (up to 4)</div>
          {[0, 1, 2, 3].map(index => <input key={index} maxLength={80} value={draft.prompts[index] || ""} placeholder={["What services do you offer?", "Book a free demo", "Pricing plans", "Talk to support"][index]}
            onChange={event => { const prompts = [...draft.prompts]; prompts[index] = event.target.value; update({ prompts }) }} style={{ ...field, marginBottom: 6 }} />)}
          <div style={{ fontSize: 11, color: "#71817e", marginBottom: 14 }}>Tapping one sends its text to you. Start a flow from it by adding the same text as a keyword on the flow&apos;s Start step.</div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#526763", marginBottom: 6 }}>Commands (customers type “/”)</div>
          {draft.commands.map((command, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 6, marginBottom: 6 }}>
            <input aria-label="Command name" maxLength={32} value={command.name} placeholder="menu"
              onChange={event => update({ commands: draft.commands.map((item, i) => i === index ? { ...item, name: event.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase() } : item) })} style={field} />
            <input aria-label="Command description" maxLength={256} value={command.description} placeholder="See our main menu"
              onChange={event => update({ commands: draft.commands.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} style={field} />
            <button type="button" aria-label="Remove command" onClick={() => update({ commands: draft.commands.filter((_, i) => i !== index) })} style={{ ...small, color: "#b91c1c" }}>✕</button>
          </div>)}
          {draft.commands.length < 30 && <button type="button" onClick={() => update({ commands: [...draft.commands, { name: "", description: "" }] })} style={small}>+ Add command</button>}
          <div style={{ fontSize: 11, color: "#71817e", margin: "6px 0 14px" }}>A command arrives as “/name” — use “/name” as a flow keyword to answer it.</div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={draft.enableWelcome} onChange={event => update({ enableWelcome: event.target.checked })} style={{ marginTop: 2 }} />
            <span><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#183633" }}>Welcome message</span>
              <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>When someone opens your chat for the first time, run the flow whose Start step is set to “Customer opens the chat for the first time”.</span></span>
          </label>
          <button type="button" onClick={save} disabled={saving} style={{ marginTop: 14, border: 0, borderRadius: 6, padding: "10px 16px", background: "#075e54", color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? .7 : 1 }}>{saving ? "Saving to WhatsApp…" : "Save to WhatsApp"}</button>
        </div>

        <div aria-label="Preview" style={{ background: "#efeae2", borderRadius: 10, padding: 14, alignSelf: "start" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#54656f", textAlign: "center", marginBottom: 10 }}>What customers see in a new chat</div>
          <div style={{ display: "grid", gap: 6 }}>
            {draft.prompts.filter(prompt => prompt.trim()).map(prompt => <div key={prompt} style={{ background: "#fff", borderRadius: 18, padding: "8px 12px",
              fontSize: 12, color: "#027eb5", textAlign: "center", boxShadow: "0 1px 1px rgba(0,0,0,.08)" }}>{prompt}</div>)}
            {!draft.prompts.some(prompt => prompt.trim()) && <div style={{ fontSize: 12, color: "#8696a0", textAlign: "center" }}>No ice breakers yet</div>}
          </div>
          {draft.commands.some(command => command.name) && <div style={{ background: "#fff", borderRadius: 8, padding: 8, marginTop: 12, fontSize: 12 }}>
            {draft.commands.filter(command => command.name).map(command => <div key={command.name} style={{ padding: "4px 0" }}>
              <strong>/{command.name}</strong> <span style={{ color: "#667781" }}>{command.description}</span></div>)}</div>}
        </div>
      </div>}
    </div>}
  </section>
}
