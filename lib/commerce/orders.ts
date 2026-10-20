import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { emitEvent } from "@/lib/developer/webhooks"
import { orderSummary, productsByRetailerId } from "./catalog"

export type OrderItem = { sku: string; name: string; quantity: number; price: number; currency?: string }
export const ORDER_STATUSES = ["CHECKOUT", "NEW", "CONFIRMED", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "RECOVERED"] as const

type WhatsAppOrder = { catalog_id?: string; text?: string; product_items?: { product_retailer_id: string; quantity: number | string; item_price: number | string; currency: string }[] }

// A cart the customer sent from the WhatsApp catalog → an Order (idempotent per WhatsApp message id).
export async function recordWhatsAppOrder(input: { organizationId: string; contactId: string; conversationId: string; messageId: string
  order: WhatsAppOrder; customerName: string | null; phone: string; token: string | null }) {
  const raw = input.order.product_items || []
  const names = input.token && input.order.catalog_id
    ? await productsByRetailerId(input.order.catalog_id, input.token, raw.map(item => item.product_retailer_id)) : new Map()
  const items: OrderItem[] = raw.map(item => ({ sku: item.product_retailer_id, name: names.get(item.product_retailer_id)?.name || item.product_retailer_id,
    quantity: Number(item.quantity) || 1, price: Number(item.item_price) || 0, currency: item.currency }))
  const currency = raw[0]?.currency || "INR"
  const total = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
  const existing = await prisma.order.findUnique({ where: { organizationId_source_externalId: { organizationId: input.organizationId, source: "WHATSAPP", externalId: input.messageId } } })
  if (existing) return { order: existing, items, summary: orderSummary(items, total, currency), created: false }
  const order = await prisma.order.create({ data: { organizationId: input.organizationId, contactId: input.contactId, conversationId: input.conversationId, source: "WHATSAPP",
    externalId: input.messageId, orderNumber: `WA-${Date.now().toString(36).toUpperCase()}`, status: "NEW", currency, total, items: items as Prisma.InputJsonValue,
    customerName: input.customerName, customerPhone: input.phone, note: input.order.text?.slice(0, 1000) || null } })
  await emitEvent(input.organizationId, "order.created", orderEvent(order, items))
  await prisma.notification.create({ data: { organizationId: input.organizationId, type: "ORDER_RECEIVED", title: "New WhatsApp order",
    message: `${input.customerName || `+${input.phone}`} sent a cart: ${orderSummary(items, total, currency)}`, metadata: { orderId: order.id, conversationId: input.conversationId } } }).catch(() => null)
  return { order, items, summary: orderSummary(items, total, currency), created: true }
}

export function orderEvent(order: { id: string; source: string; orderNumber: string | null; status: string; currency: string; total: Prisma.Decimal | number
  customerName: string | null; customerPhone: string | null; paymentMethod?: string | null }, items: OrderItem[]) {
  return { order_id: order.id, source: order.source.toLowerCase(), order_number: order.orderNumber, status: order.status.toLowerCase(), currency: order.currency,
    total: Number(order.total), payment_method: order.paymentMethod || null, customer: { name: order.customerName, phone: order.customerPhone }, items }
}

export function itemsOf(value: Prisma.JsonValue): OrderItem[] {
  return Array.isArray(value) ? value.filter((item): item is OrderItem => Boolean(item && typeof item === "object" && "name" in item)) as unknown as OrderItem[] : []
}

export function itemsText(items: OrderItem[], limit = 3) {
  const text = items.slice(0, limit).map(item => `${item.quantity} × ${item.name}`).join(", ")
  return items.length > limit ? `${text} +${items.length - limit} more` : text
}
