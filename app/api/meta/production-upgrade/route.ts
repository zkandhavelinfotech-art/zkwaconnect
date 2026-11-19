import { NextResponse } from "next/server"

// Retired because its global-token fallback could cross tenant boundaries.
const retired = () => NextResponse.json({ error: "Legacy production upgrade is retired. Open the customer workspace from SaaS Admin and use managed onboarding." }, { status: 410 })
export const GET = retired
export const POST = retired
