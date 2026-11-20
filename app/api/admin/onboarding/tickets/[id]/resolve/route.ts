import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getAdminSession } from "@/lib/auth/admin"
import { recordLifecycleLog } from "@/lib/whatsapp/lifecycle"

export const runtime = "nodejs"

// POST /api/admin/onboarding/tickets/[id]/resolve
// Resolves or updates status of an assisted onboarding ticket.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminSession()
    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const status = body.status || "RESOLVED"
    const resolutionNotes = body.notes || "Setup completed by Super Admin."

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { organization: true },
    })

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 })
    }

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        closedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null,
        description: `${ticket.description}\n\n[Admin Resolution - ${new Date().toISOString()}]: ${resolutionNotes}`,
      },
    })

    if (status === "RESOLVED" || status === "CLOSED") {
      await recordLifecycleLog({
        organizationId: ticket.organizationId,
        eventType: "SUPPORT_TICKET_RESOLVED",
        statusTo: "CONNECTED",
        sanitizedMessage: `Assisted onboarding ticket #${id.slice(-6).toUpperCase()} was marked resolved by support admin.`,
      })

      // Dispatch in-app notification to the tenant workspace
      try {
        await prisma.notification.create({
          data: {
            organizationId: ticket.organizationId,
            type: "SUPPORT_TICKET_RESOLVED",
            title: `Onboarding Support Ticket #${id.slice(-6).toUpperCase()} Resolved`,
            message: `Your assisted WhatsApp onboarding ticket was resolved by support admin: ${resolutionNotes}`,
            metadata: {
              ticketId: id,
              status,
              resolvedAt: new Date().toISOString(),
            },
          },
        })
      } catch (notifErr: any) {
        console.warn("[TICKET_RESOLVE_NOTIFICATION_NOTE]", notifErr?.message)
      }
    }

    return NextResponse.json({
      ok: true,
      ticket: updated,
      message: `Ticket #${id.slice(-6).toUpperCase()} marked as ${status}.`,
    })
  } catch (error: any) {
    console.error("[ADMIN_RESOLVE_TICKET_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to resolve ticket." }, { status: 500 })
  }
}
