"use client"
import { useEffect, useState } from "react"

type Product = { id: string; retailer_id: string; name: string; price?: string; image_url?: string }

// Inbox: pick catalog products (or the whole catalog) and send them into the chat.
export function ProductPicker({ conversationId, onSent, onClose }: { conversationId: string; onSent: () => void; onClose: () => void }) {
  const [q, setQ] = useState("")
  const [products, setProducts] = useState<Product[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [header, setHeader] = useState("Picked for you")
  const [body, setBody] = useState("Tap a product to see details and add it to your cart 🛒")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => fetch(`/api/commerce/products?q=${encodeURIComponent(q)}`).then(response => response.json())
      .then(result => { if (result.error) { setError(result.error); setProducts([]) } else { setError(""); setProducts(result.products) } }), 300)
    return () => clearTimeout(timer)
  }, [q])

  async function send(kind: "products" | "catalog") {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/commerce/send", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, kind, retailerIds: kind === "products" ? selected : selected.slice(0, 1), header, body }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not send.")
      onSent()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send.") }
    finally { setBusy(false) }
  }

  const field: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 9px", fontSize: 12, boxSizing: "border-box", width: "100%" }
  return <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginBottom: 8, background: "#fff" }}>
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <input autoFocus value={q} onChange={event => setQ(event.target.value)} placeholder="🔍 Search products" style={field} />
      <button onClick={onClose} style={{ border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
    </div>
    {error && <div role="alert" style={{ fontSize: 12, color: "#991b1b", marginBottom: 6 }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 6, maxHeight: 200, overflowY: "auto" }}>
      {(products || []).map(product => { const on = selected.includes(product.retailer_id)
        return <button key={product.id} onClick={() => setSelected(current => on ? current.filter(id => id !== product.retailer_id) : current.length >= 30 ? current : [...current, product.retailer_id])}
          aria-pressed={on} style={{ border: `2px solid ${on ? "#25d366" : "#e2e8f0"}`, borderRadius: 8, padding: 0, background: "#fff", cursor: "pointer", textAlign: "left", overflow: "hidden" }}>
          {product.image_url ? <img src={product.image_url} alt="" style={{ width: "100%", height: 70, objectFit: "cover", display: "block" }} /> : <div style={{ height: 70, background: "#f1f5f9" }} />}
          <div style={{ padding: 5, fontSize: 11 }}><div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{on ? "✓ " : ""}{product.name}</div>
            <div style={{ color: "#075e54" }}>{product.price}</div></div>
        </button> })}
      {products && !products.length && !error && <div style={{ fontSize: 12, color: "#94a3b8" }}>No products found.</div>}
      {!products && <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading…</div>}
    </div>
    {selected.length > 1 && <input value={header} maxLength={60} onChange={event => setHeader(event.target.value)} placeholder="List header" style={{ ...field, marginTop: 8 }} />}
    <input value={body} maxLength={1024} onChange={event => setBody(event.target.value)} placeholder="Message" style={{ ...field, marginTop: 6 }} />
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      <button disabled={busy || !selected.length} onClick={() => send("products")} style={{ border: 0, borderRadius: 8, padding: "8px 14px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: selected.length ? 1 : .5 }}>
        {busy ? "Sending…" : selected.length > 1 ? `Send ${selected.length} products` : "Send product"}</button>
      <button disabled={busy} onClick={() => send("catalog")} style={{ border: "1px solid #075e54", borderRadius: 8, padding: "8px 14px", background: "#fff", color: "#075e54", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Send whole catalog</button>
    </div>
  </div>
}
