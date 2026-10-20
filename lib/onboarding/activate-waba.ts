import { prisma } from "@/lib/db/prisma"
import { planState } from "@/lib/billing/limits"

type MetaWaba = { id: string; name: string; currency?: string; timezone_id?: string }

// Makes one WABA the workspace's single active WhatsApp Business API account. Other accounts are
// parked (not deleted) so their conversations and history stay. Returns whether a registered number is ready.
export async function activateWaba(input: { organizationId: string; businessId: string | null; waba: MetaWaba }) {
  const { organizationId, businessId, waba } = input
  const numberLimit = (await planState(organizationId)).limits.numbers
  return prisma.$transaction(async tx => {
    const saved = await tx.waba.upsert({
      where: { wabaId: waba.id },
      create: { organizationId, metaBusinessId: businessId ?? undefined, wabaId: waba.id, name: waba.name,
        currency: waba.currency, timezone: waba.timezone_id, status: "CONNECTED" },
      update: { ...(businessId ? { metaBusinessId: businessId } : {}), name: waba.name, currency: waba.currency, timezone: waba.timezone_id, status: "CONNECTED" },
      include: { phoneNumbers: true },
    })
    const others = await tx.waba.findMany({ where: { organizationId, id: { not: saved.id }, status: "CONNECTED" }, select: { id: true } })
    if (others.length) {
      const ids = others.map(item => item.id)
      await tx.waba.updateMany({ where: { id: { in: ids } }, data: { status: "DISCONNECTED" } })
      await tx.phoneNumber.updateMany({ where: { wabaId: { in: ids }, status: "CONNECTED" }, data: { status: "DISCONNECTED" } })
    }
    // Switching back to an account whose number was registered earlier restores it.
    // (only as many as the plan allows)
    const registered = saved.phoneNumbers.filter(phone => phone.verificationStatus === "VERIFIED").slice(0, numberLimit ?? undefined)
    if (registered.length)
      await tx.phoneNumber.updateMany({ where: { id: { in: registered.map(phone => phone.id) } }, data: { status: "CONNECTED" } })
    const phoneReady = registered.length > 0
    await tx.metaConnection.updateMany({ where: { organizationId, status: "CONNECTED" },
      data: { ...(businessId ? { businessManagerId: businessId } : {}), lastSyncedAt: new Date() } })
    const step = phoneReady ? "COMPLETED" : "PHONE_PENDING"
    await tx.onboarding.upsert({
      where: { organizationId },
      create: { organizationId, metaConnected: true, wabaCreated: true, phoneRegistered: phoneReady, phoneVerified: phoneReady,
        currentStep: step, status: step, completedAt: phoneReady ? new Date() : null },
      update: { metaConnected: true, wabaCreated: true, phoneRegistered: phoneReady, phoneVerified: phoneReady,
        currentStep: step, status: step, ...(phoneReady ? {} : { completedAt: null }) },
    })
    return { phoneReady, deactivated: others.length }
  })
}
