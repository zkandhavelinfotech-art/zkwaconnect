"use client"
import { useEffect, useMemo, useState } from "react"

type AutomationKey = "orderConfirmation" | "codConfirmation" | "shipped" | "cancelled" | "abandonedCart"
type Automation = { enabled: boolean; templateId?: string; variables: string[]; delayMinutes?: number }
type Integration = { id: string; type: "SHOPIFY" | "WOOCOMMERCE" | "INBOUND_HOOK"; name: string; status: string; url: string; lastEventAt: string | null; lastError: string | null
  stats: Record<string, number>; config: { shopDomain?: string; siteUrl?: string; storeName?: string; phoneNumberId?: string; countryCode: string; abandonedNeedsConsent: boolean
    automations: Partial<Record<AutomationKey, Automation>>; webhookError: string | null } }
type Template = { id: string; name: string; language: string; category: string | null; content: string | null; variables: number; quickReplies: number }
type Data = { integrations: Integration[]; templates: Template[]; phones: { id: string; phoneNumber: string; displayName: string | null }[]
  sheets: { id: string; url: string; events: string[]; active: boolean; lastDeliveryAt: string | null; lastError: string | null; failureCount: number }[]
  automations: Record<AutomationKey, { label: string; hint: string }>; fields: string[]; publicBase: string }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginBottom: 18 }
const input: React.CSSProperties = { boxSizing: "border-box", border: "1px solid #cbd5d3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#183633", background: "#fff" }
const primary: React.CSSProperties = { border: 0, borderRadius: 6, padding: "9px 14px", background: "#075e54", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }
const ghost: React.CSSProperties = { ...primary, background: "#fff", color: "#075e54", border: "1px solid #cbd5d3" }
const code: React.CSSProperties = { display: "block", background: "#0f172a", color: "#e2e8f0", borderRadius: 8, padding: "12px 14px", fontSize: 11.5, overflowX: "auto", whiteSpace: "pre", lineHeight: 1.5, maxHeight: 320 }
const FIELD_LABELS: Record<string, string> = { customer_name: "Customer name", first_name: "First name", order_number: "Order number", total: "Order total", items: "Items",
  payment_method: "Payment method", tracking_number: "Tracking number", tracking_url: "Tracking link", checkout_url: "Checkout (cart) link", store_name: "Store name" }
const SHEET_EVENTS: [string, string][] = [["message.received", "Incoming messages"], ["contact.created", "New contacts"], ["order.created", "New orders"], ["form.submitted", "Form submissions"], ["order.updated", "Order updates"]]

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* blocked */ } }}
    style={{ ...ghost, padding: "5px 10px", fontSize: 11 }}>{done ? "Copied ✓" : "Copy"}</button>
}

function sheetScript(token: string) {
  return `// ZKWAConnect → Google Sheets. Paste into Extensions → Apps Script, then Deploy → New deployment → Web app
// (Execute as: Me · Who has access: Anyone) and copy the Web app URL back into ZKWAConnect.
const TOKEN = "${token}";

function doPost(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) return ContentService.createTextOutput("forbidden");
  const body = JSON.parse(e.postData.contents);
  const name = (body.event || "events").replace(/[^\\w.]/g, "_");
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  const row = flatten(body.data || {});
  row.received_at = body.created_at;
  const headers = sheet.getLastRow() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  Object.keys(row).forEach(function (key) {
    if (headers.indexOf(key) === -1) { headers.push(key); sheet.getRange(1, headers.length).setValue(key); }
  });
  sheet.appendRow(headers.map(function (key) { return row[key] === undefined ? "" : row[key]; }));
  return ContentService.createTextOutput("ok");
}

function flatten(value, prefix, out) {
  out = out || {};
  Object.keys(value).forEach(function (key) {
    const item = value[key], name = prefix ? prefix + "." + key : key;
    if (item && typeof item === "object" && !Array.isArray(item)) flatten(item, name, out);
    else out[name] = Array.isArray(item) ? JSON.stringify(item) : item;
  });
  return out;
}`
}

function rowScript(hookUrl: string) {
  return `// Google Sheet → WhatsApp. Columns: phone | name | (any). Add a trigger: Triggers → Add → sendNewRow · On form submit (or On change).
const HOOK_URL = "${hookUrl}";
const TEMPLATE = "your_template_name";   // approved template; {{1}} = name

function sendNewRow(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = sheet.getRange(sheet.getLastRow(), 1, 1, headers.length).getValues()[0];
  const get = function (name) { return row[headers.indexOf(name)]; };
  UrlFetchApp.fetch(HOOK_URL, { method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ phone: String(get("phone")), name: get("name"), tags: ["google-sheet"],
      template: { name: TEMPLATE, variables: [get("name") || "there"] } }) });
}`
}

function StoreCard({ item, data, onChange, call }: { item: Integration; data: Data; onChange: () => void; call: (method: string, body?: unknown, query?: string) => Promise<boolean> }) {
  const [automations, setAutomations] = useState(item.config.automations)
  const [phoneId, setPhoneId] = useState(item.config.phoneNumberId || "")
  const [consent, setConsent] = useState(item.config.abandonedNeedsConsent)
  const set = (key: AutomationKey, patch: Partial<Automation>) => setAutomations(current => ({ ...current, [key]: { enabled: false, variables: [], ...current[key], ...patch } }))
  const keys = Object.keys(data.automations) as AutomationKey[]
  return <section style={card}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div>
        <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, margin: 0 }}>{item.type === "SHOPIFY" ? "🛍️" : "🟣"} {item.name}</h3>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{item.config.shopDomain || item.config.siteUrl} · last event {item.lastEventAt ? new Date(item.lastEventAt).toLocaleString("en-IN") : "none yet"}
          {Object.keys(item.stats).length > 0 && ` · 30 days: ${Object.entries(item.stats).map(([status, count]) => `${count} ${status === "CHECKOUT" ? "abandoned" : status.toLowerCase()}`).join(", ")}`}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={async () => { if (await call("PATCH", { id: item.id, status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })) onChange() }} style={ghost}>{item.status === "ACTIVE" ? "Pause" : "Resume"}</button>
        <button onClick={async () => { if (window.confirm(`Disconnect ${item.name}? Its webhooks are removed from the store.`) && await call("DELETE", undefined, `id=${item.id}`)) onChange() }} style={{ ...ghost, color: "#b91c1c" }}>Disconnect</button>
      </div>
    </div>
    {item.config.webhookError && <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", borderRadius: 6, padding: "8px 10px", marginTop: 10 }}>⚠ {item.config.webhookError}
      <div style={{ marginTop: 4 }}>Webhook URL: <code>{item.url}</code> <Copy text={item.url} /></div></div>}
    {item.lastError && <div style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>Last problem: {item.lastError}</div>}

    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "14px 0 6px", fontSize: 12 }}>
      Send from <select value={phoneId} onChange={event => setPhoneId(event.target.value)} style={input}><option value="">First connected number</option>
        {data.phones.map(phone => <option key={phone.id} value={phone.id}>{phone.displayName || phone.phoneNumber}</option>)}</select>
    </div>
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>{keys.map(key => {
      const automation: Automation = { enabled: false, variables: [], ...automations[key] }
      const template = data.templates.find(item => item.id === automation.templateId)
      const options = data.templates.filter(item => key !== "codConfirmation" || item.quickReplies >= 2)
      return <div key={key} style={{ border: `1px solid ${automation.enabled ? "#86efac" : "#e2e8f0"}`, borderRadius: 8, padding: 12, background: automation.enabled ? "#f7fdf9" : "#fff" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={automation.enabled} onChange={event => set(key, { enabled: event.target.checked })} />{data.automations[key].label}</label>
        <div style={{ fontSize: 11, color: "#64748b", margin: "3px 0 8px 22px" }}>{data.automations[key].hint}</div>
        {automation.enabled && <div style={{ marginLeft: 22, display: "grid", gap: 8 }}>
          <select value={automation.templateId || ""} onChange={event => set(key, { templateId: event.target.value, variables: [] })} style={input}>
            <option value="">{options.length ? "Choose an approved template" : key === "codConfirmation" ? "No approved template with 2 quick-reply buttons (Confirm / Cancel)" : "No approved templates"}</option>
            {options.map(item => <option key={item.id} value={item.id}>{item.name} · {item.language}{item.category ? ` · ${item.category.toLowerCase()}` : ""}</option>)}</select>
          {template?.content && <div style={{ fontSize: 12, color: "#334155", background: "#f8fafc", borderRadius: 6, padding: "6px 9px", whiteSpace: "pre-wrap" }}>{template.content}</div>}
          {template && Array.from({ length: template.variables }, (_, index) => {
            const value = automation.variables[index] || ""
            const fixed = value.startsWith("text:")
            return <div key={index} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <strong style={{ color: "#075e54", minWidth: 40 }}>{`{{${index + 1}}}`}</strong>
              <select value={fixed ? "text:" : value} onChange={event => { const next = [...automation.variables]; next[index] = event.target.value; set(key, { variables: next }) }} style={input}>
                <option value="">Choose…</option>{data.fields.map(field => <option key={field} value={field}>{FIELD_LABELS[field] || field}</option>)}<option value="text:">Fixed text…</option></select>
              {fixed && <input value={value.slice(5)} placeholder="Text" onChange={event => { const next = [...automation.variables]; next[index] = `text:${event.target.value}`; set(key, { variables: next }) }} style={input} />}
            </div>
          })}
          {key === "abandonedCart" && <>
            <label style={{ fontSize: 12 }}>Send after <select value={automation.delayMinutes || 60} onChange={event => set(key, { delayMinutes: Number(event.target.value) })} style={input}>
              {[[30, "30 minutes"], [60, "1 hour"], [180, "3 hours"], [720, "12 hours"], [1440, "24 hours"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> without checkout</label>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Only customers who accepted marketing at checkout (recommended — this is a marketing message)</label>
          </>}
          {key === "codConfirmation" && <div style={{ fontSize: 11, color: "#64748b" }}>Use a template with two quick-reply buttons, e.g. “Confirm order” and “Cancel order”. The reply updates the order here and in your store.</div>}
        </div>}
      </div> })}</div>
    <button onClick={async () => { if (await call("PATCH", { id: item.id, automations, phoneNumberId: phoneId, abandonedNeedsConsent: consent })) onChange() }} style={{ ...primary, marginTop: 12 }}>Save automations</button>
  </section>
}

export default function IntegrationsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState<"" | "shopify" | "woo" | "sheets">("")
  const [shopify, setShopify] = useState({ shopDomain: "", accessToken: "", apiSecret: "" })
  const [woo, setWoo] = useState({ siteUrl: "", consumerKey: "", consumerSecret: "" })
  const [sheetUrl, setSheetUrl] = useState("")
  const [sheetEvents, setSheetEvents] = useState(["message.received", "contact.created"])
  const [hookName, setHookName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const sheetToken = useMemo(() => Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, "0")).join(""), [])

  async function load() {
    const response = await fetch("/api/integrations")
    const body = await response.json()
    if (!response.ok) { setError(body.error); return }
    setData(body)
  }
  useEffect(() => { load() }, [])

  async function call(method: string, body?: unknown, query = "") {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/integrations${query ? `?${query}` : ""}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed")
      setNotice(result.message || "Saved.")
      return true
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Failed"); return false }
    finally { setBusy(false) }
  }

  if (!data) return <div style={{ padding: 24, color: error ? "#9f2d22" : "#64748b" }}>{error || "Loading integrations…"}</div>
  const stores = data.integrations.filter(item => item.type !== "INBOUND_HOOK")
  const hooks = data.integrations.filter(item => item.type === "INBOUND_HOOK")
  const step = (n: number, text: React.ReactNode) => <li style={{ marginBottom: 6 }}><strong>{n}.</strong> {text}</li>

  return <div style={{ maxWidth: 980 }}>
    <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Integrations</h1>
    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 18px" }}>Connect your store for order updates, COD confirmation and abandoned-cart recovery; log events to Google Sheets; and automate with Zapier, Pabbly or Make.</p>
    {error && <div role="alert" style={{ padding: 11, background: "#fff1f0", color: "#9f2d22", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 11, background: "#eaf8f1", color: "#176b4b", borderRadius: 6, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "0 0 10px" }}>🛒 Stores</h2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 12, marginBottom: 18 }}>
      <section style={{ ...card, marginBottom: 0 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>🛍️ Shopify</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>Orders, COD confirmation, shipping updates and abandoned checkouts.</p>
        {open !== "shopify" ? <button onClick={() => setOpen("shopify")} style={primary}>Connect Shopify</button> : <form onSubmit={async event => { event.preventDefault(); if (await call("POST", { type: "SHOPIFY", ...shopify })) { setOpen(""); load() } }}>
          <ol style={{ fontSize: 12, color: "#334155", paddingLeft: 0, listStyle: "none" }}>
            {step(1, <>Shopify admin → <em>Settings → Apps and sales channels → Develop apps → Create an app</em>.</>)}
            {step(2, <>Admin API scopes: <code>read_orders, write_orders, read_checkouts, read_fulfillments, read_customers</code>. Install the app.</>)}
            {step(3, <>Copy the <strong>Admin API access token</strong> (shpat_…) and the <strong>API secret key</strong>.</>)}
          </ol>
          <div style={{ display: "grid", gap: 8 }}>
            <input required placeholder="your-store.myshopify.com" value={shopify.shopDomain} onChange={event => setShopify({ ...shopify, shopDomain: event.target.value })} style={input} />
            <input required type="password" placeholder="Admin API access token (shpat_…)" value={shopify.accessToken} onChange={event => setShopify({ ...shopify, accessToken: event.target.value })} style={input} />
            <input required type="password" placeholder="API secret key" value={shopify.apiSecret} onChange={event => setShopify({ ...shopify, apiSecret: event.target.value })} style={input} />
            <span style={{ display: "flex", gap: 6 }}><button disabled={busy} type="submit" style={primary}>{busy ? "Connecting…" : "Connect"}</button><button type="button" onClick={() => setOpen("")} style={ghost}>Cancel</button></span>
          </div></form>}
      </section>
      <section style={{ ...card, marginBottom: 0 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>🟣 WooCommerce</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>Orders, COD confirmation and status updates (abandoned carts via your cart plugin).</p>
        {open !== "woo" ? <button onClick={() => setOpen("woo")} style={primary}>Connect WooCommerce</button> : <form onSubmit={async event => { event.preventDefault(); if (await call("POST", { type: "WOOCOMMERCE", ...woo })) { setOpen(""); load() } }}>
          <ol style={{ fontSize: 12, color: "#334155", paddingLeft: 0, listStyle: "none" }}>
            {step(1, <>WordPress → <em>WooCommerce → Settings → Advanced → REST API → Add key</em>.</>)}
            {step(2, <>Permissions: <strong>Read/Write</strong>. Copy the consumer key (ck_…) and secret (cs_…).</>)}
          </ol>
          <div style={{ display: "grid", gap: 8 }}>
            <input required placeholder="https://your-store.com" value={woo.siteUrl} onChange={event => setWoo({ ...woo, siteUrl: event.target.value })} style={input} />
            <input required placeholder="Consumer key (ck_…)" value={woo.consumerKey} onChange={event => setWoo({ ...woo, consumerKey: event.target.value })} style={input} />
            <input required type="password" placeholder="Consumer secret (cs_…)" value={woo.consumerSecret} onChange={event => setWoo({ ...woo, consumerSecret: event.target.value })} style={input} />
            <span style={{ display: "flex", gap: 6 }}><button disabled={busy} type="submit" style={primary}>{busy ? "Connecting…" : "Connect"}</button><button type="button" onClick={() => setOpen("")} style={ghost}>Cancel</button></span>
          </div></form>}
      </section>
    </div>
    {stores.map(item => <StoreCard key={item.id} item={item} data={data} onChange={load} call={call} />)}
    {stores.some(item => item.type === "WOOCOMMERCE") && <details style={{ ...card, fontSize: 12, color: "#334155" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>WooCommerce abandoned carts (for developers)</summary>
      <p>WooCommerce doesn&apos;t send abandoned-cart events itself. From your cart plugin or a small snippet, POST the cart as JSON to your store&apos;s webhook URL with header
        <code> X-ZKWA-Topic: cart.abandoned</code> and <code>X-WC-Webhook-Signature</code> = base64 HMAC-SHA256 of the body using the webhook secret WooCommerce shows for the ZKWAConnect webhooks:</p>
      <code style={code}>{`{ "id": "cart-123", "phone": "919876543210", "name": "Asha", "checkout_url": "https://your-store.com/checkout/?recover=…",
  "total": 1499, "currency": "INR", "accepts_marketing": true, "items": [{ "name": "Kurta", "quantity": 1, "price": 1499 }] }`}</code>
    </details>}

    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "8px 0 10px" }}>📊 Google Sheets</h2>
    <section style={card}>
      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Log messages, contacts, orders and form submissions to a Google Sheet automatically — no Google account linking needed.</p>
      {data.sheets.map(sheet => <div key={sheet.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: !sheet.active ? "#94a3b8" : sheet.failureCount ? "#f59e0b" : "#22c55e" }} />
        <code style={{ flex: 1, wordBreak: "break-all" }}>{sheet.url}</code><span style={{ color: "#64748b" }}>{sheet.events.join(", ")} · last row {sheet.lastDeliveryAt ? new Date(sheet.lastDeliveryAt).toLocaleString("en-IN") : "none yet"}</span>
        {sheet.lastError && <span style={{ color: "#b91c1c" }}>{sheet.lastError}</span>}
        <button onClick={async () => { if (await call("DELETE", undefined, `sheet=${sheet.id}`)) load() }} style={{ ...ghost, padding: "4px 9px", color: "#b91c1c" }}>Disconnect</button>
      </div>)}
      {open !== "sheets" ? <button onClick={() => setOpen("sheets")} style={primary}>+ Connect a Google Sheet</button> : <div>
        <ol style={{ fontSize: 12, color: "#334155", paddingLeft: 0, listStyle: "none" }}>
          {step(1, <>Open (or create) a Google Sheet → <em>Extensions → Apps Script</em>. Replace the code with this script (it contains your private token): <Copy text={sheetScript(sheetToken)} /></>)}
          {step(2, <>Click <em>Deploy → New deployment → Web app</em>, Execute as <strong>Me</strong>, Who has access <strong>Anyone</strong>, then <em>Deploy</em> and authorise.</>)}
          {step(3, <>Paste the <strong>Web app URL</strong> below and choose what to log. Each type of event gets its own tab.</>)}
        </ol>
        <code style={code}>{sheetScript(sheetToken)}</code>
        <form onSubmit={async event => { event.preventDefault(); if (await call("POST", { type: "SHEETS", webAppUrl: sheetUrl.trim(), token: sheetToken, events: sheetEvents })) { setOpen(""); setSheetUrl(""); load() } }} style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input required placeholder="https://script.google.com/macros/s/…/exec" value={sheetUrl} onChange={event => setSheetUrl(event.target.value)} style={input} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{SHEET_EVENTS.map(([value, label]) => { const on = sheetEvents.includes(value)
            return <label key={value} style={{ fontSize: 12, border: `1px solid ${on ? "#075e54" : "#d7e2df"}`, borderRadius: 16, padding: "4px 10px", cursor: "pointer" }}>
              <input type="checkbox" checked={on} onChange={() => setSheetEvents(current => on ? current.filter(item => item !== value) : [...current, value])} /> {label}</label> })}</div>
          <span style={{ display: "flex", gap: 6 }}><button disabled={busy} type="submit" style={primary}>Connect sheet</button><button type="button" onClick={() => setOpen("")} style={ghost}>Cancel</button></span>
        </form>
      </div>}
    </section>

    <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, margin: "8px 0 10px" }}>⚡ Zapier, Pabbly, Make &amp; Google Sheet → WhatsApp</h2>
    <section style={card}>
      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}><strong>Send WhatsApp from another app:</strong> create a hook and use its URL in a “Webhook / HTTP POST” action (Zapier “Webhooks by Zapier”, Pabbly “API by Pabbly”, Make “HTTP”).
        Body (JSON): <code>{`{"phone":"919876543210","name":"Asha","tags":["lead"],"template":{"name":"welcome","variables":["Asha"]}}`}</code> — leave out <code>template</code> to only save the contact.</p>
      <form onSubmit={async event => { event.preventDefault(); if (await call("POST", { type: "INBOUND_HOOK", name: hookName })) { setHookName(""); load() } }} style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input required minLength={2} placeholder="Hook name, e.g. Pabbly – website leads" value={hookName} onChange={event => setHookName(event.target.value)} style={{ ...input, flex: 1, minWidth: 220 }} />
        <button disabled={busy} type="submit" style={primary}>Create hook</button>
      </form>
      {hooks.map(hook => <div key={hook.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{hook.name}</strong>{hook.status !== "ACTIVE" && <span style={{ color: "#92400e" }}>(paused)</span>}
          <code style={{ flex: 1, wordBreak: "break-all", color: "#475569" }}>{hook.url}</code><Copy text={hook.url} />
          <button onClick={async () => { if (await call("PATCH", { id: hook.id, status: hook.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })) load() }} style={{ ...ghost, padding: "4px 9px" }}>{hook.status === "ACTIVE" ? "Pause" : "Resume"}</button>
          <button onClick={async () => { if (window.confirm("Delete this hook? Apps using its URL will stop working.") && await call("DELETE", undefined, `id=${hook.id}`)) load() }} style={{ ...ghost, padding: "4px 9px", color: "#b91c1c" }}>Delete</button>
        </div>
        <div style={{ color: "#94a3b8", marginTop: 4 }}>Last used {hook.lastEventAt ? new Date(hook.lastEventAt).toLocaleString("en-IN") : "never"}{hook.lastError ? ` · last error: ${hook.lastError}` : ""}</div>
        <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", color: "#075e54", fontWeight: 700 }}>Google Sheet → WhatsApp script for this hook</summary><code style={{ ...code, marginTop: 6 }}>{rowScript(hook.url)}</code></details>
      </div>)}
      <p style={{ fontSize: 12, color: "#64748b", margin: "12px 0 0" }}><strong>Start a Zap / scenario from WhatsApp events</strong> (new message, new contact, new order…): paste your Zapier catch-hook / Pabbly / Make webhook URL as an endpoint under
        <a href="/app/developers" style={{ color: "#075e54", fontWeight: 700 }}> Developers → Webhooks</a>. For full control use the REST API with an API key.</p>
    </section>
  </div>
}
