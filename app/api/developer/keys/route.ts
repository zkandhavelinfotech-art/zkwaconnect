import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { generateKey } from "@/lib/developer/keys"

const fail = (error: unknown) => NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Failed" },
  { status: errorStatus(error) })

export async function GET() {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const keys = await prisma.apiKey.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } })
    return NextResponse.json({ keys })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  try {
    const { organizationId, userId } = await requireMember({ manager: true })
    const { name } = z.object({ name: z.string().trim().min(2, "Name the key (e.g. “CRM integration”).").max(60) }).parse(await request.json())
    if (await prisma.apiKey.count({ where: { organizationId, revokedAt: null } }) >= 20) throw new Error("Up to 20 active keys. Revoke one you no longer use.")
    const { key, prefix, keyHash } = generateKey()
    const created = await prisma.apiKey.create({ data: { organizationId, name, prefix, keyHash, createdById: userId } })
    return NextResponse.json({ id: created.id, key, message: "Copy this key now — it won't be shown again." }, { status: 201 })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const updated = await prisma.apiKey.updateMany({ where: { id: new URL(request.url).searchParams.get("id") || "", organizationId, revokedAt: null }, data: { revokedAt: new Date() } })
    if (!updated.count) return NextResponse.json({ error: "Key not found or already revoked." }, { status: 404 })
    return NextResponse.json({ ok: true, message: "Key revoked. Apps using it will get 401 errors." })
  } catch (error) { return fail(error) }
}
