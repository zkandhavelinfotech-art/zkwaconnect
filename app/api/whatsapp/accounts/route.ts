import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getOnboardingOrganizationId } from "@/lib/onboarding/context"

export const runtime = "nodejs"

// GET /api/whatsapp/accounts
// Retrieves connected WhatsApp accounts, phone numbers, and health metrics for the tenant.
export async function GET() {
  try {
    const organizationId = await getOnboardingOrganizationId()
    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized. Sign in to continue." }, { status: 401 })
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        wabas: {
          include: {
            phoneNumbers: {
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        metaConnection: true,
        onboarding: true,
      },
    })

    if (!org) {
      return NextResponse.json({ error: "Workspace organization not found." }, { status: 404 })
    }

    const activeWaba = org.wabas.find(w => w.status === "CONNECTED") || org.wabas[0] || null
    const activePhone = activeWaba?.phoneNumbers.find(p => p.status === "CONNECTED") || activeWaba?.phoneNumbers[0] || null

    const isConnected = Boolean(activeWaba && activePhone?.status === "CONNECTED")

    const health = {
      apiConnection: isConnected ? "Active" : activeWaba ? "Partial" : "Inactive",
      webhook: isConnected ? "Active" : "Pending",
      numberRegistration: activePhone?.status === "CONNECTED" ? "Complete" : "Pending",
      qualityRating: activePhone?.qualityRating || "UNKNOWN",
      messagingLimit: activePhone?.messagingLimit || "TIER_250",
      callingEnabled: Boolean(activePhone?.callingEnabled),
      lastSyncedAt: org.metaConnection?.lastSyncedAt || activeWaba?.updatedAt || null,
    }

    return NextResponse.json({
      ok: true,
      status: isConnected ? "CONNECTED" : activeWaba ? "REGISTRATION_PENDING" : "NOT_STARTED",
      primaryAccount: activeWaba
        ? {
            id: activeWaba.id,
            wabaId: activeWaba.wabaId,
            name: activeWaba.name,
            businessId: activeWaba.metaBusinessId || null,
            currency: activeWaba.currency || "INR",
            timezone: activeWaba.timezone || "Asia/Kolkata",
            status: activeWaba.status,
            phone: activePhone
              ? {
                  id: activePhone.id,
                  phoneNumberId: activePhone.phoneNumberId,
                  phoneNumber: activePhone.phoneNumber,
                  displayName: activePhone.displayName,
                  status: activePhone.status,
                  verificationStatus: activePhone.verificationStatus,
                  qualityRating: activePhone.qualityRating,
                }
              : null,
          }
        : null,
      accounts: org.wabas.map(w => ({
        id: w.id,
        wabaId: w.wabaId,
        name: w.name,
        status: w.status,
        phoneNumbers: w.phoneNumbers.map(p => ({
          id: p.id,
          phoneNumberId: p.phoneNumberId,
          phoneNumber: p.phoneNumber,
          displayName: p.displayName,
          status: p.status,
        })),
      })),
      health,
      onboarding: org.onboarding || null,
    })
  } catch (error: any) {
    console.error("[WHATSAPP_ACCOUNTS_GET_ERROR]", error)
    return NextResponse.json({ error: error?.message || "Failed to retrieve WhatsApp accounts." }, { status: 500 })
  }
}
