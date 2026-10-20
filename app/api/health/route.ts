import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Public health check for hosting platforms and the deploy workflow: app is up and the database answers.
export async function GET() {
  const started = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, database: "up", version: process.env.npm_package_version || null, ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
