import { NextResponse } from "next/server"

export const runtime = "nodejs"

const retired = () =>
  NextResponse.json(
    {
      error: "This legacy Facebook Page access endpoint has been retired.",
      solution:
        "Use SaaS Admin > Customer workspaces > Manage onboarding. Clients can review assignment status from Channel status.",
    },
    { status: 410 }
  )

export async function GET() {
  return retired()
}

export async function POST() {
  return retired()
}
