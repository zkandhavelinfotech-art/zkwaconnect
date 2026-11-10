import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { safeFetch } from "@/lib/flows/safe-fetch"

export const runtime = "nodejs"

const testSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("POST"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = testSchema.parse(await request.json())
    const startTime = Date.now()

    const result = await safeFetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.method === "POST" ? input.body : undefined,
    })

    const duration = Date.now() - startTime
    let parsed: unknown = null
    try {
      parsed = JSON.parse(result.text)
    } catch {
      // plain text response
    }

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      durationMs: duration,
      sampleResponse: result.text.slice(0, 2000),
      parsed,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute test API request.",
      },
      { status: 400 }
    )
  }
}

