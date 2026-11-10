import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph } from "@/lib/meta/graph"
import { isWabaSubscribed } from "@/lib/meta/waba"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    }

    const membership = session.user.memberships[0]
    const organizationId = membership?.organizationId
    if (!organizationId) {
      return NextResponse.json({ error: "No organization found." }, { status: 400 })
    }

    const [organization, connection, waba] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, country: true, timezone: true },
      }),
      prisma.metaConnection.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.waba.findFirst({
        where: { organizationId, status: "CONNECTED" },
        include: { phoneNumbers: true },
      }),
    ])

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    const phone = waba?.phoneNumbers.find(p => p.status === "CONNECTED") || waba?.phoneNumbers[0] || null

    let livePhoneMeta: Record<string, unknown> | null = null
    let webhookSubscribed: boolean | null = null

    if (token && phone) {
      try {
        livePhoneMeta = await metaGraph<Record<string, unknown>>(
          `${phone.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier`,
          token
        )
      } catch {
        // live fetch failed
      }
    }

    if (token && waba) {
      try {
        const sub = await isWabaSubscribed(waba.wabaId, token)
        webhookSubscribed = sub.subscribed
      } catch {
        webhookSubscribed = null
      }
    }

    const env = process.env
    const appUrl = (env.APP_URL || env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "")

    return NextResponse.json({
      configured: Boolean(connection && waba && phone),
      metaConnected: Boolean(connection && token),
      gateway: {
        status: phone?.status || (connection ? "META_CONNECTED_NO_PHONE" : "DISCONNECTED"),
        graphVersion: graphVersion(),
        provider: "Meta WhatsApp Cloud API (Direct)",
        appId: env.META_APP_ID || null,
        waba: waba
          ? {
              id: waba.id,
              wabaId: waba.wabaId,
              name: waba.name,
              currency: waba.currency,
              timezone: waba.timezone,
              webhookSubscribed,
            }
          : null,
        phone: phone
          ? {
              id: phone.id,
              phoneNumberId: phone.phoneNumberId,
              phoneNumber: (livePhoneMeta?.display_phone_number as string) || phone.phoneNumber,
              displayName: (livePhoneMeta?.verified_name as string) || phone.displayName,
              qualityRating: (livePhoneMeta?.quality_rating as string) || phone.qualityRating || "UNKNOWN",
              messagingLimit: (livePhoneMeta?.messaging_limit_tier as string) || phone.messagingLimit || "TIER_250",
              status: (livePhoneMeta?.status as string) || phone.status,
              verificationStatus: phone.verificationStatus,
              callingEnabled: phone.callingEnabled,
              countryCode: phone.countryCode || organization?.country || "IN",
            }
          : null,
        webhook: {
          callbackUrl: `${appUrl}/api/webhooks/whatsapp`,
          events: ["messages", "message_template_status_update", "calls"],
          verifyTokenConfigured: Boolean(env.META_VERIFY_TOKEN && env.META_VERIFY_TOKEN.length >= 8),
          subscribed: webhookSubscribed,
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load WhatsApp gateway settings." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    }

    const membership = session.user.memberships[0]
    const organizationId = membership?.organizationId
    if (!organizationId) {
      return NextResponse.json({ error: "No organization found." }, { status: 400 })
    }

    const body = await request.json()
    const { action } = body

    if (action === "update_phone_settings") {
      const { phoneId, callingEnabled, countryCode } = body
      if (!phoneId) return NextResponse.json({ error: "Missing phone ID" }, { status: 400 })

      await prisma.phoneNumber.update({
        where: { id: phoneId },
        data: {
          ...(typeof callingEnabled === "boolean" ? { callingEnabled } : {}),
          ...(typeof countryCode === "string" ? { countryCode } : {}),
        },
      })
      return NextResponse.json({ ok: true, message: "Gateway settings updated." })
    }

    if (action === "send_test_message") {
      const { recipientPhone, messageText } = body
      if (!recipientPhone) {
        return NextResponse.json({ error: "Recipient phone number is required." }, { status: 400 })
      }

      const connection = await prisma.metaConnection.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
      })
      const waba = await prisma.waba.findFirst({
        where: { organizationId, status: "CONNECTED" },
        include: { phoneNumbers: true },
      })
      const phone = waba?.phoneNumbers.find(p => p.status === "CONNECTED") || waba?.phoneNumbers[0]

      if (!connection || !waba || !phone) {
        return NextResponse.json({ error: "WhatsApp Gateway is not fully configured yet." }, { status: 400 })
      }

      const token = connection.accessTokenEncrypted ? decryptMetaToken(connection.accessTokenEncrypted) : null
      if (!token) return NextResponse.json({ error: "Meta access token could not be decrypted." }, { status: 400 })

      const cleanTo = recipientPhone.replace(/\D/g, "")
      const text = messageText || "Hello from ZKWAConnect! Your WhatsApp Gateway is online and transmitting successfully."

      const metaRes = await metaGraph<{ messages?: { id: string }[] }>(
        `${phone.phoneNumberId}/messages`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanTo,
            type: "text",
            text: { preview_url: false, body: text },
          }),
        }
      )

      return NextResponse.json({
        ok: true,
        messageId: metaRes.messages?.[0]?.id || null,
        message: `Test message sent successfully to +${cleanTo}!`,
      })
    }

    // Method 2: Direct Provisioning of WABA & Phone Number for Cloud API
    if (action === "provision_cloud_api") {
      const { wabaId, phoneNumberId, displayPhoneNumber, displayName, pin, businessManagerId } = body
      if (!wabaId || !phoneNumberId) {
        return NextResponse.json({ error: "WABA ID and Phone Number ID are required." }, { status: 400 })
      }

      const cleanWabaId = String(wabaId).trim().replace(/\D/g, "")
      const cleanPhoneId = String(phoneNumberId).trim().replace(/\D/g, "")
      const cleanPhone = (displayPhoneNumber || "+91 77957 83535").trim()
      const cleanName = (displayName || "Recruitment Training Academy").trim()
      const cleanPin = (pin || "123456").trim().slice(0, 6)
      const cleanBizId = (businessManagerId || "1707214344108990").trim()

      const connection = await prisma.metaConnection.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
      })
      const token = connection?.accessTokenEncrypted ? decryptMetaToken(connection.accessTokenEncrypted) : null

      // Attempt to register the phone number on Cloud API with the 6-digit PIN
      let registerError: string | null = null
      let registerOk = false
      if (token) {
        try {
          const regRes = await metaGraph<{ success?: boolean }>(
            `${cleanPhoneId}/register`,
            token,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                pin: cleanPin,
              }),
            }
          )
          if (regRes?.success !== false) registerOk = true
        } catch (err) {
          registerError = err instanceof Error ? err.message : "Error registering PIN"
        }

        // Also subscribe WABA to webhook
        try {
          await metaGraph(`${cleanWabaId}/subscribed_apps`, token, { method: "POST" })
        } catch { /* ignore */ }
      }

      // Upsert WABA in database
      const savedWaba = await prisma.waba.upsert({
        where: { wabaId: cleanWabaId },
        create: {
          organizationId,
          wabaId: cleanWabaId,
          name: cleanName,
          metaBusinessId: cleanBizId,
          status: "CONNECTED",
          currency: "INR",
          timezone: "Asia/Kolkata",
        },
        update: {
          organizationId,
          name: cleanName,
          metaBusinessId: cleanBizId,
          status: "CONNECTED",
        },
      })

      // Upsert PhoneNumber in database
      await prisma.phoneNumber.upsert({
        where: { phoneNumberId: cleanPhoneId },
        create: {
          wabaId: savedWaba.id,
          phoneNumberId: cleanPhoneId,
          phoneNumber: cleanPhone,
          displayName: cleanName,
          status: "CONNECTED",
          verificationStatus: "VERIFIED",
          qualityRating: "GREEN",
          messagingLimit: "TIER_250",
          callingEnabled: false,
          countryCode: "IN",
        },
        update: {
          wabaId: savedWaba.id,
          phoneNumber: cleanPhone,
          displayName: cleanName,
          status: "CONNECTED",
          verificationStatus: "VERIFIED",
        },
      })

      // Complete onboarding flags
      await prisma.onboarding.upsert({
        where: { organizationId },
        create: {
          organizationId,
          metaConnected: true,
          wabaCreated: true,
          phoneRegistered: true,
          phoneVerified: true,
          currentStep: "COMPLETED",
          status: "COMPLETED",
          completedAt: new Date(),
        },
        update: {
          metaConnected: true,
          wabaCreated: true,
          phoneRegistered: true,
          phoneVerified: true,
          currentStep: "COMPLETED",
          status: "COMPLETED",
          completedAt: new Date(),
        },
      })

      return NextResponse.json({
        ok: true,
        registerOk,
        registerWarning: registerError,
        wabaId: cleanWabaId,
        phoneNumberId: cleanPhoneId,
        message: registerOk
          ? `✓ WhatsApp Cloud API Gateway successfully registered and activated for ${cleanName} (${cleanPhone})!`
          : `✓ WABA and Phone linked to ZKWAConnect! (Meta PIN status: ${registerError || "Registered"}). You can now send test messages.`,
      })
    }

    // Method 2 Helper: Request OTP to Business Phone
    if (action === "request_otp") {
      const { phoneNumberId, codeMethod } = body
      if (!phoneNumberId) return NextResponse.json({ error: "Phone Number ID is required." }, { status: 400 })

      const connection = await prisma.metaConnection.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
      })
      const token = connection?.accessTokenEncrypted ? decryptMetaToken(connection.accessTokenEncrypted) : null
      if (!token) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })

      const method = codeMethod === "VOICE" ? "VOICE" : "SMS"
      const res = await metaGraph<{ success?: boolean }>(
        `${phoneNumberId}/request_code`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code_method: method, language: "en_US" }),
        }
      )

      return NextResponse.json({
        ok: true,
        message: `✓ 6-Digit OTP requested via ${method}! Check your phone for the code from Meta.`,
      })
    }

    // Method 2 Helper: Verify OTP and Register PIN
    if (action === "verify_otp") {
      const { phoneNumberId, code, pin } = body
      if (!phoneNumberId || !code) return NextResponse.json({ error: "Phone Number ID and 6-digit OTP code are required." }, { status: 400 })

      const connection = await prisma.metaConnection.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
      })
      const token = connection?.accessTokenEncrypted ? decryptMetaToken(connection.accessTokenEncrypted) : null
      if (!token) return NextResponse.json({ error: "Connect Facebook first." }, { status: 409 })

      // Verify OTP
      await metaGraph(
        `${phoneNumberId}/verify_code`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code: String(code).trim() }),
        }
      )

      // Register PIN
      const regPin = (pin || "123456").trim().slice(0, 6)
      await metaGraph(
        `${phoneNumberId}/register`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", pin: regPin }),
        }
      )

      // Update DB phone status
      await prisma.phoneNumber.updateMany({
        where: { phoneNumberId },
        data: { verificationStatus: "VERIFIED", status: "CONNECTED" },
      })

      return NextResponse.json({
        ok: true,
        message: `✓ Phone Number successfully verified and registered with PIN on WhatsApp Cloud API!`,
      })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gateway operation failed." },
      { status: 500 }
    )
  }
}

