import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { apiHandler } from "@/lib/developer/api"

// GET /api/v1/whatsapp/phone-numbers — connected WhatsApp numbers in this workspace.
export const GET = apiHandler(
  async (_request, { organizationId }) => {
    const phones = await prisma.phoneNumber.findMany({
      where: {
        status: "CONNECTED",
        waba: { organizationId, status: "CONNECTED" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        phoneNumberId: true,
        phoneNumber: true,
        displayName: true,
        qualityRating: true,
        status: true,
        waba: {
          select: {
            id: true,
            wabaId: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({
      data: phones.map(phone => ({
        id: phone.id,
        phone_number_id: phone.phoneNumberId,
        number: phone.phoneNumber,
        display_name: phone.displayName,
        quality_rating: phone.qualityRating,
        status: phone.status.toLowerCase(),
        waba: phone.waba,
      })),
      total: phones.length,
    })
  },
  { scope: "account:read" }
)

