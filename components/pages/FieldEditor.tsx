"use client"
import { useState } from "react"
import type { Field, Item } from "@/lib/pages/types"

// Right-hand properties panel fields for the Page Builder, generated from the section's field list.

export const fieldStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 7, fontSize: 13, fontFamily: "inherit", background: "#fff" }
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#334155", margin: "12px 0 5px" }
const help: React.CSSProperties = { fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.4 }
const small: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }

export async function uploadImage(file: File) {
  const form = new FormData(); form.append("file", file)
  const response = await fetch("/api/pages/upload", { method: "POST", body: form })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "Upload failed")
  return body.url as string
}

export function ImageInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return <div>
    {value && /* eslint-disable-next-line @next/next/no-img-element */ <img src={value} alt="" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 6 }} />}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <label style={{ ...small, display: "inline-block" }}>{busy ? "Uploading…" : value ? "Replace image" : `Upload ${label || "image"}`}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return
          setBusy(true); setError(""); try { onChange(await uploadImage(file)) } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) } }} /></label>
      {value && <button type="button" style={small} onClick={() => onChange("")}>Remove</button>}
    </div>
    <input value={value.startsWith("/api/") ? "" : value} onChange={event => onChange(event.target.value)} placeholder="…or paste an https:// image link" style={{ ...fieldStyle, marginTop: 6, fontSize: 12 }} />
    {error && <div role="alert" style={{ ...help, color: "#b91c1c" }}>{error}</div>}
  </div>
}

type Product = { retailer_id: string; name: string; price?: string; currency?: string; image_url?: string }

function ProductsPicker({ value, onChange }: { value: Item[]; onChange: (value: Item[]) => void }) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  async function load() {
    setError("")
    const response = await fetch(`/api/commerce/products${query ? `?q=${encodeURIComponent(query)}` : ""}`)
    const body = await response.json()
    if (!response.ok) { setError(body.error || "Couldn't load your catalog."); setProducts([]); return }
    setProducts(body.products || [])
  }
  const picked = new Set(value.map(item => item.retailerId))
  const price = (product: Product) => product.price ? product.price.replace(/^INR\s?/, "₹") : ""
  return <div>
    {value.map((item, index) => <div key={item.retailerId} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
      {item.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.image} alt="" width={36} height={36} style={{ borderRadius: 6, objectFit: "cover" }} />}
      <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}><strong>{item.name}</strong><div style={{ color: "#64748b" }}>{item.price}</div></div>
      <button type="button" style={small} disabled={index === 0} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }} aria-label="Move up">↑</button>
      <button type="button" style={small} onClick={() => onChange(value.filter(entry => entry.retailerId !== item.retailerId))} aria-label={`Remove ${item.name}`}>✕</button>
    </div>)}
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search catalog" style={fieldStyle} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); load() } }} />
      <button type="button" style={small} onClick={load}>{products ? "Search" : "Load catalog"}</button>
    </div>
    {error && <div role="alert" style={{ ...help, color: "#b91c1c" }}>{error}</div>}
    {products && !products.length && !error && <div style={help}>No products found. Add products under Commerce → Catalog.</div>}
    <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 6 }}>{products?.filter(product => !picked.has(product.retailer_id)).map(product =>
      <button key={product.retailer_id} type="button" onClick={() => onChange([...value, { retailerId: product.retailer_id, name: product.name, price: price(product), image: product.image_url?.startsWith("https://") ? product.image_url : "",
        message: `Hi, I'd like to order ${product.name}${price(product) ? ` (${price(product)})` : ""}.` }])}
        style={{ display: "flex", width: "100%", gap: 8, alignItems: "center", textAlign: "left", border: 0, borderBottom: "1px solid #f1f5f9", background: "#fff", padding: "6px 2px", cursor: "pointer", fontSize: 12 }}>
        {product.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={product.image_url} alt="" width={32} height={32} style={{ borderRadius: 6, objectFit: "cover" }} />}
        <span style={{ flex: 1 }}>{product.name}</span><span style={{ color: "#64748b" }}>{price(product)}</span><span style={{ color: "#075e54", fontWeight: 700 }}>+ Add</span></button>)}</div>
  </div>
}

function MessageInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div>
    <textarea rows={2} value={value} maxLength={500} onChange={event => onChange(event.target.value)} style={fieldStyle} />
    <div style={{ background: "#dcf8c6", borderRadius: "10px 10px 2px 10px", padding: "6px 9px", fontSize: 12, marginTop: 6, maxWidth: "90%", marginLeft: "auto", whiteSpace: "pre-wrap" }}>
      {value || "…"}<div style={{ fontSize: 10, color: "#64748b", textAlign: "right" }}>sent by the customer</div></div>
  </div>
}

export function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const str = typeof value === "string" ? value : ""
  let control: React.ReactNode
  switch (field.kind) {
    case "text": case "url": control = <input value={str} placeholder={"placeholder" in field ? field.placeholder : undefined} maxLength={field.kind === "url" ? 1000 : 300} onChange={event => onChange(event.target.value)} style={fieldStyle} />; break
    case "textarea": control = <textarea rows={4} value={str} maxLength={3000} onChange={event => onChange(event.target.value)} style={fieldStyle} />; break
    case "message": control = <MessageInput value={str} onChange={onChange} />; break
    case "image": control = <ImageInput value={str} onChange={onChange} />; break
    case "select": control = <select value={str || field.options[0][0]} onChange={event => onChange(event.target.value)} style={fieldStyle}>{field.options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>; break
    case "toggle": return <label style={{ ...labelStyle, display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} /> {field.label}</label>
    case "products": control = <ProductsPicker value={Array.isArray(value) ? value as Item[] : []} onChange={onChange} />; break
    case "images": {
      const images = Array.isArray(value) ? value as string[] : []
      control = <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>{images.map((image, index) => <div key={image + index} style={{ position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6 }} />
          <button type="button" aria-label="Remove photo" onClick={() => onChange(images.filter((_, i) => i !== index))} style={{ position: "absolute", top: 2, right: 2, ...small, padding: "0 5px" }}>✕</button></div>)}</div>
        <div style={{ marginTop: 6 }}><ImageInput value="" label="photo" onChange={url => url && onChange([...images, url])} /></div>
      </div>; break
    }
    case "items": {
      const list = Array.isArray(value) ? value as Item[] : []
      const set = (index: number, key: string, next: unknown) => onChange(list.map((item, i) => i === index ? { ...item, [key]: String(next) } : item))
      const move = (index: number, by: number) => { const next = [...list]; const [entry] = next.splice(index, 1); next.splice(index + by, 0, entry); onChange(next) }
      control = <div>
        {list.map((item, index) => <details key={index} open={list.length <= 2} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", marginBottom: 8, background: "#f8fafc" }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{item.title || item.label || item.q || item.name || item.day || `${field.itemLabel} ${index + 1}`}</span>
            <button type="button" style={small} disabled={index === 0} onClick={event => { event.preventDefault(); move(index, -1) }} aria-label="Move up">↑</button>
            <button type="button" style={small} disabled={index === list.length - 1} onClick={event => { event.preventDefault(); move(index, 1) }} aria-label="Move down">↓</button>
            <button type="button" style={small} onClick={event => { event.preventDefault(); onChange(list.filter((_, i) => i !== index)) }} aria-label="Remove">✕</button></summary>
          {field.fields.map(sub => <FieldInput key={sub.key} field={sub} value={item[sub.key] ?? ""} onChange={next => set(index, sub.key, next)} />)}
        </details>)}
        <button type="button" style={{ ...small, width: "100%", padding: 8, borderStyle: "dashed" }} disabled={list.length >= 30}
          onClick={() => onChange([...list, Object.fromEntries(field.fields.map(sub => [sub.key, sub.kind === "select" ? sub.options[0][0] : ""]))])}>+ Add {field.itemLabel.toLowerCase()}</button>
      </div>; break
    }
  }
  return <div><label style={labelStyle}>{field.label}</label>{control}{"help" in field && field.help && <div style={help}>{field.help}</div>}</div>
}
