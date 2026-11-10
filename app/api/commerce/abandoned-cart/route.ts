import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { itemsOf, itemsText } from "@/lib/commerce/orders"

export const runtime = "nodejs"

async function getMember() {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  return membership ? { organizationId: membership.organizationId, userId: session!.user.id } : null
}

const SETTING_PREFIX = "abandoned_cart_bot"

export async function GET(request: Request) {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { organizationId } = member

    const [abandonedOrders, recoveredOrders, setting] = await Promise.all([
      prisma.order.findMany({
        where: {
          organizationId,
          status: { in: ["CHECKOUT", "NEW"] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.order.findMany({
        where: {
          organizationId,
          status: "RECOVERED",
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.platformSetting.findUnique({
        where: { key: `${SETTING_PREFIX}:${organizationId}` },
      }),
    ])

    const config = (setting?.value as Record<string, unknown>) || {
      enabled: true,
      delayMinutes: 30,
      discountCode: "SAVE10",
      discountPercent: 10,
    }

    const abandonedCount = abandonedOrders.length
    const recoveredCount = recoveredOrders.length
    const recoveredRevenue = recoveredOrders.reduce((sum, o) => sum + Number(o.total), 0)
    const lostRevenue = abandonedOrders.reduce((sum, o) => sum + Number(o.total), 0)

    return NextResponse.json({
      config,
      stats: {
        abandonedCount,
        recoveredCount,
        lostRevenue,
        recoveredRevenue,
        recoveryRate: abandonedCount + recoveredCount > 0
          ? Math.round((recoveredCount / (abandonedCount + recoveredCount)) * 100)
          : 0,
      },
      abandonedOrders: abandonedOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        total: Number(o.total),
        currency: o.currency,
        itemsSummary: itemsText(itemsOf(o.items)),
        createdAt: o.createdAt,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load abandoned cart details." },
      { status: 500 }
    )
  }
}

const configSchema = z.object({
  action: z.enum(["update_config", "sweep_recovery"]),
  enabled: z.boolean().optional(),
  delayMinutes: z.number().min(5).max(1440).optional(),
  discountCode: z.string().trim().max(20).optional(),
  discountPercent: z.number().min(0).max(90).optional(),
})

export async function POST(request: Request) {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { organizationId, userId } = member

    const input = configSchema.parse(await request.json())

    if (input.action === "update_config") {
      const updatedConfig = {
        enabled: input.enabled ?? true,
        delayMinutes: input.delayMinutes ?? 30,
        discountCode: input.discountCode ?? "SAVE10",
        discountPercent: input.discountPercent ?? 10,
      }
      await prisma.platformSetting.upsert({
        where: { key: `${SETTING_PREFIX}:${organizationId}` },
        create: {
          key: `${SETTING_PREFIX}:${organizationId}`,
          value: updatedConfig,
        },
        update: {
          value: updatedConfig,
        },
      })
      return NextResponse.json({ ok: true, message: "Abandoned cart recovery bot settings saved." })
    }

    // Sweep and recover: send WhatsApp alerts for orders older than delayMinutes
    const setting = await prisma.platformSetting.findUnique({
      where: { key: `${SETTING_PREFIX}:${organizationId}` },
    })
    const config = (setting?.value as Record<string, unknown>) || {
      enabled: true,
      delayMinutes: 30,
      discountCode: "SAVE10",
    }

    const delayMinutes = Number(config.delayMinutes) || 30
    const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000)

    const candidates = await prisma.order.findMany({
      where: {
        organizationId,
        status: { in: ["CHECKOUT", "NEW"] },
        createdAt: { lte: cutoff },
        customerPhone: { not: null },
      },
      include: {
        contact: true,
      },
      take: 20,
    })

    const phoneRecord = await prisma.phoneNumber.findFirst({
      where: { waba: { organizationId }, status: "CONNECTED" },
    })

    const accessToken = await getMetaAccessToken(organizationId)
    let processed = 0
    let alerted = 0

    for (const order of candidates) {
      processed++
      const phone = order.customerPhone?.replace(/\D/g, "")
      if (!phone) continue

      const items = itemsOf(order.items)
      const summary = itemsText(items)
      const discount = String(config.discountCode || "SAVE10")

      // Message content
      const text = `Hi ${order.customerName || "there"}! 👋 We noticed you left *${summary}* in your cart (Total: ₹${order.total}).\n\nComplete your order now with *${discount}* for an exclusive discount! Click here to review and checkout: ${order.checkoutUrl || `https://zkwaconnect.in/pay/${order.orderNumber}`}`

      if (accessToken && phoneRecord) {
        try {
          await sendAndRecord(
            {
              accessToken,
              metaPhoneNumberId: phoneRecord.phoneNumberId,
              to: phone,
              conversationId: order.conversationId || "",
              senderUserId: userId,
            },
            { type: "text", text: { body: text, preview_url: true } },
            text,
            { source: "ABANDONED_CART_BOT" }
          )
          alerted++
        } catch {
          // If 24h window closed, continue
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Recovery sweep completed. Scanned ${processed} abandoned cart(s), sent ${alerted} WhatsApp alert(s).`,
      processed,
      alerted,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process recovery sweep." },
      { status: 400 }
    )
  }
}
