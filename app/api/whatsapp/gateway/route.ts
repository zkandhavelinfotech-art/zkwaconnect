import { NextResponse } from "next/server"

export const runtime = "nodejs"

const retired = () =>
  NextResponse.json(
    {
      error: "The legacy per-client WhatsApp gateway setup endpoint has been retired.",
      solution:
        "Complete Meta and WhatsApp authorization from the SaaS Admin onboarding flow, then review live checks in Channel status.",
    },
    { status: 410 }
  )

export async function GET() {
  return retired()
}

export async function POST() {
  return retired()
}
