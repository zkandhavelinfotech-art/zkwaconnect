import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { apiHandler } from "@/lib/developer/api"

// GET /api/v1/me — check a key: returns the workspace and its connected WhatsApp numbers.
export const GET = apiHandler(async (_request, { organizationId }) => {
  const [organization, phones] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true } }),
    prisma.phoneNumber.findMany({ where: { status: "CONNECTED", waba: { organizationId, status: "CONNECTED" } }, select: { id: true, phoneNumber: true, displayName: true } }),
  ])
  return NextResponse.json({ workspace: organization, phone_numbers: phones.map(phone => ({ id: phone.id, number: phone.phoneNumber, name: phone.displayName })) })
})
