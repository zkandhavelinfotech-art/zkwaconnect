import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"

export const runtime = "nodejs"

const ticketSchema = z.object({
  subject: z.string().min(5).max(120),
  description: z.string().min(10).max(2000),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("HIGH"),
  wabaId: z.string().optional(),
  phoneNumber: z.string().optional(),
  errorCode: z.union([z.string(), z.number()]).optional(),
})

// POST /api/whatsapp/onboarding/support-ticket
// Allows tenants to request assisted / white-glove manual onboarding support from Super Admins.
export async function POST(request: Request) {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const body = await request.json()
    const input = ticketSchema.parse(body)

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { wabas: { include: { phoneNumbers: true } } },
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 })
    }

    const diagnosticDetails = [
      `Tenant Workspace: ${org.name} (ID: ${org.id})`,
      `Target WABA ID: ${input.wabaId || "Not yet created"}`,
      `Phone Number: ${input.phoneNumber || "Not registered"}`,
      `Diagnostic Error Code: ${input.errorCode || "None reported"}`,
      `--- Customer Description ---`,
      input.description,
    ].join("\n")

    // Create SupportTicket record
    const ticket = await prisma.supportTicket.create({
      data: {
        organizationId,
        subject: `[WABA Onboarding Assistance] ${input.subject}`,
        description: diagnosticDetails,
        priority: input.priority,
        status: "OPEN",
      },
    })

    // Update onboarding lifecycle state to MANUAL_REVIEW
    await recordLifecycleLog({
      organizationId,
      eventType: "SUPPORT_TICKET_OPENED",
      statusTo: "MANUAL_REVIEW",
      sanitizedMessage: `Assisted onboarding ticket #${ticket.id.slice(-6).toUpperCase()} created. Super Admin engineers notified.`,
    })

    return NextResponse.json({
      ok: true,
      ticketId: ticket.id,
      message: "Your onboarding assistance request has been routed to our dedicated engineering support team. An admin will review and configure your account shortly.",
    })
  } catch (error: any) {
    console.error("[ONBOARDING_SUPPORT_TICKET_ERROR]", error)
    return NextResponse.json(
      { error: error?.message || "Failed to create onboarding support ticket." },
      { status: 500 }
    )
  }
}
