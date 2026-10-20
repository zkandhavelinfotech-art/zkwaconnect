import { NextResponse }   from "next/server"
import { z }              from "zod"
import { prisma }         from "@/lib/db/prisma"
import { hashPassword }   from "@/lib/auth/password"
import { createSession, setActiveWorkspace }  from "@/lib/auth/session"
import { createWorkspace } from "@/lib/workspaces"

const schema = z.object({
  name:             z.string().min(2),
  email:            z.string().email(),
  password:         z.string().min(8),
  organizationName: z.string().min(2),
  country:          z.string().default("IN"),
  timezone:         z.string().default("Asia/Kolkata"),
  gstin:            z.string().optional(),
  phone:            z.string().trim().regex(/^\+?[\d\s-]{8,18}$/, "Enter a valid WhatsApp number.").optional().or(z.literal("")),
})

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json())
    const email = input.email.toLowerCase()

    if (await prisma.user.findUnique({ where: { email } }))
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 })

    const passwordHash = await hashPassword(input.password)
    const user = await prisma.user.create({ data: { email, name: input.name, passwordHash, phone: input.phone || null } })
    const workspace = await createWorkspace(user.id, { name: input.organizationName, country: input.country, timezone: input.timezone, gstin: input.gstin })

    await createSession(user.id)
    await setActiveWorkspace(workspace.id)
    return NextResponse.json({ ok: true, redirect: "/onboarding" }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      const issue = e.issues[0]
      const field: Record<string,string> = { name:"Name", email:"Email", password:"Password", organizationName:"Business name" }
      return NextResponse.json({ error: `${field[String(issue?.path[0])] ?? "Input"}: ${issue?.message ?? "is invalid"}` }, { status: 400 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Registration failed" }, { status: 400 })
  }
}
