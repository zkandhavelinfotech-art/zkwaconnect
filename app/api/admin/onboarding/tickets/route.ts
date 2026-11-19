import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getAdminSession } from "@/lib/auth/admin"

export const runtime = "nodejs"

// GET /api/admin/onboarding/tickets
// Retrieves all open, in-progress, or resolved onboarding support tickets for Super Admins.
export async function GET(request: Request) {
  try {
    const admin = await getAdminSession()
    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined

    const tickets = await prisma.supportTicket.findMany({
      where: {
        subject: { contains: "Onboarding" },
        ...(status ? { status } : {}),
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            metaConnection: { select: { status: true } },
            wabas: {
              select: {
                id: true,
                wabaId: true,
                name: true,
                status: true,
                phoneNumbers: {
                  select: {
                    id: true,
                    phoneNumberId: true,
                    phoneNumber: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const formatted = tickets.map(t => ({
      id: t.id,
      ticketCode: `#${t.id.slice(-6).toUpperCase()}`,
      subject: t.subject,
      description: t.description,
      priority: t.priority,
      status: t.status,
      assignedTo: t.assignedTo,
      createdAt: t.createdAt,
      closedAt: t.closedAt,
      organizationId: t.organizationId,
      organizationName: t.organization.name,
      metaConnected: Boolean(t.organization.metaConnection?.status === "CONNECTED"),
      waba: t.organization.wabas[0] || null,
      phone: t.organization.wabas[0]?.phoneNumbers[0] || null,
    }))

    return NextResponse.json({
      ok: true,
      count: formatted.length,
      tickets: formatted,
    })
  } catch (error: any) {
    console.error("[ADMIN_ONBOARDING_TICKETS_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to load onboarding tickets." }, { status: 500 })
  }
}
