"use client"
import { use, useCallback, useEffect, useRef, useState } from "react"
import { PageView } from "@/components/pages/PageView"
import { FieldInput, ImageInput, fieldStyle } from "@/components/pages/FieldEditor"
import { FONTS, PAGE_TYPES, SECTIONS, SECTION_TYPES, newId, newSection, type PageType, type Section, type SectionType, type Theme } from "@/lib/pages/types"

type PageData = { id: string; type: PageType; slug: string; title: string; status: string; whatsappNumber: string | null; theme: Theme; sections: Section[]
  seoTitle: string | null; seoDescription: string | null; views: number; publishedAt: string | null; updatedAt: string }
type Loaded = { page: PageData; numbers: { value: string; label: string }[]; poweredBy: { name: string; href: string } | null; stats: { clicks: number; chats: number }; base: string }
type Device = "desktop" | "tablet" | "mobile"

const panel: React.CSSProperties = { background: "#fff", minHeight: 0, overflowY: "auto" }
const small: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#334155", margin: "12px 0 5px" }
const WIDTH: Record<Device, string> = { desktop: "100%", tablet: "768px", mobile: "390px" }

// WhatsApp Page Builder editor: sections (left) · live preview (centre, scrolls, click to select) · properties (right).
export default function PageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Loaded | null>(null)
  const [page, setPage] = useState<PageData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<"sections" | "settings">("sections")
  const [device, setDevice] = useState<Device>("desktop")
  const [adding, setAdding] = useState(false)
  const [save, setSave] = useState<"saved" | "saving" | "unsaved" | "error">("saved")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const latest = useRef<PageData | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch(`/api/pages/${id}`).then(async response => {
      const body = await response.json()
      if (!response.ok) { setMessage({ ok: false, text: body.error }); return }
      setData(body); setPage(body.page); latest.current = body.page; setSelected(body.page.sections[0]?.id || null)
    })
  }, [id])

  const persist = useCallback(async () => {
    const current = latest.current
    if (!current) return
    setSave("saving")
    const response = await fetch(`/api/pages/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: current.title, slug: current.slug, whatsappNumber: current.whatsappNumber || "", seoTitle: current.seoTitle || "", seoDescription: current.seoDescription || "",
      theme: current.theme, sections: current.sections }) })
    const body = await response.json()
    if (response.ok) setSave(latest.current === current ? "saved" : "unsaved")
    else { setSave("error"); setMessage({ ok: false, text: body.error || "Couldn't save." }) }
  }, [id])

  // Every change updates the preview at once and autosaves the draft after a short pause.
  const change = useCallback((next: PageData) => {
    setPage(next); latest.current = next; setSave("unsaved")
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(persist, 900)
  }, [persist])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (save === "unsaved" || save === "saving") { event.preventDefault() } }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [save])

  // Selecting from the list scrolls the preview to that section.
  const select = useCallback((sectionId: string, scroll: boolean) => {
    setSelected(sectionId); setLeftTab("sections")
    if (scroll) requestAnimationFrame(() => previewRef.current?.querySelector(`[data-section="${sectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }, [])

  if (!page || !data) return <div style={{ padding: 24, color: message ? "#b91c1c" : "#64748b" }}>{message?.text || "Loading editor…"}</div>

  const section = page.sections.find(entry => entry.id === selected) || null
  const setSections = (sections: Section[]) => change({ ...page, sections })
  const setTheme = (patch: Partial<Theme>) => change({ ...page, theme: { ...page.theme, ...patch } })
  const updateSection = (sectionId: string, patch: Partial<Section> | { props: Record<string, unknown> }) =>
    setSections(page.sections.map(entry => entry.id === sectionId ? { ...entry, ...patch } : entry))
  const move = (index: number, to: number) => { if (to < 0 || to >= page.sections.length) return; const next = [...page.sections]; const [entry] = next.splice(index, 1); next.splice(to, 0, entry); setSections(next) }
  const add = (type: SectionType) => { const created = newSection(type); const at = section ? page.sections.indexOf(section) + 1 : page.sections.length
    const next = [...page.sections]; next.splice(at, 0, created); setSections(next); setAdding(false); select(created.id, true) }

  async function publish(action: "publish" | "unpublish") {
    if (timer.current) { window.clearTimeout(timer.current); await persist() }
    const response = await fetch(`/api/pages/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
    const body = await response.json()
    setMessage({ ok: response.ok, text: body.message || body.error })
    if (response.ok) setPage(current => current && { ...current, status: action === "publish" ? "PUBLISHED" : "DRAFT", publishedAt: body.publishedAt || current.publishedAt })
  }

  const liveUrl = `${data.base || ""}/p/${page.slug}`

  return <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 110px)", minHeight: 520, margin: "-8px -4px 0", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#f1f5f9" }}>
    {/* Top bar */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fff", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
      <a href="/app/pages" style={{ fontSize: 13, color: "#075e54", fontWeight: 700, textDecoration: "none" }}>← Pages</a>
      <input aria-label="Page name" value={page.title} onChange={event => change({ ...page, title: event.target.value })} style={{ ...fieldStyle, width: 200, fontWeight: 700 }} />
      <span style={{ fontSize: 11, color: "#64748b" }}>{PAGE_TYPES[page.type].label}</span>
      <div role="group" aria-label="Preview size" style={{ display: "flex", gap: 2, marginLeft: "auto", background: "#f1f5f9", borderRadius: 7, padding: 2 }}>
        {(["desktop", "tablet", "mobile"] as Device[]).map(item => <button key={item} type="button" aria-pressed={device === item} aria-label={`${item} preview`} title={`${item} preview`} onClick={() => setDevice(item)}
          style={{ ...small, border: 0, background: device === item ? "#fff" : "transparent", fontWeight: device === item ? 700 : 400 }}>{item === "desktop" ? "🖥️ Desktop" : item === "tablet" ? "Tablet" : "📱 Mobile"}</button>)}
      </div>
      <span style={{ fontSize: 11, color: save === "error" ? "#b91c1c" : "#64748b", minWidth: 80, textAlign: "right" }}>{save === "saved" ? "All changes saved" : save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved…" : "Save failed"}</span>
      {page.status === "PUBLISHED" && <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer" style={{ ...small, textDecoration: "none", color: "#075e54", fontWeight: 700 }}>View live ↗</a>}
      {page.status === "PUBLISHED" && <button type="button" style={small} onClick={() => publish("unpublish")}>Unpublish</button>}
      <button type="button" onClick={() => publish("publish")} style={{ border: 0, borderRadius: 7, padding: "8px 14px", background: "#075e54", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        {page.status === "PUBLISHED" ? "Publish changes" : "Publish"}</button>
    </div>
    {message && <div role={message.ok ? "status" : "alert"} style={{ padding: "8px 14px", fontSize: 13, background: message.ok ? "#ecfdf5" : "#fef2f2", color: message.ok ? "#166534" : "#991b1b", display: "flex", gap: 8 }}>
      <span style={{ flex: 1 }}>{message.text}{message.ok && page.status === "PUBLISHED" && <> · <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer" style={{ color: "inherit", fontWeight: 700 }}>{liveUrl}</a></>}</span>
      <button type="button" onClick={() => setMessage(null)} style={{ border: 0, background: "none", cursor: "pointer" }} aria-label="Dismiss">✕</button></div>}

    <div className="zk-pb-grid" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "250px minmax(0,1fr) 320px" }}>
      {/* Left: sections / page settings */}
      <aside style={{ ...panel, borderRight: "1px solid #e2e8f0" }}>
        <div role="tablist" style={{ display: "flex", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
          {([["sections", "Sections"], ["settings", "Page settings"]] as const).map(([key, text]) => <button key={key} role="tab" aria-selected={leftTab === key} type="button" onClick={() => setLeftTab(key)}
            style={{ flex: 1, border: 0, borderBottom: leftTab === key ? "2px solid #075e54" : "2px solid transparent", background: "none", padding: "10px 0", fontWeight: 700, fontSize: 12, cursor: "pointer", color: leftTab === key ? "#075e54" : "#64748b" }}>{text}</button>)}
        </div>
        {leftTab === "sections" ? <div style={{ padding: 8 }}>
          {page.sections.map((entry, index) => <div key={entry.id} draggable onDragStart={() => setDragId(entry.id)} onDragOver={event => event.preventDefault()}
            onDrop={() => { if (dragId && dragId !== entry.id) move(page.sections.findIndex(item => item.id === dragId), index); setDragId(null) }}
            onClick={() => select(entry.id, true)} role="button" tabIndex={0} onKeyDown={event => { if (event.key === "Enter") select(entry.id, true) }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 8px", borderRadius: 7, cursor: "pointer", marginBottom: 2, fontSize: 13,
              background: selected === entry.id ? "#e0f2fe" : "transparent", border: selected === entry.id ? "1px solid #7dd3fc" : "1px solid transparent", opacity: entry.hidden ? .5 : 1 }}>
            <span title="Drag to reorder" style={{ cursor: "grab", color: "#94a3b8" }}>⋮⋮</span>
            <span>{SECTIONS[entry.type].icon}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(entry.props.heading || entry.props.title || SECTIONS[entry.type].label)}</span>
            <button type="button" aria-label={entry.hidden ? "Show section" : "Hide section"} title={entry.hidden ? "Show" : "Hide"} onClick={event => { event.stopPropagation(); updateSection(entry.id, { hidden: !entry.hidden }) }}
              style={{ border: 0, background: "none", cursor: "pointer", fontSize: 13 }}>{entry.hidden ? "🙈" : "👁️"}</button>
          </div>)}
          <button type="button" onClick={() => setAdding(true)} style={{ width: "100%", marginTop: 8, padding: 10, border: "1.5px dashed #075e54", borderRadius: 8, background: "#f0fdf4", color: "#075e54", fontWeight: 700, cursor: "pointer" }}>+ Add section</button>
          <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, margin: "10px 2px" }}>Click a section here or in the preview to edit it on the right. Drag ⋮⋮ to reorder.</p>
        </div> : <div style={{ padding: 12 }}>
          <label style={label}>WhatsApp number customers chat with</label>
          <select value={page.whatsappNumber || ""} onChange={event => change({ ...page, whatsappNumber: event.target.value })} style={fieldStyle}>
            <option value="">— choose —</option>{data.numbers.map(number => <option key={number.value} value={number.value}>{number.label}</option>)}
            {page.whatsappNumber && !data.numbers.some(number => number.value === page.whatsappNumber) && <option value={page.whatsappNumber}>+{page.whatsappNumber}</option>}
          </select>
          {!data.numbers.length && <input placeholder="Number with country code, e.g. 919876543210" value={page.whatsappNumber || ""} onChange={event => change({ ...page, whatsappNumber: event.target.value.replace(/\D/g, "") })} style={{ ...fieldStyle, marginTop: 6 }} />}
          <label style={label}>Page address</label>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><span style={{ color: "#64748b" }}>/p/</span>
            <input value={page.slug} onChange={event => change({ ...page, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60) })} style={fieldStyle} /></div>
          <label style={label}>Business name</label><input value={page.theme.businessName} onChange={event => setTheme({ businessName: event.target.value })} style={fieldStyle} />
          <label style={label}>Logo</label><ImageInput value={page.theme.logo} onChange={logo => setTheme({ logo })} label="logo" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([["primary", "Brand"], ["background", "Background"], ["text", "Text"]] as const).map(([key, text]) => <label key={key} style={{ ...label, margin: "12px 0 0" }}>{text}
              <input type="color" value={page.theme[key]} onChange={event => setTheme({ [key]: event.target.value })} style={{ display: "block", width: "100%", height: 32, border: "1px solid #cbd5e1", borderRadius: 6, marginTop: 4 }} /></label>)}
          </div>
          <label style={label}>Font</label><select value={page.theme.font} onChange={event => setTheme({ font: event.target.value as Theme["font"] })} style={fieldStyle}>{FONTS.map(font => <option key={font}>{font}</option>)}</select>
          <label style={label}>Button style</label><select value={page.theme.buttonStyle} onChange={event => setTheme({ buttonStyle: event.target.value as Theme["buttonStyle"] })} style={fieldStyle}>
            <option value="pill">Rounded (pill)</option><option value="solid">Square</option><option value="outline">Outline</option></select>
          <label style={{ ...label, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={page.theme.floatingButton} onChange={event => setTheme({ floatingButton: event.target.checked })} /> Floating WhatsApp button</label>
          {page.theme.floatingButton && <textarea rows={2} value={page.theme.floatingMessage} onChange={event => setTheme({ floatingMessage: event.target.value })} placeholder="Pre-filled message" style={fieldStyle} />}
          <label style={label}>Search / share title</label><input value={page.seoTitle || ""} maxLength={120} onChange={event => change({ ...page, seoTitle: event.target.value })} style={fieldStyle} />
          <label style={label}>Search / share description</label><textarea rows={3} maxLength={300} value={page.seoDescription || ""} onChange={event => change({ ...page, seoDescription: event.target.value })} style={fieldStyle} />
          <div style={{ fontSize: 12, color: "#475569", margin: "14px 0", lineHeight: 1.6 }}>👀 {page.views} views · 💬 {data.stats.clicks} WhatsApp taps · ✅ {data.stats.chats} chats started (30 days)</div>
        </div>}
      </aside>

      {/* Centre: live preview — scrolls on its own; clicking a section selects it */}
      <div ref={previewRef} style={{ minHeight: 0, overflow: "auto", padding: device === "desktop" ? 12 : "16px 12px" }}>
        <div style={{ width: WIDTH[device], maxWidth: "100%", margin: "0 auto", borderRadius: device === "desktop" ? 8 : 22, overflow: "hidden", boxShadow: "0 4px 24px #0f172a22",
          border: device === "desktop" ? "1px solid #e2e8f0" : "8px solid #1e293b", background: page.theme.background, transform: "translateZ(0)" }}>
          <PageView sections={page.sections} theme={page.theme} mode={{ kind: "editor", selectedId: selected, onSelect: sectionId => select(sectionId, false) }}
            whatsappNumber={page.whatsappNumber} poweredBy={data.poweredBy} pageType={page.type} />
        </div>
      </div>

      {/* Right: properties of the selected section */}
      <aside style={{ ...panel, borderLeft: "1px solid #e2e8f0", padding: "0 14px 24px" }}>
        {section ? <>
          <div style={{ position: "sticky", top: 0, background: "#fff", padding: "12px 0 8px", borderBottom: "1px solid #f1f5f9", zIndex: 2 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{SECTIONS[section.type].icon} {SECTIONS[section.type].label}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{SECTIONS[section.type].description}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {(() => { const index = page.sections.indexOf(section); return <>
                <button type="button" style={small} disabled={index === 0} onClick={() => move(index, index - 1)}>↑ Up</button>
                <button type="button" style={small} disabled={index === page.sections.length - 1} onClick={() => move(index, index + 1)}>↓ Down</button>
                <button type="button" style={small} onClick={() => { const copy = { ...section, id: newId(), props: JSON.parse(JSON.stringify(section.props)) }; const next = [...page.sections]; next.splice(index + 1, 0, copy); setSections(next); select(copy.id, true) }}>Duplicate</button>
                <button type="button" style={small} onClick={() => updateSection(section.id, { hidden: !section.hidden })}>{section.hidden ? "Show" : "Hide"}</button>
                <button type="button" style={{ ...small, color: "#b91c1c" }} onClick={() => { if (window.confirm("Remove this section?")) { setSections(page.sections.filter(entry => entry.id !== section.id)); setSelected(page.sections[Math.max(0, index - 1)]?.id || null) } }}>Delete</button>
              </> })()}
            </div>
          </div>
          {SECTIONS[section.type].fields.map(field => <FieldInput key={`${section.id}-${field.key}`} field={field} value={section.props[field.key]}
            onChange={value => updateSection(section.id, { props: { ...section.props, [field.key]: value } })} />)}
        </> : <div style={{ padding: "24px 4px", fontSize: 13, color: "#64748b" }}>Select a section in the preview or the list to edit it.</div>}
      </aside>
    </div>

    {adding && <div role="dialog" aria-label="Add a section" onClick={() => setAdding(false)} style={{ position: "fixed", inset: 0, background: "#0f172a66", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 18, width: "min(720px,100%)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><strong style={{ fontSize: 16 }}>Add a section</strong>
          <button type="button" style={small} onClick={() => setAdding(false)}>Close</button></div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,200px),1fr))" }}>
          {SECTION_TYPES.map(type => <button key={type} type="button" onClick={() => add(type)} style={{ textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#f8fafc", cursor: "pointer" }}>
            <div style={{ fontSize: 20 }}>{SECTIONS[type].icon}</div><div style={{ fontWeight: 700, fontSize: 13, margin: "4px 0 2px" }}>{SECTIONS[type].label}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{SECTIONS[type].description}</div></button>)}
        </div>
      </div>
    </div>}
    <style>{`@media(max-width:1100px){.zk-pb-grid{grid-template-columns:220px minmax(0,1fr) 280px!important}}@media(max-width:860px){.zk-pb-grid{grid-template-columns:1fr!important;grid-auto-rows:minmax(260px,auto)}}`}</style>
  </div>
}
