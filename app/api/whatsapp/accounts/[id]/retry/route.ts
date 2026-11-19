import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { subscribeWaba } from "@/lib/meta/waba"

export const runtime = "nodejs"

// POST /api/whatsapp/accounts/[id]/retry
// Automatically retries failed phone registration or webhook subscription.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { id } = await params

    const waba = await prisma.waba.findFirst({
      where: {
        OR: [{ id }, { wabaId: id }],
        organizationId,
      },
      include: {
        phoneNumbers: true,
      },
    })

    if (!waba) {
      return NextResponse.json({ error: "WABA not found." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json(
        { error: "No active Meta authorization token. Please reconnect Meta via Embedded Signup." },
        { status: 400 }
      )
    }

    const primaryPhone = waba.phoneNumbers[0] || null
    const results: string[] = []

    // Retry 1: Webhook Subscription
    try {
      await subscribeWaba(waba.wabaId, conn.accessToken)
      results.push("Webhook subscription verified.")
    } catch (err: any) {
      results.push(`Webhook subscription warning: ${err.message}`)
    }

    // Retry 2: Phone Registration
    let phoneRegistered = false
    if (primaryPhone) {
      try {
        await metaGraph<{ success?: boolean }>(
          `${primaryPhone.phoneNumberId}/register`,
          conn.accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              pin: "123456",
            }),
          }
        )
        phoneRegistered = true
        await prisma.phoneNumber.update({
          where: { id: primaryPhone.id },
          data: { status: "CONNECTED", verificationStatus: "VERIFIED" },
        })
        results.push(`Phone number ${primaryPhone.phoneNumber} successfully registered!`)
      } catch (err: any) {
        results.push(`Phone registration note: ${err.message}`)
      }
    }

    const status = phoneRegistered ? "CONNECTED" : "ACTION_REQUIRED"

    return NextResponse.json({
      ok: true,
      status,
      results,
      message: phoneRegistered
        ? "All automated retry diagnostics completed successfully!"
        : "Retry completed with notes. Customer action may be required.",
    })
  } catch (error: any) {
    console.error("[WHATSAPP_RETRY_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Retry failed." }, { status: 500 })
  }
}
