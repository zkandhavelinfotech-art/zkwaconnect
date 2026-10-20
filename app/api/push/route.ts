import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { sendPush, vapidKeys } from "@/lib/push"

export const runtime = "nodejs"

// Web Push for the installed app: public key, subscribe, unsubscribe, test.
export async function GET() {
  try {
    const { userId } = await requireMember()
    return NextResponse.json({ publicKey: (await vapidKeys()).publicKey, subscriptions: await prisma.pushSubscription.count({ where: { userId } }) })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) }) }
}

const schema = z.object({ endpoint: z.string().url().startsWith("https://"), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(8) }) })

export async function POST(request: Request) {
  try {
    const { userId } = await requireMember()
    const body = await request.json()
    if (body.test) {
      const sent = await sendPush([userId], { title: "ZKWAConnect notifications are on ✅", body: "You'll get an alert like this when a customer messages you.", url: "/app/inbox", tag: "test" })
      return NextResponse.json({ ok: true, message: sent ? "Test notification sent." : "No device is subscribed yet." })
    }
    const subscription = schema.parse(body)
    await prisma.pushSubscription.upsert({ where: { endpoint: subscription.endpoint },
      create: { userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 200) },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } })
    return NextResponse.json({ ok: true, message: "Notifications turned on for this device." })
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid subscription." : error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) }) }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireMember()
    const endpoint = new URL(request.url).searchParams.get("endpoint") || ""
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })
    return NextResponse.json({ ok: true, message: "Notifications turned off for this device." })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) }) }
}
