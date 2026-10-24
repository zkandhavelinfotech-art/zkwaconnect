import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { setCalling } from "@/lib/calls/calls"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request failed" }, { status: errorStatus(error) })

export async function GET() {
  try {
    const { organizationId } = await requireMember()
    const numbers = await prisma.phoneNumber.findMany({ where: { waba: { organizationId }, status: "CONNECTED" },
      select: { id: true, phoneNumber: true, displayName: true, callingEnabled: true, messagingLimit: true }, orderBy: { createdAt: "asc" } })
    return NextResponse.json({ numbers })
  } catch (error) { return fail(error) }
}

export async function PUT(request: Request) {
  try {
    const { organizationId } = await requireMember()
    const { phoneNumberId, enabled } = z.object({ phoneNumberId: z.string().min(1), enabled: z.boolean() }).parse(await request.json())
    await setCalling(organizationId, phoneNumberId, enabled)
    return NextResponse.json({ ok: true, message: enabled ? "Calling is on. Customers now see the call button in your WhatsApp chat." : "Calling is off for this number." })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    // Meta needs a messaging limit of 2,000+ and an approved calling setup on the number.
    return fail(/limit|eligib|not allowed|permission/i.test(message) ? new Error(`Meta didn't allow calling on this number: ${message}. Calling needs a messaging limit of 2,000 or more.`) : error)
  }
}
