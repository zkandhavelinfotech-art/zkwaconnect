import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { errorStatus, requireMember } from "@/lib/auth/member"
import { generateKey, ALL_SCOPES } from "@/lib/developer/keys"

const fail = (error: unknown) =>
  NextResponse.json(
    {
      error:
        error instanceof z.ZodError
          ? error.issues[0]?.message
          : error instanceof Error
          ? error.message
          : "Failed",
    },
    { status: errorStatus(error) }
  )

export async function GET() {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const keys = await prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        rateLimit: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ keys, availableScopes: ALL_SCOPES })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId, userId } = await requireMember({ manager: true })
    const body = await request.json()

    // Handle regenerate action
    if (body.action === "regenerate" && body.id) {
      const existing = await prisma.apiKey.findFirst({
        where: { id: body.id, organizationId, revokedAt: null },
      })
      if (!existing) {
        return NextResponse.json({ error: "Active key not found." }, { status: 404 })
      }
      const generated = generateKey({
        scopes: Array.isArray(existing.scopes) ? (existing.scopes as string[]) : undefined,
        rateLimit: existing.rateLimit,
      })
      const updated = await prisma.apiKey.update({
        where: { id: existing.id },
        data: {
          prefix: generated.prefix,
          keyHash: generated.keyHash,
          secretEncrypted: generated.secretEncrypted,
          lastUsedAt: null,
        },
      })
      return NextResponse.json({
        id: updated.id,
        name: updated.name,
        apiKey: generated.apiKey,
        secretKey: generated.secretKey,
        prefix: generated.prefix,
        message: "Credentials regenerated! Save the new API Key and Secret Key securely now.",
      })
    }

    const input = z
      .object({
        name: z
          .string()
          .trim()
          .min(2, "Application / project name must be at least 2 characters.")
          .max(60),
        scopes: z.array(z.string()).optional(),
        rateLimit: z.number().int().min(10).max(1200).optional(),
        expiresInDays: z.number().int().positive().nullable().optional(),
      })
      .parse(body)

    const activeCount = await prisma.apiKey.count({
      where: { organizationId, revokedAt: null },
    })
    if (activeCount >= 20) {
      throw new Error("Maximum of 20 active API keys reached. Revoke unused keys before creating new ones.")
    }

    const { apiKey, secretKey, prefix, keyHash, secretEncrypted, scopes, rateLimit, expiresAt } =
      generateKey({
        scopes: input.scopes,
        rateLimit: input.rateLimit,
        expiresInDays: input.expiresInDays,
      })

    const created = await prisma.apiKey.create({
      data: {
        organizationId,
        name: input.name,
        prefix,
        keyHash,
        secretEncrypted,
        scopes,
        rateLimit,
        expiresAt,
        createdById: userId,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        apiKey,
        secretKey,
        prefix: created.prefix,
        scopes,
        rateLimit,
        expiresAt,
        message: "Copy your API Key and Secret Key now. The Secret Key will never be shown again!",
      },
      { status: 201 }
    )
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const { organizationId } = await requireMember({ manager: true })
    const id = new URL(request.url).searchParams.get("id") || ""
    const updated = await prisma.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (!updated.count) {
      return NextResponse.json({ error: "Key not found or already revoked." }, { status: 404 })
    }
    return NextResponse.json({ ok: true, message: "API Key revoked. External applications using this key will be rejected immediately." })
  } catch (error) {
    return fail(error)
  }
}
