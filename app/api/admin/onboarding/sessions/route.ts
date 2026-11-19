import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getAdminSession } from "@/lib/auth/admin"

export const runtime = "nodejs"

// GET /api/admin/onboarding/sessions
// Super Admin API to inspect all customer tenant onboarding sessions and drop-off states.
export async function GET(request: Request) {
  try {
    const admin = await getAdminSession()
    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status")
    const search = searchParams.get("q")?.toLowerCase() || ""

    const organizations = await prisma.organization.findMany({
      include: {
        wabas: {
          include: {
            phoneNumbers: true,
          },
        },
        metaConnection: true,
        onboarding: true,
      },
      orderBy: { createdAt: "desc" },
    })

    const sessions = organizations.map(org => {
      const activeWaba = org.wabas.find(w => w.status === "CONNECTED") || org.wabas[0] || null
      const activePhone = activeWaba?.phoneNumbers.find(p => p.status === "CONNECTED") || activeWaba?.phoneNumbers[0] || null

      let computedStatus = "NOT_STARTED"
      if (activeWaba && activePhone?.status === "CONNECTED") {
        computedStatus = "CONNECTED"
      } else if (activeWaba && activePhone) {
        computedStatus = "REGISTRATION_PENDING"
      } else if (activeWaba) {
        computedStatus = "PHONE_NUMBER_PENDING"
      } else if (org.metaConnection?.status === "CONNECTED") {
        computedStatus = "WABA_CREATION_PENDING"
      }

      return {
        organizationId: org.id,
        organizationName: org.name,
        slug: org.slug,
        status: computedStatus,
        onboardingStep: org.onboarding?.currentStep || "NOT_STARTED",
        metaConnected: Boolean(org.metaConnection?.status === "CONNECTED"),
        waba: activeWaba
          ? {
              id: activeWaba.id,
              wabaId: activeWaba.wabaId,
              name: activeWaba.name,
              status: activeWaba.status,
            }
          : null,
        phone: activePhone
          ? {
              id: activePhone.id,
              phoneNumberId: activePhone.phoneNumberId,
              phoneNumber: activePhone.phoneNumber,
              displayName: activePhone.displayName,
              status: activePhone.status,
              verificationStatus: activePhone.verificationStatus,
            }
          : null,
        createdAt: org.createdAt,
        lastSyncedAt: org.metaConnection?.lastSyncedAt || org.updatedAt,
      }
    })

    const filtered = sessions.filter(s => {
      const matchesSearch = !search || s.organizationName.toLowerCase().includes(search) || s.phone?.phoneNumber.includes(search) || s.waba?.wabaId.includes(search)
      const matchesStatus = !statusFilter || s.status === statusFilter
      return matchesSearch && matchesStatus
    })

    const summary = {
      total: sessions.length,
      connected: sessions.filter(s => s.status === "CONNECTED").length,
      pending: sessions.filter(s => s.status === "REGISTRATION_PENDING" || s.status === "WABA_CREATION_PENDING").length,
      notStarted: sessions.filter(s => s.status === "NOT_STARTED").length,
    }

    return NextResponse.json({
      ok: true,
      summary,
      sessions: filtered,
    })
  } catch (error: any) {
    console.error("[ADMIN_ONBOARDING_SESSIONS_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to load onboarding sessions." }, { status: 500 })
  }
}
