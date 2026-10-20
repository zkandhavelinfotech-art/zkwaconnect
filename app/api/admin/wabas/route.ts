import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user || !["SUPER_ADMIN", "ADMIN", "OPERATIONS", "SUPPORT"].includes(session.user.adminRole))
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })

    const wabas = await prisma.waba.findMany({
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            onboarding: { select: { currentStep: true, phoneVerified: true } },
            metaConnections: { select: { status: true, tokenExpiresAt: true, lastSyncedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
          },
        },
        phoneNumbers: {
          select: { id: true, phoneNumber: true, status: true, verificationStatus: true, qualityRating: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    })
    return NextResponse.json({ wabas })
  } catch {
    return NextResponse.json({ error: "Could not load WABA health." }, { status: 500 })
  }
}