import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { apiError, apiHandler } from "@/lib/developer/api"
import { newSecret, WEBHOOK_EVENTS } from "@/lib/developer/webhooks"

const webhookSchema = z.object({
  url: z.string().url().startsWith("https://", "Webhook URL must be HTTPS"),
  events: z.array(z.string()).min(1, "Select at least one event type"),
  description: z.string().max(200).optional(),
})

// GET /api/v1/webhooks — list registered webhook endpoints
export const GET = apiHandler(
  async (_request, { organizationId }) => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        active: true,
        failureCount: true,
        lastDeliveryAt: true,
        lastStatus: true,
        createdAt: true,
      },
    })
    return NextResponse.json({
      data: endpoints,
      available_events: WEBHOOK_EVENTS,
      total: endpoints.length,
    })
  },
  { scope: "webhooks:manage" }
)

// POST /api/v1/webhooks — register a new webhook endpoint
export const POST = apiHandler(
  async (request, { organizationId }) => {
    const body = await request.json()
    const input = webhookSchema.parse(body)

    const existingCount = await prisma.webhookEndpoint.count({ where: { organizationId } })
    if (existingCount >= 10) {
      return apiError(409, "endpoint_limit", "Maximum of 10 webhook endpoints reached per workspace.")
    }

    const secret = newSecret()
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url: input.url,
        secret,
        events: input.events,
        description: input.description,
        active: true,
      },
    })

    return NextResponse.json(
      {
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events,
        secret,
        description: endpoint.description,
        active: endpoint.active,
        message: "Webhook registered. Copy this signing secret now — verify HMAC signatures with header 'X-ZKWA-Signature'.",
      },
      { status: 201 }
    )
  },
  { scope: "webhooks:manage" }
)
