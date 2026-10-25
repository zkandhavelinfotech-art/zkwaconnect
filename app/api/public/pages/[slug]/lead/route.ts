import { NextResponse } from "next/server"
import { z } from "zod"
import { captureLead } from "@/lib/pages/pages"
import { ThrottleError, assertNotLocked, clientIp, recordFailure } from "@/lib/auth/throttle"

// Lead form on a public WhatsApp page → contact in the workspace (WhatsApp opt-in only if the box is ticked).
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const limit = { key: `page-lead:${await clientIp()}`, max: 10, windowMinutes: 60, lockMinutes: 60 }
    await assertNotLocked(limit)
    await recordFailure(limit)
    const input = z.object({ sectionId: z.string().regex(/^[\w-]{4,20}$/), name: z.string().trim().min(2, "Enter your name").max(80),
      phone: z.string().trim().min(8, "Enter your WhatsApp number").max(20), message: z.string().trim().max(500).optional(), optIn: z.boolean() }).parse(await request.json())
    await captureLead(slug, input)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = error instanceof ThrottleError ? 429 : (error as { status?: number }).status || 400
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" }, { status })
  }
}
