import { NextResponse } from "next/server"
import { runCampaignTicks } from "@/lib/campaigns/runner"

export const runtime = "nodejs"
export const maxDuration = 60

// Optional: hosts without a long-running server can call this every minute with
// "Authorization: Bearer <CRON_SECRET>" to send scheduled and queued broadcasts.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ticks = await runCampaignTicks(50)
  return NextResponse.json({ ok: true, ticks })
}
