import crypto from "node:crypto"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { normalizePhone } from "@/lib/contacts/phone"
import { emitEvent } from "@/lib/developer/webhooks"
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/token"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { buildTemplateMessage } from "@/lib/whatsapp/template-media"
import { itemsOf, itemsText, orderEvent, type OrderItem } from "@/lib/commerce/orders"

// ---------- configuration ----------
export const AUTOMATIONS = {
  orderConfirmation: { label: "Order confirmation", hint: "When a new order is placed (prepaid orders, or all orders if COD confirmation is off)." },
  codConfirmation: { label: "COD confirmation", hint: "Cash-on-delivery orders get a template with Confirm / Cancel buttons; the reply updates the order." },
  shipped: { label: "Shipping update", hint: "When the order is fulfilled / shipped (tracking number and link available)." },
  cancelled: { label: "Order cancelled", hint: "When the order is cancelled in the store." },
  abandonedCart: { label: "Abandoned cart reminder", hint: "When a checkout isn't completed after the delay (Shopify checkouts, or carts your WooCommerce plugin sends us)." },
} as const
export type AutomationKey = keyof typeof AUTOMATIONS
export const ORDER_FIELDS = ["customer_name", "first_name", "order_number", "total", "items", "payment_method", "tracking_number", "tracking_url", "checkout_url", "store_name"] as const

const automationSchema = z.object({ enabled: z.boolean().default(false), templateId: z.string().optional(), variables: z.array(z.string().max(300)).max(20).default([]),
  delayMinutes: z.number().int().min(15).max(10080).optional() })
export const storeConfigSchema = z.object({
  shopDomain: z.string().optional(), siteUrl: z.string().optional(), storeName: z.string().optional(), phoneNumberId: z.string().optional(),
  countryCode: z.string().regex(/^\d{1,4}$/).default("91"), abandonedNeedsConsent: z.boolean().default(true),
  automations: z.object({ orderConfirmation: automationSchema, codConfirmation: automationSchema, shipped: automationSchema, cancelled: automationSchema, abandonedCart: automationSchema })
    .partial().default({}),
  webhookIds: z.array(z.union([z.string(), z.number()])).default([]), webhookError: z.string().nullable().default(null),
})
export type StoreConfig = z.infer<typeof storeConfigSchema>
type Secrets = { accessToken?: string; apiSecret?: string; consumerKey?: string; consumerSecret?: string; webhookSecret: string }

export const readConfig = (value: unknown) => storeConfigSchema.parse(value || {})
export const sealSecrets = (secrets: Secrets) => encryptMetaToken(JSON.stringify(secrets))
export const openSecrets = (value: string | null): Secrets => value ? JSON.parse(decryptMetaToken(value)) : { webhookSecret: "" }

// ---------- signatures ----------
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
// Shopify: base64 HMAC-SHA256 of the raw body with the app's API secret. WooCommerce: same, with the webhook secret.
export function verifyStoreSignature(type: string, secrets: Secrets, rawBody: string, headers: Headers) {
  const key = type === "SHOPIFY" ? secrets.apiSecret : secrets.webhookSecret
  const given = headers.get(type === "SHOPIFY" ? "x-shopify-hmac-sha256" : "x-wc-webhook-signature") || headers.get("x-zkwa-signature") || ""
  if (!key || !given) return false
  return safeEqual(crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("base64"), given)
}

// ---------- store API calls ----------
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01"
export function shopDomainOf(raw: string) {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host) ? host : null
}
async function storeFetch<T>(url: string, init: RequestInit & { auth: Record<string, string> }) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init.auth }, signal: AbortSignal.timeout(20000), redirect: "error" })
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 200) || response.statusText}`)
  return (text ? JSON.parse(text) : {}) as T
}
export function storeApi(type: string, config: StoreConfig, secrets: Secrets) {
  if (type === "SHOPIFY") {
    const base = `https://${config.shopDomain}/admin/api/${API_VERSION}`
    const auth = { "X-Shopify-Access-Token": secrets.accessToken || "" }
    return { get: <T>(path: string) => storeFetch<T>(`${base}${path}`, { auth }), send: <T>(method: string, path: string, body?: unknown) => storeFetch<T>(`${base}${path}`, { method, auth, body: body ? JSON.stringify(body) : undefined }) }
  }
  const base = `${(config.siteUrl || "").replace(/\/$/, "")}/wp-json/wc/v3`
  const auth = { Authorization: `Basic ${Buffer.from(`${secrets.consumerKey}:${secrets.consumerSecret}`).toString("base64")}` }
  return { get: <T>(path: string) => storeFetch<T>(`${base}${path}`, { auth }), send: <T>(method: string, path: string, body?: unknown) => storeFetch<T>(`${base}${path}`, { method, auth, body: body ? JSON.stringify(body) : undefined }) }
}

export const SHOPIFY_TOPICS = ["orders/create", "orders/cancelled", "fulfillments/create", "checkouts/create", "checkouts/update"]
export const WOO_TOPICS = ["order.created", "order.updated"]

// Check credentials and register the store's webhooks pointing at us. Webhook errors are kept, not thrown (e.g. on localhost).
export async function connectStore(type: string, config: StoreConfig, secrets: Secrets, webhookUrl: string) {
  const api = storeApi(type, config, secrets)
  let storeName: string
  if (type === "SHOPIFY") storeName = (await api.get<{ shop: { name: string } }>("/shop.json")).shop.name
  else { const status = await api.get<{ environment?: { site_url?: string }; settings?: { title?: string } }>("/system_status"); storeName = status.settings?.title || status.environment?.site_url || config.siteUrl || "WooCommerce" }
  const webhookIds: (string | number)[] = []
  let webhookError: string | null = null
  if (!webhookUrl.startsWith("https://")) webhookError = `The store can only send events to a public https:// address (this server is ${new URL(webhookUrl).origin}). Set APP_URL after deploying, then reconnect.`
  else {
    for (const topic of type === "SHOPIFY" ? SHOPIFY_TOPICS : WOO_TOPICS) {
      try {
        if (type === "SHOPIFY") webhookIds.push((await api.send<{ webhook: { id: number } }>("POST", "/webhooks.json", { webhook: { topic, address: webhookUrl, format: "json" } })).webhook.id)
        else webhookIds.push((await api.send<{ id: number }>("POST", "/webhooks", { name: `ZKWAConnect ${topic}`, topic, delivery_url: webhookUrl, secret: secrets.webhookSecret, status: "active" })).id)
      } catch (error) { webhookError = `${topic}: ${(error as Error).message}` }
    }
  }
  return { storeName, webhookIds, webhookError }
}

export async function disconnectStore(type: string, config: StoreConfig, secrets: Secrets) {
  const api = storeApi(type, config, secrets)
  for (const id of config.webhookIds) await api.send("DELETE", type === "SHOPIFY" ? `/webhooks/${id}.json` : `/webhooks/${id}?force=true`).catch(() => null)
}

// ---------- normalizing store payloads ----------
type Normalized = { externalId: string; orderNumber: string; status: string; paymentMethod: string | null; cod: boolean; currency: string; total: number; items: OrderItem[]
  name: string | null; firstName: string | null; phone: string | null; email: string | null; trackingNumber?: string | null; trackingUrl?: string | null
  checkoutToken?: string | null; checkoutUrl?: string | null; acceptsMarketing: boolean }
type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function shopifyOrder(o: Any): Normalized {
  const address = o.shipping_address || o.billing_address || {}
  const gateways: string[] = o.payment_gateway_names || []
  const cod = gateways.some(name => /cash on delivery|\bcod\b/i.test(name))
  const first = o.customer?.first_name || address.first_name || null
  return { externalId: String(o.id), orderNumber: o.name || `#${o.order_number}`, status: o.cancelled_at ? "CANCELLED" : o.financial_status === "paid" ? "PAID" : "NEW",
    paymentMethod: cod ? "COD" : gateways[0] || null, cod, currency: o.currency || "INR", total: Number(o.total_price) || 0,
    items: (o.line_items || []).map((item: Any) => ({ sku: String(item.sku || item.variant_id || item.id), name: item.title || item.name, quantity: Number(item.quantity) || 1, price: Number(item.price) || 0 })),
    name: [first, o.customer?.last_name || address.last_name].filter(Boolean).join(" ") || null, firstName: first,
    phone: o.phone || o.customer?.phone || address.phone || o.billing_address?.phone || null, email: o.email || o.customer?.email || null,
    checkoutToken: o.checkout_token || null, acceptsMarketing: Boolean(o.buyer_accepts_marketing || o.customer?.accepts_marketing) }
}
function shopifyCheckout(c: Any): Normalized {
  const address = c.shipping_address || c.billing_address || {}
  return { ...shopifyOrder({ ...c, id: `checkout:${c.token}`, name: `Cart ${String(c.token).slice(0, 6)}` }), externalId: `checkout:${c.token}`, status: "CHECKOUT",
    phone: c.phone || c.customer?.phone || address.phone || c.sms_marketing_phone || null, checkoutToken: c.token, checkoutUrl: c.abandoned_checkout_url || null,
    acceptsMarketing: Boolean(c.buyer_accepts_marketing || c.buyer_accepts_sms_marketing) }
}
function wooOrder(o: Any): Normalized {
  const billing = o.billing || {}, shipping = o.shipping || {}
  const status = ({ pending: "NEW", processing: "PAID", "on-hold": "NEW", completed: "DELIVERED", cancelled: "CANCELLED", refunded: "CANCELLED", failed: "CANCELLED", shipped: "SHIPPED" } as Record<string, string>)[o.status] || "NEW"
  const tracking = (o.meta_data || []).find((meta: Any) => /tracking_(number|code)/.test(meta.key))?.value
  return { externalId: String(o.id), orderNumber: `#${o.number || o.id}`, status, paymentMethod: o.payment_method === "cod" ? "COD" : o.payment_method_title || null,
    cod: o.payment_method === "cod", currency: o.currency || "INR", total: Number(o.total) || 0,
    items: (o.line_items || []).map((item: Any) => ({ sku: String(item.sku || item.product_id), name: item.name, quantity: Number(item.quantity) || 1, price: Number(item.price) || 0 })),
    name: [billing.first_name, billing.last_name].filter(Boolean).join(" ") || null, firstName: billing.first_name || null,
    phone: billing.phone || shipping.phone || null, email: billing.email || null, trackingNumber: typeof tracking === "string" ? tracking : null, acceptsMarketing: false }
}
function customCart(c: Any): Normalized {
  return { externalId: `checkout:${c.id || c.token || crypto.createHash("sha1").update(`${c.phone}${c.checkout_url}`).digest("hex").slice(0, 16)}`, orderNumber: "Cart", status: "CHECKOUT",
    paymentMethod: null, cod: false, currency: c.currency || "INR", total: Number(c.total) || 0,
    items: (c.items || []).map((item: Any) => ({ sku: String(item.sku || item.name), name: String(item.name), quantity: Number(item.quantity) || 1, price: Number(item.price) || 0 })),
    name: c.name || null, firstName: String(c.name || "").split(" ")[0] || null, phone: c.phone || null, email: c.email || null,
    checkoutUrl: c.checkout_url || null, checkoutToken: c.id || null, acceptsMarketing: Boolean(c.accepts_marketing) }
}

// ---------- sending automations ----------
function fieldValue(order: { orderNumber: string | null; total: Prisma.Decimal | number; currency: string; items: Prisma.JsonValue; customerName: string | null; paymentMethod: string | null
  trackingNumber: string | null; trackingUrl: string | null; checkoutUrl: string | null }, storeName: string, key: string) {
  if (key.startsWith("text:")) return key.slice(5)
  const map: Record<string, string> = { customer_name: order.customerName || "there", first_name: (order.customerName || "there").split(" ")[0], order_number: order.orderNumber || "",
    total: `${order.currency === "INR" ? "₹" : `${order.currency} `}${Number(order.total).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`, items: itemsText(itemsOf(order.items)),
    payment_method: order.paymentMethod || "", tracking_number: order.trackingNumber || "-", tracking_url: order.trackingUrl || "-", checkout_url: order.checkoutUrl || "-", store_name: storeName }
  return map[key] ?? ""
}

export async function sendAutomation(integrationId: string, orderId: string, key: AutomationKey) {
  const integration = await prisma.integration.findUniqueOrThrow({ where: { id: integrationId } })
  const config = readConfig(integration.config)
  const automation = config.automations[key]
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
  const notified = (order.notified && typeof order.notified === "object" ? order.notified : {}) as Record<string, string>
  if (!automation?.enabled || !automation.templateId || notified[key] || !order.customerPhone || integration.status !== "ACTIVE") return false
  const phone = await prisma.phoneNumber.findFirst({ where: { status: "CONNECTED", waba: { organizationId: integration.organizationId, status: "CONNECTED" }, ...(config.phoneNumberId ? { id: config.phoneNumberId } : {}) } })
  const template = await prisma.template.findFirst({ where: { id: automation.templateId, organizationId: integration.organizationId, status: "APPROVED" } })
  const token = await getMetaAccessToken(integration.organizationId)
  if (!phone || !template || !token) throw new Error(!phone ? "No connected WhatsApp number." : !template ? `The ${AUTOMATIONS[key].label} template isn't approved any more.` : "Meta isn't connected.")
  if (template.wabaId !== phone.wabaId) throw new Error("The template belongs to a different WhatsApp account than the sending number.")
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: order.contactId! } })
  const conversation = await findOrCreateConversation({ organizationId: integration.organizationId, phoneNumberId: phone.id, contactId: contact.id, reopen: false })
  const needed = new Set([...(template.content || "").matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1])).size
  const values = Array.from({ length: needed }, (_, index) => fieldValue(order, config.storeName || integration.name, automation.variables[index] || "customer_name").replace(/[\r\n\t]+/g, " ").trim() || "-")
  const message = await buildTemplateMessage(template, values, { accessToken: token, metaPhoneNumberId: phone.phoneNumberId })
  // COD: quick-reply buttons carry the order id, so the customer's tap updates the right order.
  if (key === "codConfirmation") {
    const buttons = ((Array.isArray(template.components) ? template.components : []) as { type?: string; buttons?: { type?: string; text?: string }[] }[])
      .find(component => component.type?.toUpperCase() === "BUTTONS")?.buttons || []
    const extra = buttons.map((button, index) => button.type?.toUpperCase() === "QUICK_REPLY"
      ? { type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload: `${/cancel|no\b/i.test(button.text || "") ? "cod_cancel" : "cod_confirm"}:${order.id}` }] } : null).filter(Boolean)
    message.components = [...(message.components || []), ...(extra as Record<string, unknown>[])]
  }
  const preview = (template.content || template.name).replace(/\{\{(\d+)\}\}/g, (match, number) => values[Number(number) - 1] ?? match)
  await sendAndRecord({ accessToken: token, metaPhoneNumberId: phone.phoneNumberId, to: contact.phone, conversationId: conversation.id },
    { type: "template", template: message }, preview, { source: integration.type, templateId: template.id, orderId: order.id, automation: key })
  await prisma.order.update({ where: { id: order.id }, data: { notified: { ...notified, [key]: new Date().toISOString() }, conversationId: conversation.id } })
  return true
}

// ---------- processing store events ----------
async function upsertOrder(integration: { id: string; organizationId: string; type: string }, normalized: Normalized, countryCode: string) {
  const phone = normalized.phone ? normalizePhone(normalized.phone, countryCode) : null
  const contact = phone ? await prisma.contact.upsert({ where: { organizationId_phone: { organizationId: integration.organizationId, phone } },
    create: { organizationId: integration.organizationId, phone, name: normalized.name, email: normalized.email, source: integration.type, optedIn: normalized.acceptsMarketing, tags: [integration.type.toLowerCase()] },
    update: { ...(normalized.name ? { name: normalized.name } : {}), ...(normalized.email ? { email: normalized.email } : {}), ...(normalized.acceptsMarketing ? { optedIn: true } : {}) } }) : null
  const key = { organizationId_source_externalId: { organizationId: integration.organizationId, source: integration.type, externalId: normalized.externalId } }
  const existing = await prisma.order.findUnique({ where: key })
  const data = { orderNumber: normalized.orderNumber, paymentMethod: normalized.paymentMethod, currency: normalized.currency, total: normalized.total,
    items: normalized.items as Prisma.InputJsonValue, customerName: normalized.name, customerPhone: phone, customerEmail: normalized.email, contactId: contact?.id ?? null,
    ...(normalized.checkoutUrl ? { checkoutUrl: normalized.checkoutUrl } : {}), ...(normalized.trackingNumber ? { trackingNumber: normalized.trackingNumber } : {}),
    ...(normalized.trackingUrl ? { trackingUrl: normalized.trackingUrl } : {}) }
  const order = existing
    ? await prisma.order.update({ where: { id: existing.id }, data: { ...data, ...(existing.status === "CHECKOUT" || normalized.status === "CANCELLED" || normalized.status === "SHIPPED" || normalized.status === "DELIVERED"
      ? { status: normalized.status } : {}) } })
    : await prisma.order.create({ data: { organizationId: integration.organizationId, integrationId: integration.id, source: integration.type, externalId: normalized.externalId,
      status: normalized.status, codStatus: normalized.cod ? "PENDING" : null, ...data } })
  return { order, created: !existing, previousStatus: existing?.status }
}

export async function processStoreEvent(integrationId: string, topic: string, payload: Any) {
  const integration = await prisma.integration.findUniqueOrThrow({ where: { id: integrationId } })
  const config = readConfig(integration.config)
  const isCart = topic.startsWith("checkouts/") || topic === "cart.abandoned"
  if (isCart) {
    if (payload.completed_at) return "checkout completed"
    const normalized = integration.type === "SHOPIFY" && topic !== "cart.abandoned" ? shopifyCheckout(payload) : customCart(payload)
    const { order } = await upsertOrder(integration, normalized, config.countryCode)
    const automation = config.automations.abandonedCart
    if (automation?.enabled && order.status === "CHECKOUT" && order.customerPhone && !(order.notified as Record<string, string> | null)?.abandonedCart)
      await prisma.order.update({ where: { id: order.id }, data: { remindAt: order.remindAt || new Date(Date.now() + (automation.delayMinutes || 60) * 60_000) } })
    return "cart saved"
  }
  if (topic === "fulfillments/create") {
    const order = await prisma.order.findUnique({ where: { organizationId_source_externalId: { organizationId: integration.organizationId, source: "SHOPIFY", externalId: String(payload.order_id) } } })
    if (!order) return "unknown order"
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED", trackingNumber: payload.tracking_number || order.trackingNumber, trackingUrl: payload.tracking_url || order.trackingUrl } })
    await emitEvent(integration.organizationId, "order.updated", orderEvent(updated, itemsOf(updated.items)))
    await sendAutomation(integration.id, order.id, "shipped").catch(error => noteError(integration.id, error))
    return "shipped"
  }
  const normalized = integration.type === "SHOPIFY" ? shopifyOrder(payload) : wooOrder(payload)
  const { order, created, previousStatus } = await upsertOrder(integration, normalized, config.countryCode)
  // A completed order closes its abandoned checkout (counted as recovered if we had reminded the customer).
  if (normalized.checkoutToken) {
    const cart = await prisma.order.findUnique({ where: { organizationId_source_externalId: { organizationId: integration.organizationId, source: integration.type, externalId: `checkout:${normalized.checkoutToken}` } } })
    if (cart?.status === "CHECKOUT") await prisma.order.update({ where: { id: cart.id }, data: { status: (cart.notified as Record<string, string> | null)?.abandonedCart ? "RECOVERED" : "CANCELLED", remindAt: null } })
  }
  if (created) {
    await emitEvent(integration.organizationId, "order.created", orderEvent(order, itemsOf(order.items)))
    const key: AutomationKey = normalized.cod && config.automations.codConfirmation?.enabled ? "codConfirmation" : "orderConfirmation"
    await sendAutomation(integration.id, order.id, key).catch(error => noteError(integration.id, error))
  } else if (order.status !== previousStatus) {
    await emitEvent(integration.organizationId, "order.updated", orderEvent(order, itemsOf(order.items)))
    if (order.status === "CANCELLED") await sendAutomation(integration.id, order.id, "cancelled").catch(error => noteError(integration.id, error))
    if (order.status === "SHIPPED") await sendAutomation(integration.id, order.id, "shipped").catch(error => noteError(integration.id, error))
  }
  return created ? "order created" : "order updated"
}

async function noteError(integrationId: string, error: unknown) {
  await prisma.integration.update({ where: { id: integrationId }, data: { lastError: (error instanceof Error ? error.message : String(error)).slice(0, 300) } }).catch(() => null)
}

// Background job: abandoned-cart reminders that are due.
export async function sendDueCartReminders(limit = 20) {
  const due = await prisma.order.findMany({ where: { status: "CHECKOUT", remindAt: { lte: new Date() }, integrationId: { not: null } }, take: limit })
  for (const cart of due) {
    const claimed = await prisma.order.updateMany({ where: { id: cart.id, remindAt: cart.remindAt }, data: { remindAt: null } })
    if (!claimed.count) continue
    const integration = await prisma.integration.findUnique({ where: { id: cart.integrationId! } })
    if (!integration) continue
    const config = readConfig(integration.config)
    const contact = cart.contactId ? await prisma.contact.findUnique({ where: { id: cart.contactId } }) : null
    if (config.abandonedNeedsConsent && !contact?.optedIn) { await noteError(integration.id, `Cart reminder skipped for ${cart.customerPhone}: no marketing consent.`); continue }
    await sendAutomation(integration.id, cart.id, "abandonedCart").catch(error => noteError(integration.id, error))
  }
  return due.length
}

// Customer tapped Confirm / Cancel on a COD template.
export async function handleCodReply(organizationId: string, payload: string) {
  const match = /^cod_(confirm|cancel):(.+)$/.exec(payload)
  if (!match) return null
  const order = await prisma.order.findFirst({ where: { id: match[2], organizationId } })
  if (!order || order.codStatus !== "PENDING") return order ? "already answered" : null
  const confirmed = match[1] === "confirm"
  const updated = await prisma.order.update({ where: { id: order.id }, data: { codStatus: confirmed ? "CONFIRMED" : "CANCELLED", status: confirmed ? "CONFIRMED" : "CANCELLED" } })
  await emitEvent(organizationId, "order.updated", orderEvent(updated, itemsOf(updated.items)))
  // Reflect the answer in the store (tag on Shopify, status/note on WooCommerce).
  const integration = order.integrationId ? await prisma.integration.findUnique({ where: { id: order.integrationId } }) : null
  if (integration) {
    const api = storeApi(integration.type, readConfig(integration.config), openSecrets(integration.secretEncrypted))
    const sync = integration.type === "SHOPIFY"
      ? api.get<{ order: { tags: string } }>(`/orders/${order.externalId}.json?fields=tags`).then(result => api.send("PUT", `/orders/${order.externalId}.json`,
          { order: { id: Number(order.externalId), tags: [result.order.tags, confirmed ? "cod-confirmed" : "cod-cancelled"].filter(Boolean).join(", ") } }))
      : api.send("PUT", `/orders/${order.externalId}`, confirmed ? { customer_note: "COD confirmed on WhatsApp" } : { status: "cancelled" })
    await sync.catch(error => noteError(integration.id, `Couldn't update the order in the store: ${(error as Error).message}`))
  }
  return confirmed ? "confirmed" : "cancelled"
}
