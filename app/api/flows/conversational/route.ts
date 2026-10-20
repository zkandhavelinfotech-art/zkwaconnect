import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

type Automation = { enable_welcome_message?: boolean; prompts?: string[]; commands?: { command_name: string; command_description: string }[] }

async function context() {
  const session = await getSession()
  const organizationId = session?.user.memberships[0]?.organizationId
  if (!organizationId) throw Object.assign(new Error("Sign in to continue."), { status: 401 })
  const accessToken = await getMetaAccessToken(organizationId)
  if (!accessToken) throw Object.assign(new Error("Connect Facebook first."), { status: 409 })
  return { organizationId, accessToken }
}

// Ice breakers, commands and the welcome-message switch for each connected number (Meta "conversational automation").
export async function GET() {
  try {
    const { organizationId, accessToken } = await context()
    const phones = await prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } },
      select: { id: true, phoneNumberId: true, phoneNumber: true, displayName: true } })
    const numbers = await Promise.all(phones.map(async phone => {
      const live = await metaGraph<{ conversational_automation?: Automation }>(`${phone.phoneNumberId}?fields=conversational_automation`, accessToken)
        .then(result => ({ automation: result.conversational_automation || {}, error: null as string | null }))
        .catch(error => ({ automation: {} as Automation, error: error instanceof Error ? error.message : "Couldn't read settings" }))
      return { id: phone.id, phoneNumber: phone.phoneNumber, displayName: phone.displayName, error: live.error,
        enableWelcome: Boolean(live.automation.enable_welcome_message), prompts: live.automation.prompts || [],
        commands: (live.automation.commands || []).map(command => ({ name: command.command_name, description: command.command_description })) }
    }))
    return NextResponse.json({ numbers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load ice breakers." }, { status: (error as { status?: number }).status || 400 })
  }
}

const schema = z.object({
  phoneId: z.string().min(1),
  enableWelcome: z.boolean(),
  prompts: z.array(z.string().trim().min(1).max(80, "Ice breakers can be up to 80 characters.")).max(4, "Up to 4 ice breakers."),
  commands: z.array(z.object({
    name: z.string().trim().regex(/^[a-z0-9_]{1,32}$/i, "Command names use letters, numbers and _ (up to 32)."),
    description: z.string().trim().min(1, "Describe each command.").max(256),
  })).max(30, "Up to 30 commands."),
})

export async function POST(request: Request) {
  try {
    const { organizationId, accessToken } = await context()
    const input = schema.parse(await request.json())
    const phone = await prisma.phoneNumber.findFirst({ where: { id: input.phoneId, waba: { organizationId } } })
    if (!phone) return NextResponse.json({ error: "Phone number not found." }, { status: 404 })
    await metaGraph(`${phone.phoneNumberId}/conversational_automation`, accessToken, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enable_welcome_message: input.enableWelcome, prompts: input.prompts,
        commands: input.commands.map(command => ({ command_name: command.name.toLowerCase(), command_description: command.description })) }),
    })
    return NextResponse.json({ ok: true, message: "Saved to WhatsApp. Customers see the changes the next time they open your chat." })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not save ice breakers."
    return NextResponse.json({ error: message }, { status: (error as { status?: number }).status || 400 })
  }
}
