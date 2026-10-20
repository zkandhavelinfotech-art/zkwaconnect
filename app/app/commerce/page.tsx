"use client"
import { useCallback, useEffect, useState } from "react"

type Item = { sku: string; name: string; quantity: number; price: number }
type Order = { id: string; source: string; orderNumber: string | null; status: string; paymentMethod: string | null; codStatus: string | null; currency: string; total: number
  items: Item[]; customerName: string | null; customerPhone: string | null; checkoutUrl: string | null; trackingNumber: string | null; trackingUrl: string | null
  conversationId: string | null; contactId: string | null; createdAt: string; note: string | null }
type Product = { id: string; retailer_id: string; name: string; description?: string; price?: string; image_url?: string; availability?: string }
type Account = { id: string; wabaId: string; name: string; catalog: { id: string; name: string } | { error: string } | null
  phones: { id: string; phoneNumber: string; displayName: string | null; settings: { cartEnabled: boolean; catalogVisible: boolean } | { error: string } }[] }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 18, marginBottom: 16 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid #cbd5d3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#183633", background: "#fff" }
const primary: React.CSSProperties = { border: 0, borderRadius: 6, padding: "8px 13px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }
const STATUS_COLORS: Record<string, [string, string]> = { CHECKOUT: ["#fef3c7", "#92400e"], NEW: ["#e0f2fe", "#075985"], CONFIRMED: ["#ede9fe", "#5b21b6"], PAID: ["#dcfce7", "#166534"],
  SHIPPED: ["#cffafe", "#155e75"], DELIVERED: ["#dcfce7", "#14532d"], CANCELLED: ["#fee2e2", "#991b1b"], RECOVERED: ["#dcfce7", "#166534"] }
const SOURCE_ICON: Record<string, string> = { WHATSAPP: "🟢 WhatsApp", SHOPIFY: "🛍️ Shopify", WOOCOMMERCE: "🟣 WooCommerce" }
const money = (value: number, currency: string) => `${currency === "INR" ? "₹" : `${currency} `}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

function Orders() {
  const [data, setData] = useState<{ orders: Order[]; counts: Record<string, number>; revenue30d: number; orders30d: number } | null>(null)
  const [tab, setTab] = useState("")
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState<{ id: string; status: string; trackingNumber: string; trackingUrl: string; notify: boolean } | null>(null)
  const [message, setMessage] = useState("")
  const load = useCallback(() => fetch(`/api/commerce/orders?${new URLSearchParams({ ...(tab ? { status: tab } : {}), ...(q ? { q } : {}) })}`)
    .then(response => response.json()).then(body => body.error ? setMessage(body.error) : setData(body)), [tab, q])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!editing) return
    const response = await fetch("/api/commerce/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) })
    const body = await response.json()
    setMessage(body.message || body.error); setEditing(null); load()
  }

  const tabs: [string, string][] = [["", "All orders"], ["NEW", "New"], ["CONFIRMED", "Confirmed"], ["PAID", "Paid"], ["SHIPPED", "Shipped"], ["DELIVERED", "Delivered"], ["CANCELLED", "Cancelled"], ["ABANDONED", "Abandoned carts"]]
  return <>
    {data && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 10, marginBottom: 14 }}>
      {[["Orders (30 days)", String(data.orders30d)], ["Revenue (30 days)", money(data.revenue30d, "INR")], ["Waiting for action", String(data.counts.NEW || 0)],
        ["Abandoned carts", String(data.counts.CHECKOUT || 0)], ["Recovered carts", String(data.counts.RECOVERED || 0)]].map(([label, value]) =>
        <div key={label} style={{ ...card, marginBottom: 0, padding: "12px 14px" }}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{label}</div>
          <div style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{value}</div></div>)}
    </div>}
    {message && <div role="status" style={{ padding: 10, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{message}</div>}
    <section style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between", borderBottom: "1px solid #e8efee" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} style={{ border: 0, borderRadius: 16, padding: "5px 11px",
          fontSize: 11, fontWeight: 700, cursor: "pointer", background: tab === value ? "#075e54" : "#eef2f1", color: tab === value ? "#fff" : "#49615e" }}>
          {label}{value && value !== "ABANDONED" && data?.counts[value] ? ` ${data.counts[value]}` : ""}</button>)}</div>
        <input value={q} onChange={event => setQ(event.target.value)} placeholder="Search order, name, phone" style={{ ...input, padding: "6px 10px", minWidth: 200 }} />
      </div>
      {!data ? <p style={{ padding: 16, fontSize: 12, color: "#64748b" }}>Loading orders…</p> : !data.orders.length ? <p style={{ padding: 16, fontSize: 12, color: "#94a3b8" }}>
        No orders here yet. Orders appear when customers send a cart from your WhatsApp catalog, or from a connected Shopify / WooCommerce store.</p> :
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
          <thead style={{ background: "#f7faf9", color: "#647b77" }}><tr>{["Order", "Customer", "Items", "Total", "Status", ""].map(text => <th key={text} style={{ padding: 10, fontWeight: 600 }}>{text}</th>)}</tr></thead>
          <tbody>{data.orders.map(order => { const [bg, fg] = STATUS_COLORS[order.status] || ["#eef2f1", "#49615e"]
            return <tr key={order.id} style={{ borderTop: "1px solid #edf1f0", verticalAlign: "top" }}>
              <td style={{ padding: 10 }}><div style={{ fontWeight: 700, color: "#183633" }}>{order.orderNumber || order.id.slice(-6)}</div>
                <div style={{ color: "#71817e", marginTop: 2 }}>{SOURCE_ICON[order.source] || order.source} · {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div></td>
              <td style={{ padding: 10 }}>{order.customerName || "—"}<div style={{ color: "#71817e" }}>{order.customerPhone ? `+${order.customerPhone}` : ""}</div></td>
              <td style={{ padding: 10, maxWidth: 260 }}>{order.items.slice(0, 3).map(item => <div key={item.sku + item.name}>{item.quantity} × {item.name}</div>)}
                {order.items.length > 3 && <div style={{ color: "#71817e" }}>+{order.items.length - 3} more</div>}{order.note && <div style={{ color: "#71817e", marginTop: 3 }}>“{order.note}”</div>}</td>
              <td style={{ padding: 10, fontWeight: 700 }}>{money(order.total, order.currency)}<div style={{ fontWeight: 400, color: "#71817e" }}>{order.paymentMethod || ""}{order.codStatus ? ` · COD ${order.codStatus.toLowerCase()}` : ""}</div></td>
              <td style={{ padding: 10 }}><span style={{ background: bg, color: fg, borderRadius: 20, padding: "3px 9px", fontWeight: 700, fontSize: 11 }}>{order.status === "CHECKOUT" ? "Abandoned" : order.status.toLowerCase()}</span>
                {order.trackingNumber && <div style={{ color: "#71817e", marginTop: 4 }}>🚚 {order.trackingNumber}</div>}</td>
              <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                {order.conversationId && <a href="/app/inbox" style={{ color: "#075e54", fontWeight: 700, marginRight: 10, textDecoration: "none" }}>Chat</a>}
                {order.contactId && order.source === "WHATSAPP" && <a href={`/app/payments?contact=${order.contactId}&amount=${order.total}&description=${encodeURIComponent(`Order ${order.orderNumber || ""}`)}`}
                  style={{ color: "#075e54", fontWeight: 700, marginRight: 10, textDecoration: "none" }}>Payment link</a>}
                {order.status !== "CHECKOUT" && <button onClick={() => setEditing({ id: order.id, status: order.status, trackingNumber: order.trackingNumber || "", trackingUrl: order.trackingUrl || "", notify: order.source === "WHATSAPP" })}
                  style={{ border: 0, background: "none", color: "#075e54", fontWeight: 700, cursor: "pointer", padding: 0 }}>Update</button>}
                {editing?.id === order.id && <div style={{ display: "grid", gap: 6, marginTop: 8, minWidth: 220 }}>
                  <select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })} style={input}>
                    {["NEW", "CONFIRMED", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"].map(status => <option key={status} value={status}>{status.toLowerCase()}</option>)}</select>
                  {editing.status === "SHIPPED" && <><input placeholder="Tracking number" value={editing.trackingNumber} onChange={event => setEditing({ ...editing, trackingNumber: event.target.value })} style={input} />
                    <input placeholder="Tracking link (https://…)" value={editing.trackingUrl} onChange={event => setEditing({ ...editing, trackingUrl: event.target.value })} style={input} /></>}
                  {order.source === "WHATSAPP" && <label style={{ fontSize: 11, color: "#475569" }}><input type="checkbox" checked={editing.notify} onChange={event => setEditing({ ...editing, notify: event.target.checked })} /> Message the customer on WhatsApp</label>}
                  <span style={{ display: "flex", gap: 6 }}><button onClick={save} style={primary}>Save</button><button onClick={() => setEditing(null)} style={{ ...primary, background: "#fff", color: "#64748b", border: "1px solid #cbd5d3" }}>Cancel</button></span>
                </div>}
              </td></tr> })}</tbody></table></div>}
    </section>
  </>
}

function Catalog() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [catalogs, setCatalogs] = useState<{ id: string; name: string; product_count?: number }[]>([])
  const [choice, setChoice] = useState("")
  const [products, setProducts] = useState<Product[] | null>(null)
  const [q, setQ] = useState("")
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ retailerId: "", name: "", description: "", price: "", imageUrl: "", url: "", inStock: true })
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function load() {
    const response = await fetch("/api/commerce")
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setAccounts(body.accounts); setCatalogs(body.catalogs || [])
    if (body.catalogsError) setError(`Couldn't list your catalogs: ${body.catalogsError}. You may need to reconnect Facebook to grant catalog access.`)
  }
  const loadProducts = useCallback(() => fetch(`/api/commerce/products?q=${encodeURIComponent(q)}`).then(response => response.json())
    .then(body => body.error ? setProducts([]) : setProducts(body.products)), [q])
  useEffect(() => { load() }, [])
  const connected = accounts?.some(account => account.catalog && "id" in account.catalog)
  useEffect(() => { if (connected) { const timer = setTimeout(loadProducts, 300); return () => clearTimeout(timer) } }, [connected, loadProducts])

  async function post(url: string, body: unknown) {
    setError(""); setNotice("")
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) { setError(result.error || "Failed"); return false }
    setNotice(result.message); return true
  }

  if (!accounts) return <p style={{ fontSize: 13, color: error ? "#9f2d22" : "#64748b" }}>{error || "Loading catalog…"}</p>
  return <>
    {error && <div role="alert" style={{ padding: 10, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 10, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{notice}</div>}
    {accounts.map(account => <section key={account.id} style={card}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: "0 0 8px" }}>{account.name}</h2>
      {account.catalog && "id" in account.catalog ? <div style={{ fontSize: 13 }}>📦 Catalog connected: <strong>{account.catalog.name}</strong> <span style={{ color: "#94a3b8" }}>({account.catalog.id})</span>
        <a href={`https://business.facebook.com/commerce/catalogs/${account.catalog.id}/products`} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: "#075e54", fontWeight: 700, fontSize: 12 }}>Open in Commerce Manager ↗</a></div>
        : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
          No catalog connected.
          {catalogs.length ? <><select value={choice} onChange={event => setChoice(event.target.value)} style={input}><option value="">Choose a catalog…</option>
            {catalogs.map(item => <option key={item.id} value={item.id}>{item.name}{item.product_count !== undefined ? ` (${item.product_count} products)` : ""}</option>)}</select>
            <button disabled={!choice} onClick={async () => { if (await post("/api/commerce", { action: "connect", wabaId: account.id, catalogId: choice })) load() }} style={primary}>Connect</button></>
            : <a href="https://business.facebook.com/commerce/" target="_blank" rel="noreferrer" style={{ color: "#075e54", fontWeight: 700 }}>Create a catalog in Commerce Manager ↗</a>}
        </div>}
      {account.phones.map(phone => "error" in phone.settings ? <p key={phone.id} style={{ fontSize: 12, color: "#94a3b8" }}>{phone.phoneNumber}: shopping settings unavailable ({phone.settings.error})</p> :
        <div key={phone.id} style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
          <strong>{phone.displayName || phone.phoneNumber}</strong>
          {(["catalogVisible", "cartEnabled"] as const).map(key => { const settings = phone.settings as { cartEnabled: boolean; catalogVisible: boolean }
            return <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={settings[key]} onChange={async event => { if (await post("/api/commerce", { action: "settings", phoneId: phone.id, ...settings, [key]: event.target.checked })) load() }} />
              {key === "cartEnabled" ? "Cart (customers can send orders)" : "Show catalog on your WhatsApp profile"}</label> })}
        </div>)}
    </section>)}

    {connected && <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={q} onChange={event => setQ(event.target.value)} placeholder="Search products" style={{ ...input, minWidth: 240 }} />
        <button onClick={() => setAdding(value => !value)} style={primary}>{adding ? "Close" : "+ Add product"}</button>
      </div>
      {adding && <form onSubmit={async event => { event.preventDefault()
        if (await post("/api/commerce/products", { ...form, price: Number(form.price) })) { setForm({ retailerId: "", name: "", description: "", price: "", imageUrl: "", url: "", inStock: true }); setAdding(false); loadProducts() } }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 8, marginBottom: 14, background: "#f7faf9", padding: 12, borderRadius: 8 }}>
        {([["retailerId", "SKU (content ID)"], ["name", "Product name"], ["price", "Price (₹)"], ["imageUrl", "Image URL (https)"], ["url", "Product page URL"]] as const).map(([key, label]) =>
          <input key={key} required aria-label={label} placeholder={label} value={form[key]} type={key === "price" ? "number" : "text"} step="0.01" onChange={event => setForm({ ...form, [key]: event.target.value })} style={input} />)}
        <textarea required aria-label="Description" placeholder="Description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} style={{ ...input, fontFamily: "inherit" }} />
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={form.inStock} onChange={event => setForm({ ...form, inStock: event.target.checked })} /> In stock</label>
        <button type="submit" style={primary}>Add to catalog</button>
      </form>}
      {!products ? <p style={{ fontSize: 12, color: "#64748b" }}>Loading products…</p> : !products.length ? <p style={{ fontSize: 12, color: "#94a3b8" }}>No products found.</p> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>{products.map(product =>
          <article key={product.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
            {product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" style={{ width: "100%", height: 120, objectFit: "cover", background: "#f1f5f9" }} />
              : <div style={{ height: 120, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🛍️</div>}
            <div style={{ padding: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#183633" }}>{product.name}</div>
              <div style={{ fontSize: 12, color: "#075e54", fontWeight: 700 }}>{product.price}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU {product.retailer_id}{product.availability && product.availability !== "in stock" ? ` · ${product.availability}` : ""}</div></div>
          </article>)}</div>}
    </section>}
  </>
}

export default function CommercePage() {
  const [tab, setTab] = useState<"orders" | "catalog">("orders")
  useEffect(() => { if (window.location.hash === "#catalog") setTab("catalog") }, [])
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Commerce</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Sell on WhatsApp: share products, receive carts as orders, and follow orders from your Shopify or WooCommerce store.</p>
      </div>
      <a href="/app/integrations" style={{ ...primary, background: "#fff", color: "#075e54", border: "1px solid #cbd5d3", textDecoration: "none" }}>Connect Shopify / WooCommerce →</a>
    </div>
    <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
      {([["orders", "📦 Orders"], ["catalog", "🛍️ Catalog & cart"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
        style={{ border: 0, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: tab === value ? "#075e54" : "#e9efed", color: tab === value ? "#fff" : "#49615e" }}>{label}</button>)}
    </div>
    {tab === "orders" ? <Orders /> : <Catalog />}
  </div>
}
