import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { emitEvent } from "@/lib/developer/webhooks"
import { itemsOf, orderEvent, ORDER_STATUSES } from "@/lib/commerce/orders"
import { serviceWindowOpen } from "@/lib/billing/messaging"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { sendAndRecord } from "@/lib/whatsapp/send"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })

// Orders from WhatsApp carts, Shopify and WooCommerce, plus abandoned checkouts.
export async function GET(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const url = new URL(request.url)
    const source = url.searchParams.get("source"), status = url.searchParams.get("status"), q = (url.searchParams.get("q") || "").trim()
    const where: Prisma.OrderWhereInput = { organizationId, ...(source ? { source } : {}),
      ...(status === "ABANDONED" ? { status: "CHECKOUT" } : status ? { status } : { status: { not: "CHECKOUT" } }),
      ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q.replace(/\D/g, "") || q } }] } : {}) }
    const [orders, counts, revenue] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.order.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { organizationId, status: { notIn: ["CHECKOUT", "CANCELLED"] }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _sum: { total: true }, _count: { _all: true } }),
    ])
    return NextResponse.json({ orders: orders.map(order => ({ ...order, total: Number(order.total), items: itemsOf(order.items) })),
      counts: Object.fromEntries(counts.map(row => [row.status, row._count._all])), revenue30d: Number(revenue._sum.total || 0), orders30d: revenue._count._all })
  } catch (error) { return fail(error) }
}

const MESSAGES: Record<string, (order: { orderNumber: string | null; trackingNumber?: string | null; trackingUrl?: string | null }) => string> = {
  CONFIRMED: order => `✅ Your order ${order.orderNumber || ""} is confirmed. We'll let you know when it ships.`,
  PAID: order => `💳 Payment received for order ${order.orderNumber || ""}. Thank you!`,
  SHIPPED: order => `🚚 Your order ${order.orderNumber || ""} has shipped.${order.trackingNumber ? ` Tracking: ${order.trackingNumber}.` : ""}${order.trackingUrl ? ` Track it here: ${order.trackingUrl}` : ""}`,
  DELIVERED: order => `📦 Your order ${order.orderNumber || ""} was delivered. We hope you love it!`,
  CANCELLED: order => `Your order ${order.orderNumber || ""} has been cancelled. Reply here if you have any questions.`,
}

export async function PATCH(request: Request) {
  try {
    const { organizationId, userId } = await requireMember()
    const input = z.object({ id: z.string().min(1), status: z.enum(ORDER_STATUSES), trackingNumber: z.string().trim().max(100).optional(),
      trackingUrl: z.string().trim().url().optional().or(z.literal("")), notify: z.boolean().default(false) }).parse(await request.json())
    const order = await prisma.order.findFirst({ where: { id: input.id, organizationId } })
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: input.status,
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber || null } : {}), ...(input.trackingUrl !== undefined ? { trackingUrl: input.trackingUrl || null } : {}) } })
    await emitEvent(organizationId, "order.updated", orderEvent(updated, itemsOf(updated.items)))
    let notice = "Order updated."
    // Optional WhatsApp update to the customer (free-form, so only inside the 24-hour window).
    if (input.notify && MESSAGES[input.status] && updated.conversationId) {
      const conversation = await prisma.conversation.findUnique({ where: { id: updated.conversationId }, include: { contact: true, phoneNumber: true } })
      const token = await getMetaAccessToken(organizationId)
      if (!conversation?.phoneNumber || !token) notice = "Order updated. Couldn't message the customer (WhatsApp not connected)."
      else if (!(await serviceWindowOpen(conversation.id))) notice = "Order updated. The 24-hour window is closed, so send an order-update template from the inbox."
      else {
        const text = MESSAGES[input.status](updated)
        await sendAndRecord({ accessToken: token, metaPhoneNumberId: conversation.phoneNumber.phoneNumberId, to: conversation.contact.phone, conversationId: conversation.id, senderUserId: userId },
          { type: "text", text: { preview_url: true, body: text } }, text, { source: "ORDER_UPDATE", orderId: updated.id })
        notice = "Order updated and the customer was messaged on WhatsApp."
      }
    }
    return NextResponse.json({ ok: true, message: notice })
  } catch (error) { return fail(error) }
}
