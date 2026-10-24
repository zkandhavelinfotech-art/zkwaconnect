import { NextResponse } from "next/server"
import { z } from "zod"
import { assignClientPlan, createClient, requirePartner } from "@/lib/partners/partners"
import { fail, sessionUser } from "@/lib/partners/http"

// New client workspace (+ owner invitation).
export async function POST(request: Request) {
  try {
    const user = await sessionUser()
    const partner = await requirePartner(user.id)
    const input = z.object({ name: z.string().trim().min(2).max(100), ownerEmail: z.string().trim().email().optional().or(z.literal("")) }).parse(await request.json())
    const result = await createClient(partner.id, user.id, { name: input.name, ownerEmail: input.ownerEmail || undefined, requestUrl: request.url })
    return NextResponse.json({ ok: true, organizationId: result.organization.id, inviteUrl: result.inviteUrl,
      message: result.inviteUrl ? "Client created. Send them the invitation link so they can set their password." : "Client created. You can open it from All projects." }, { status: 201 })
  } catch (error) { return fail(error) }
}

// Wholesale: buy or renew a client's plan from the partner wallet.
export async function PUT(request: Request) {
  try {
    const user = await sessionUser()
    const partner = await requirePartner(user.id, { active: true, owner: true })
    const input = z.object({ organizationId: z.string().min(1), planId: z.string().min(1), interval: z.enum(["MONTHLY", "ANNUAL"]) }).parse(await request.json())
    const { cost, end } = await assignClientPlan(partner.id, input)
    return NextResponse.json({ ok: true, message: `Plan active until ${end.toLocaleDateString("en-IN")}. ₹${cost.toLocaleString("en-IN", { minimumFractionDigits: 2 })} taken from your wallet.` })
  } catch (error) { return fail(error) }
}
