import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { clientIp } from "@/lib/auth/throttle"

const requestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(8).max(24),
  expectedVolume: z.enum(["UNDER_1K", "1K_10K", "10K_100K", "OVER_100K"]).optional(),
  message: z.string().trim().max(600).optional(),
  website: z.string().max(0).optional(),
})

// A public signup is a request for managed onboarding. It cannot create a tenant.
export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    if (input.website) return NextResponse.json({ ok: true })
    const email = input.email.toLowerCase()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await prisma.auditLog.findFirst({
      where: { action: "SIGNUP_REQUESTED", createdAt: { gte: since }, metadata: { path: ["email"], equals: email } },
      select: { id: true },
    })
    if (!recent) await prisma.auditLog.create({ data: {
      actorType: "PROSPECT", action: "SIGNUP_REQUESTED", resource: "ManagedOnboarding",
      ipAddress: await clientIp(), userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
      metadata: { name: input.name, businessName: input.businessName, email, phone: input.phone,
        expectedVolume: input.expectedVolume || "UNDER_1K", message: input.message || "" },
    } })
    return NextResponse.json({ ok: true, message: "Your workspace request was received. Our onboarding team will verify the business and contact you before creating login credentials." }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Could not submit your request. Please try again." }, { status: 400 })
  }
}
