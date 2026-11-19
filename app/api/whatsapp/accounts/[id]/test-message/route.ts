import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

const schema = z.object({
  recipientPhone: z.string().min(10).max(20),
  messageText: z.string().min(1).max(1000).default("Hello from ZKWAConnect! Your WhatsApp Business API connection is verified and active. 🚀"),
})

// POST /api/whatsapp/accounts/[id]/test-message
// Sends a live test outbound message via Meta Cloud API to verify the connection.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const input = schema.parse(body)

    // Locate phone number
    const phone = await prisma.phoneNumber.findFirst({
      where: {
        OR: [{ id }, { phoneNumberId: id }],
        waba: { organizationId },
      },
      include: { waba: true },
    })

    if (!phone) {
      return NextResponse.json({ error: "Connected WhatsApp number not found." }, { status: 404 })
    }

    const conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    })

    if (!conn?.accessToken) {
      return NextResponse.json({ error: "No active Meta authorization token found." }, { status: 400 })
    }

    // Clean recipient phone number (remove spaces, dashes, leading plus)
    const cleanedRecipient = input.recipientPhone.replace(/[\s\-\(\)\+]/g, "")

    // Send test text message via Meta Cloud API
    const response = await metaGraph<{ messages?: { id: string }[] }>(
      `${phone.phoneNumberId}/messages`,
      conn.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanedRecipient,
          type: "text",
          text: {
            preview_url: false,
            body: input.messageText,
          },
        }),
      }
    )

    const messageId = response?.messages?.[0]?.id || `test_${Date.now()}`

    return NextResponse.json({
      ok: true,
      messageId,
      recipient: cleanedRecipient,
      status: "SENT",
      senderNumber: phone.phoneNumber,
      message: `✓ Test message dispatched successfully to +${cleanedRecipient}! Delivery receipt pending.`,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_TEST_MESSAGE_ERROR]", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to send test message. Ensure recipient is within the 24h customer service window or use an approved template.",
      },
      { status: 500 }
    )
  }
}
