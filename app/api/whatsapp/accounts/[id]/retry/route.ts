import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken, getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { subscribeWaba } from "@/lib/meta/waba"
import { sanitizeMetaError } from "@/lib/whatsapp/error-sanitizer"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"

export const runtime = "nodejs"

// POST /api/whatsapp/accounts/[id]/retry
// Automated self-healing diagnostic retry engine for WABA, registration, and webhooks.
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

    const accessToken = await getMetaAccessToken(organizationId)

    if (!accessToken) {
      const sanitized = sanitizeMetaError({ code: 190, message: "No active token" })
      await recordLifecycleLog({
        organizationId,
        eventType: "RETRY_FAILED",
        statusTo: "ACTION_REQUIRED",
        rawError: { code: 190 },
        sanitizedMessage: sanitized.clientMessage,
      })
      return NextResponse.json(
        { error: sanitized.clientMessage, title: sanitized.title, status: "ACTION_REQUIRED" },
        { status: 400 }
      )
    }

    const primaryPhone = waba.phoneNumbers[0] || null
    const diagnostics: { step: string; success: boolean; detail: string }[] = []
    let isFullyResolved = true

    // Step 1: Token Validity Check
    try {
      await metaGraph<any>(`debug_token?input_token=${encodeURIComponent(accessToken)}`, accessToken)
      diagnostics.push({ step: "Token Verification", success: true, detail: "Meta OAuth token is active and valid." })
    } catch (err: any) {
      isFullyResolved = false
      const s = sanitizeMetaError(err)
      diagnostics.push({ step: "Token Verification", success: false, detail: s.clientMessage })
    }

    // Step 2: Webhook Subscription
    try {
      await subscribeWaba(waba.wabaId, accessToken)
      diagnostics.push({ step: "Webhook Subscription", success: true, detail: "Subscribed to messages and account updates." })
    } catch (err: any) {
      diagnostics.push({ step: "Webhook Subscription", success: false, detail: `Subscription warning: ${err.message}` })
    }

    // Step 3: Phone Number Registration on Cloud API
    let phoneRegistered = false
    if (primaryPhone) {
      try {
        await metaGraph<{ success?: boolean }>(
          `${primaryPhone.phoneNumberId}/register`,
          accessToken,
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
        diagnostics.push({ step: "Phone Registration", success: true, detail: `Phone ${primaryPhone.phoneNumber} registered with 6-digit PIN.` })
      } catch (err: any) {
        const s = sanitizeMetaError(err)
        diagnostics.push({ step: "Phone Registration", success: false, detail: s.clientMessage })
      }
    }

    // Step 4: Zero-copy Agency Partner Linking
    const agencyPartnerId = process.env.META_AGENCY_BUSINESS_ID || "246511357935583"
    const clientBizId = waba.metaBusinessId
    if (clientBizId && agencyPartnerId) {
      try {
        await metaGraph<{ success?: boolean }>(
          `${clientBizId}/agencies`,
          accessToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              business: agencyPartnerId,
              permitted_tasks: ["MANAGE", "CREATE_CONTENT", "MESSAGING", "MODERATE", "ADVERTISE", "ANALYZE"],
            }),
          }
        )
        diagnostics.push({ step: "Agency Partner Linking", success: true, detail: "Agency partner Zkandhavel Infotech verified." })
      } catch {
        // Non-blocking
      }
    }

    const finalStatus = phoneRegistered ? "CONNECTED" : "ACTION_REQUIRED"

    await recordLifecycleLog({
      organizationId,
      eventType: "DIAGNOSTIC_RETRY",
      statusTo: finalStatus,
      sanitizedMessage: phoneRegistered ? "Self-healing diagnostics restored connection." : "Diagnostics identified pending action.",
    })

    return NextResponse.json({
      ok: true,
      status: finalStatus,
      isFullyResolved,
      diagnostics,
      message: phoneRegistered
        ? "✓ Automated self-healing diagnostics completed successfully! WhatsApp line is connected."
        : "Diagnostics completed. Review details for required customer action.",
    })
  } catch (error: any) {
    console.error("[WHATSAPP_RETRY_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Retry engine failed." }, { status: 500 })
  }
}
