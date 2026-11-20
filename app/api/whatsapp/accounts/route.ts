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
              orderBy: { updatedAt: "desc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
        metaConnections: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        onboarding: true,
      },
    })

    if (!org) {
      return NextResponse.json({ error: "Workspace organization not found." }, { status: 404 })
    }

    const latestMetaConn = org.metaConnections?.[0] || null
    const activeWaba = org.wabas.find(w => w.status === "CONNECTED") || org.wabas[0] || null
    const activePhone = activeWaba?.phoneNumbers.find(p => p.status === "CONNECTED") || activeWaba?.phoneNumbers[0] || null

    const isConnected = Boolean(activeWaba && activePhone?.status === "CONNECTED")

    // Retrieve latest WebhookEvent to evaluate heartbeat health
    const latestWebhook = await prisma.webhookEvent.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, eventType: true },
    })

    const now = Date.now()
    const lastEventTime = latestWebhook ? new Date(latestWebhook.createdAt).getTime() : 0
    const hoursSinceLastEvent = lastEventTime ? (now - lastEventTime) / (1000 * 60 * 60) : null

    let webhookHealth = "Inactive"
    if (isConnected) {
      if (latestWebhook && hoursSinceLastEvent !== null && hoursSinceLastEvent < 24) {
        webhookHealth = "Active (Live Heartbeat < 24h)"
      } else if (latestWebhook) {
        webhookHealth = "Dormant (Subscribed, Idle)"
      } else {
        webhookHealth = "Subscribed (Listening)"
      }
    }

    const health = {
      apiConnection: isConnected ? "Active" : activeWaba ? "Partial" : "Inactive",
      webhook: webhookHealth,
      lastWebhookEventAt: latestWebhook?.createdAt || null,
      lastWebhookEventType: latestWebhook?.eventType || null,
      numberRegistration: activePhone?.status === "CONNECTED" ? "Complete" : "Pending",
      qualityRating: activePhone?.qualityRating || "UNKNOWN",
      messagingLimit: activePhone?.messagingLimit || "TIER_250",
      callingEnabled: Boolean(activePhone?.callingEnabled),
      lastSyncedAt: latestMetaConn?.lastSyncedAt || activeWaba?.updatedAt || null,
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
                  isDefault: true,
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
          isDefault: activePhone?.id === p.id,
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
