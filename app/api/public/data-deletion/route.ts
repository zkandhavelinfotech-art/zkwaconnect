import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { DELETION_STATUS, createDeletionRequest } from "@/lib/data-deletion"
import { LIMITS, ThrottleError, assertNotLocked, clientIp, recordFailure } from "@/lib/auth/throttle"

// Status of a request by confirmation code (shown on /data-deletion?code=…).
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() || ""
  const row = /^DEL-[0-9A-F]{10}$/.test(code) ? await prisma.dataDeletionRequest.findUnique({ where: { code } }) : null
  if (!row) return NextResponse.json({ error: "No request found with that confirmation code." }, { status: 404 })
  return NextResponse.json({ code: row.code, status: row.status, label: DELETION_STATUS[row.status] || row.status, createdAt: row.createdAt, completedAt: row.completedAt })
}

// Public request form (for people without an account, or who can't sign in).
export async function POST(request: Request) {
  try {
    const input = z.object({ email: z.string().trim().email("Enter your email address."), details: z.string().trim().max(1000).optional() }).parse(await request.json())
    const ip = await clientIp()
    await assertNotLocked(LIMITS.resetIp(ip))
    await recordFailure(LIMITS.resetIp(ip))
    const record = await createDeletionRequest({ source: "FORM", email: input.email, note: input.details })
    return NextResponse.json({ ok: true, code: record.code, message: `Request received. Your confirmation code is ${record.code}. We will verify it's you by email and complete it within 30 days.` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
      { status: error instanceof ThrottleError ? 429 : 400 })
  }
}
