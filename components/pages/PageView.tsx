"use client"
import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { SECTIONS, type Item, type Section, type Theme } from "@/lib/pages/types"

// Renders a WhatsApp page. Used by the public page (/p/<slug>) and by the editor's live preview.
// Public: every WhatsApp button goes through /p/<slug>/go (click tracking + ref code), then wa.me.
// Editor: clicking a section selects it (no navigation), so the preview always scrolls and is clickable.

export type ViewMode = { kind: "public"; slug: string } | { kind: "editor"; selectedId: string | null; onSelect: (id: string) => void }
type Props = { sections: Section[]; theme: Theme; mode: ViewMode; whatsappNumber: string | null; poweredBy: { name: string; href: string } | null; pageType?: string }

const str = (value: unknown) => (typeof value === "string" ? value : "")
const items = (value: unknown) => (Array.isArray(value) ? value as Item[] : [])
const stars = (count: string) => "★★★★★".slice(0, Math.max(1, Math.min(5, Number(count) || 5)))
export const waLink = (number: string | null, message: string) => `https://wa.me/${(number || "").replace(/\D/g, "")}${message ? `?text=${encodeURIComponent(message)}` : ""}`

export function PageView({ sections, theme, mode, whatsappNumber, poweredBy, pageType }: Props) {
  const editor = mode.kind === "editor"
  const href = (sectionId: string, item = -1) => mode.kind === "public" ? `/p/${mode.slug}/go?s=${encodeURIComponent(sectionId)}&i=${item}` : undefined
  const button = (text: string, sectionId: string, item = -1, variant: "main" | "light" = "main") => text
    ? <a className={`zkp-btn zkp-btn-${theme.buttonStyle}${variant === "light" ? " zkp-btn-light" : ""}`} href={href(sectionId, item)} rel="nofollow"
        onClick={editor ? event => event.preventDefault() : undefined}><WaIcon /> {text}</a> : null
  const visible = sections.filter(section => !section.hidden || editor)
  const narrow = pageType === "LINKS"

  return <div className="zkp" style={{ ["--p" as string]: theme.primary, ["--bg" as string]: theme.background, ["--fg" as string]: theme.text, fontFamily: `'${theme.font}',system-ui,sans-serif` }}>
    <style>{CSS}</style>
    <div className={`zkp-page${narrow ? " zkp-narrow" : ""}`}>
      {(theme.logo || theme.businessName) && pageType !== "LINKS" && <header className="zkp-top">
        {theme.logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={theme.logo} alt="" className="zkp-logo" />}
        <strong>{theme.businessName}</strong>
        {whatsappNumber && <a className="zkp-top-cta" href={mode.kind === "public" ? `/p/${mode.slug}/go?s=_float&i=-1` : undefined} onClick={editor ? event => event.preventDefault() : undefined}><WaIcon /> Chat</a>}
      </header>}
      {visible.map((section, index) => {
        const p = section.props
        const selected = mode.kind === "editor" && mode.selectedId === section.id
        const wrap = (children: React.ReactNode, className = "") => <section key={section.id} id={`s-${section.id}`} data-section={section.id}
          className={`zkp-sec zkp-${section.type} ${className}${editor ? " zkp-editable" : ""}${selected ? " zkp-selected" : ""}${section.hidden ? " zkp-hidden" : ""}`}
          onClickCapture={mode.kind === "editor" ? event => { event.preventDefault(); event.stopPropagation(); mode.onSelect(section.id) } : undefined}>
          {editor && <span className="zkp-tag">{SECTIONS[section.type].icon} {SECTIONS[section.type].label}{section.hidden ? " · hidden" : ""}</span>}
          <div className="zkp-in">{children}</div></section>
        switch (section.type) {
          case "hero": {
            const layout = str(p.layout) || "center", image = str(p.image)
            // "Image background" without an image yet falls back to the brand colour, so the white text stays readable.
            return wrap(<div className={`zkp-hero-${layout}`} style={layout === "cover" ? image ? { backgroundImage: `linear-gradient(#0008,#0008),url("${image}")` }
              : { background: "linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 70%,#000))" } : undefined}>
              <div className="zkp-hero-text">
                {pageType === "LINKS" && theme.logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={theme.logo} alt="" className="zkp-avatar" />}
                {str(p.eyebrow) && <div className="zkp-eyebrow">{str(p.eyebrow)}</div>}
                <h1>{str(p.title) || theme.businessName}</h1>
                {str(p.subtitle) && <p className="zkp-lead">{str(p.subtitle)}</p>}
                {button(str(p.buttonText), section.id, -1, layout === "cover" ? "light" : "main")}
              </div>
              {layout === "split" && image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={image} alt="" className="zkp-hero-img" />}
            </div>, index === 0 ? "zkp-first" : "")
          }
          case "links":
            return wrap(<div className="zkp-links">{items(p.items).map((item, i) => {
              const target = item.kind === "url" ? item.value : item.kind === "call" ? `tel:${(item.value || "").replace(/[^\d+]/g, "")}` : href(section.id, i)
              return <a key={i} className={`zkp-link zkp-btn-${theme.buttonStyle}`} href={editor ? undefined : target} target={item.kind === "url" ? "_blank" : undefined} rel="noopener nofollow"
                onClick={editor ? event => event.preventDefault() : undefined}><span>{item.icon || (item.kind === "call" ? "📞" : item.kind === "url" ? "🔗" : "💬")}</span>{item.label || "Button"}</a>
            })}</div>)
          case "services":
            return wrap(<><Heading title={str(p.heading)} intro={str(p.intro)} /><div className="zkp-grid">{items(p.items).map((item, i) => <article key={i} className="zkp-card">
              {item.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.image} alt="" />}
              <div className="zkp-card-body"><h3>{item.title}</h3>{item.text && <p>{item.text}</p>}{item.price && <div className="zkp-price">{item.price}</div>}
                {item.buttonText && button(item.buttonText, section.id, i)}</div></article>)}</div></>)
          case "products":
            return wrap(<><Heading title={str(p.heading)} intro={str(p.intro)} />
              {items(p.items).length ? <div className="zkp-grid">{items(p.items).map((item, i) => <article key={i} className="zkp-card">
                {item.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.image} alt="" />}
                <div className="zkp-card-body"><h3>{item.name}</h3>{item.price && <div className="zkp-price">{item.price}</div>}{button(str(p.buttonText) || "Order on WhatsApp", section.id, i)}</div></article>)}</div>
                : editor ? <div className="zkp-empty">Choose products from your WhatsApp catalog in the panel on the right →</div> : null}</>)
          case "form": return wrap(<LeadForm section={section} mode={mode} />)
          case "cta":
            return wrap(<div className="zkp-cta-box"><h2>{str(p.title)}</h2>{str(p.text) && <p>{str(p.text)}</p>}{button(str(p.buttonText), section.id, -1, "light")}</div>)
          case "faq":
            return wrap(<><Heading title={str(p.heading)} />{items(p.items).map((item, i) => <details key={i} className="zkp-faq" open={editor && i === 0}><summary>{item.q}</summary><p>{item.a}</p></details>)}</>)
          case "testimonials":
            return wrap(<><Heading title={str(p.heading)} /><div className="zkp-grid">{items(p.items).map((item, i) => <blockquote key={i} className="zkp-quote">
              <div className="zkp-stars">{stars(item.rating)}</div><p>“{item.text}”</p><cite>— {item.name}</cite></blockquote>)}</div></>)
          case "gallery": {
            const images = Array.isArray(p.images) ? (p.images as string[]) : []
            return wrap(<><Heading title={str(p.heading)} />{images.length ? <div className="zkp-gallery">{images.map((image, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={image} alt="" loading="lazy" />)}</div>
              : editor ? <div className="zkp-empty">Add photos in the panel on the right →</div> : null}</>)
          }
          case "hours":
            return wrap(<><Heading title={str(p.heading)} /><table className="zkp-hours"><tbody>{items(p.items).map((row, i) => <tr key={i}><td>{row.day}</td><td>{row.time}</td></tr>)}</tbody></table>
              {str(p.note) && <p className="zkp-muted">{str(p.note)}</p>}</>)
          case "location":
            return wrap(<><Heading title={str(p.heading)} />{str(p.address) && <p style={{ whiteSpace: "pre-line" }}>{str(p.address)}</p>}
              {str(p.mapUrl) && <a className={`zkp-btn zkp-btn-outline`} href={editor ? undefined : str(p.mapUrl)} target="_blank" rel="noopener nofollow">📍 Open in Google Maps</a>}</>)
          case "text":
            return wrap(<><Heading title={str(p.heading)} /><p style={{ whiteSpace: "pre-line" }}>{str(p.body)}</p></>)
          case "qr":
            return wrap(<div className="zkp-qr"><Qr value={waLink(whatsappNumber, str(p.message))} /><div><h2>{str(p.heading)}</h2><p>{str(p.text)}</p>{button("Or tap to chat", section.id)}</div></div>)
          case "social": {
            const links = ([["instagram", "📸 Instagram"], ["facebook", "📘 Facebook"], ["youtube", "▶️ YouTube"], ["website", "🌐 Website"]] as const).filter(([key]) => str(p[key]))
            return wrap(<div className="zkp-social">{links.map(([key, label]) => <a key={key} href={editor ? undefined : str(p[key])} target="_blank" rel="noopener nofollow">{label}</a>)}
              {str(p.email) && <a href={editor ? undefined : `mailto:${str(p.email)}`}>✉️ {str(p.email)}</a>}</div>)
          }
        }
      })}
      {poweredBy && <footer className="zkp-powered"><a href={poweredBy.href} target="_blank" rel="noopener">Powered by {poweredBy.name}</a></footer>}
    </div>
    {theme.floatingButton && whatsappNumber && <a className="zkp-float" aria-label="Chat on WhatsApp" href={mode.kind === "public" ? `/p/${mode.slug}/go?s=_float&i=-1` : undefined}
      onClick={editor ? event => event.preventDefault() : undefined}><WaIcon size={30} /></a>}
  </div>
}

function Heading({ title, intro }: { title: string; intro?: string }) {
  return title || intro ? <div className="zkp-head">{title && <h2>{title}</h2>}{intro && <p className="zkp-muted">{intro}</p>}</div> : null
}

function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState("")
  useEffect(() => { QRCode.toDataURL(value, { width: 200, margin: 1 }).then(setSrc).catch(() => setSrc("")) }, [value])
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="WhatsApp QR code" width={160} height={160} className="zkp-qr-img" /> : <div className="zkp-qr-img" />
}

function LeadForm({ section, mode }: { section: Section; mode: ViewMode }) {
  const p = section.props
  const [state, setState] = useState<{ busy: boolean; done: string; error: string }>({ busy: false, done: "", error: "" })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode.kind !== "public") return
    const data = Object.fromEntries(new FormData(event.currentTarget))
    setState({ busy: true, done: "", error: "" })
    try {
      const response = await fetch(`/api/public/pages/${mode.slug}/lead`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: section.id, name: data.name, phone: data.phone, message: data.message || "", optIn: data.optIn === "on" }) })
      const body = await response.json()
      setState({ busy: false, done: response.ok ? str(p.successText) || "Thanks!" : "", error: response.ok ? "" : body.error || "Please try again." })
    } catch { setState({ busy: false, done: "", error: "Network error. Please try again." }) }
  }
  if (state.done) return <div className="zkp-form-done">✅ {state.done}</div>
  return <form className="zkp-form" onSubmit={submit}>
    <h2>{str(p.heading)}</h2>{str(p.intro) && <p className="zkp-muted">{str(p.intro)}</p>}
    <input name="name" required maxLength={80} placeholder="Your name" aria-label="Your name" />
    <input name="phone" required inputMode="tel" maxLength={18} placeholder="WhatsApp number" aria-label="WhatsApp number" />
    {p.askMessage === true && <textarea name="message" rows={3} maxLength={500} placeholder="What do you need?" aria-label="Message" />}
    <label className="zkp-consent"><input type="checkbox" name="optIn" defaultChecked /> {str(p.consentText) || "I agree to receive updates on WhatsApp."}</label>
    {state.error && <div className="zkp-error" role="alert">{state.error}</div>}
    <button type="submit" className="zkp-btn zkp-btn-solid" disabled={state.busy || mode.kind !== "public"}>{state.busy ? "Sending…" : str(p.buttonText) || "Send"}</button>
  </form>
}

function WaIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" /></svg>
}

const CSS = `
.zkp{background:var(--bg);color:var(--fg);min-height:100%;position:relative;line-height:1.55}
.zkp *{box-sizing:border-box}.zkp h1,.zkp h2,.zkp h3{line-height:1.2;margin:0 0 10px;font-family:inherit}
/* Beat the app shell's .zk-content h1{color:… !important} inside the editor preview */
.zkp.zkp h1,.zkp.zkp h2,.zkp.zkp h3{color:inherit!important}.zkp h1{font-size:clamp(28px,6vw,46px)}.zkp h2{font-size:clamp(22px,4.5vw,30px)}.zkp h3{font-size:18px}
.zkp p{margin:0 0 12px}.zkp-page{max-width:1080px;margin:0 auto}.zkp-narrow{max-width:520px}
.zkp-top{display:flex;align-items:center;gap:10px;padding:14px 18px;position:sticky;top:0;background:var(--bg);z-index:5;border-bottom:1px solid #0000000f}
.zkp-logo{height:36px;width:auto;border-radius:8px}.zkp-top strong{font-size:17px}.zkp-top-cta{margin-left:auto;display:inline-flex;gap:6px;align-items:center;background:#25d366;color:#fff;border-radius:999px;padding:7px 14px;font-weight:700;font-size:14px;text-decoration:none}
.zkp-sec{position:relative;padding:36px 18px}.zkp-in{max-width:980px;margin:0 auto}
.zkp-editable{cursor:pointer;outline:2px dashed transparent;outline-offset:-4px;transition:outline-color .15s}.zkp-editable:hover{outline-color:#93c5fd}
.zkp-selected{outline:3px solid #2563eb!important}.zkp-hidden{opacity:.45}
.zkp-tag{position:absolute;top:6px;left:8px;font-size:11px;font-weight:700;background:#2563eb;color:#fff;border-radius:6px;padding:2px 8px;opacity:0;pointer-events:none;z-index:3}
.zkp-editable:hover .zkp-tag,.zkp-selected .zkp-tag{opacity:1}
.zkp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;text-decoration:none;padding:12px 22px;font-size:15px;cursor:pointer;border:2px solid var(--p);margin-top:6px;font-family:inherit}
.zkp-btn-solid,.zkp-btn-pill{background:var(--p);color:#fff}.zkp-btn-pill{border-radius:999px}.zkp-btn-solid{border-radius:10px}.zkp-btn-outline{background:transparent;color:var(--p);border-radius:10px}
.zkp-btn-light{background:#fff;color:var(--p);border-color:#fff}
.zkp-hero .zkp-in>div{display:grid;gap:24px;align-items:center}.zkp-hero-center{text-align:center}.zkp-hero-center .zkp-lead{max-width:640px;margin-inline:auto}
.zkp-hero-split{grid-template-columns:1.1fr .9fr}.zkp-hero-img{width:100%;border-radius:18px;object-fit:cover;max-height:420px}
.zkp-hero-cover{background-size:cover;background-position:center;color:#fff;border-radius:18px;padding:56px 24px;text-align:center}
.zkp-first{padding-top:44px}.zkp-eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--p);background:color-mix(in srgb,var(--p) 12%,transparent);border-radius:999px;padding:4px 12px;margin-bottom:12px}
.zkp-hero-cover .zkp-eyebrow{color:#fff;background:#ffffff26}.zkp-lead{font-size:clamp(16px,2.4vw,19px);opacity:.85}
.zkp-avatar{width:88px;height:88px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 12px}
.zkp-links{display:grid;gap:12px}.zkp-link{display:flex;align-items:center;gap:10px;justify-content:center;padding:15px 18px;font-weight:700;text-decoration:none;border:2px solid var(--p);color:var(--fg);background:#fff;border-radius:14px;font-size:16px}
.zkp-link.zkp-btn-pill{border-radius:999px}.zkp-link:hover{background:var(--p);color:#fff}
.zkp-head{text-align:center;margin-bottom:22px}.zkp-muted{opacity:.7}
.zkp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px}
.zkp-card{border:1px solid #0000001a;border-radius:16px;overflow:hidden;background:#fff;color:#111b21;display:flex;flex-direction:column}
.zkp-card img{width:100%;height:180px;object-fit:cover}.zkp-card-body{padding:16px;display:flex;flex-direction:column;gap:4px;flex:1}.zkp-card-body .zkp-btn{margin-top:auto;align-self:flex-start}
.zkp-price{font-weight:800;color:var(--p);font-size:17px;margin-bottom:6px}
.zkp-cta .zkp-cta-box{background:var(--p);color:#fff;border-radius:20px;padding:34px 22px;text-align:center}
.zkp-faq{border-bottom:1px solid #0000001a;padding:12px 0}.zkp-faq summary{font-weight:700;cursor:pointer}.zkp-faq p{margin:8px 0 0;opacity:.85}
.zkp-quote{margin:0;border:1px solid #0000001a;border-radius:16px;padding:18px;background:#fff;color:#111b21}.zkp-stars{color:#f59e0b;letter-spacing:2px}.zkp-quote cite{font-style:normal;font-weight:700;font-size:14px}
.zkp-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.zkp-gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}
.zkp-hours{width:100%;max-width:460px;margin:0 auto 10px;border-collapse:collapse}.zkp-hours td{padding:9px 6px;border-bottom:1px solid #0000001a}.zkp-hours td:last-child{text-align:right;font-weight:700}
.zkp-hours~p,.zkp-location p{text-align:center}.zkp-location .zkp-in,.zkp-text .zkp-in{text-align:center}
.zkp-qr .zkp-in>div{display:flex;gap:22px;align-items:center;justify-content:center;flex-wrap:wrap}.zkp-qr-img{width:160px;height:160px;border-radius:12px;background:#fff;padding:6px;border:1px solid #0000001a}
.zkp-social{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.zkp-social a{padding:9px 14px;border-radius:999px;border:1px solid #00000022;text-decoration:none;color:inherit;font-weight:600;font-size:14px}
.zkp-form{max-width:460px;margin:0 auto;display:grid;gap:10px;text-align:center}.zkp-form input:not([type=checkbox]),.zkp-form textarea{width:100%;padding:12px 14px;border:1.5px solid #0000002a;border-radius:10px;font:inherit;background:#fff;color:#111b21}
.zkp-consent{display:flex;gap:8px;align-items:flex-start;text-align:left;font-size:13px;opacity:.85}.zkp-error{color:#b91c1c;font-size:14px}.zkp-form-done{text-align:center;font-size:18px;font-weight:700;padding:20px}
.zkp-empty{border:2px dashed #94a3b8;border-radius:14px;padding:26px;text-align:center;color:#64748b}
.zkp-powered{text-align:center;padding:20px 0 90px;font-size:12px;opacity:.6}.zkp-powered a{color:inherit}
.zkp-float{position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 8px 24px #0004;z-index:20}
@media(max-width:720px){.zkp-hero-split{grid-template-columns:1fr}.zkp-sec{padding:28px 16px}}
`
