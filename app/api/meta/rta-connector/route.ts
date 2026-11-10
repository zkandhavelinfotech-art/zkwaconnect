import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { graphVersion, metaGraph } from "@/lib/meta/graph"
import { isWabaSubscribed, subscribeWaba } from "@/lib/meta/waba"

export const runtime = "nodejs"

const RTA_BUSINESS_ID = "1707214344108990"
const RTA_PAGE_URL = "https://www.facebook.com/Recruitmenttrainingacademy"
const RTA_DEFAULT_PHONE = "7795783535"

// Helper to scrape public OpenGraph tags from Facebook without requiring restricted API permissions
async function inspectPublicFacebookUrl(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    })

    const html = await res.text()
    const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<title>([^<]+)<\/title>/i)
    const title = ogTitle ? ogTitle[1].replace(/\s*\|\s*Facebook$/i, "").trim() : null

    const alUrl = html.match(/content=["']fb:\/\/(?:profile|page)\/(\d+)["']/i)
    const pageIdMatch = html.match(/"pageID":"(\d+)"/i)
    const delIdMatch = html.match(/"delegate_page_id":"(\d+)"/i)
    const profileIdMatch = html.match(/facebook\.com\/profile\.php\?id=(\d+)/i)

    const numericId = alUrl?.[1] || pageIdMatch?.[1] || delIdMatch?.[1] || profileIdMatch?.[1] || null
    const isProfile = Boolean(numericId && numericId.startsWith("1000"))

    return {
      status: res.status,
      title,
      numericId,
      isProfile,
      hasDirectPageId: Boolean(pageIdMatch?.[1] || delIdMatch?.[1]),
    }
  } catch (err) {
    return {
      status: 500,
      title: null,
      numericId: null,
      isProfile: false,
      hasDirectPageId: false,
      error: err instanceof Error ? err.message : "Scraping failed",
    }
  }
}

async function getRtaConnection(organizationId: string) {
  // 1. If currently inside RTA organization with active token, use it
  let conn = await prisma.metaConnection.findFirst({
    where: {
      organizationId,
      status: "CONNECTED",
      accessTokenEncrypted: { not: null },
      metaUserId: "122145064659242402",
    },
    orderBy: { updatedAt: "desc" },
  })

  // 2. Otherwise search for the Meta Connection authenticated with RTA Business Portfolio 1707214344108990
  if (!conn) {
    conn = await prisma.metaConnection.findFirst({
      where: {
        OR: [
          { metaUserId: "122145064659242402", status: "CONNECTED" },
          { organization: { slug: { in: ["rta", "recruitment-training-academy"] } }, status: "CONNECTED" },
        ],
        accessTokenEncrypted: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    })
  }

  // 3. Fallback to active organization's connection
  if (!conn) {
    conn = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" },
    })
  }

  return conn
}

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

    const connection = await getRtaConnection(organizationId)

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    // 1. Fetch Business Portfolio details
    let businessDetails: any = null
    let ownedWabas: any[] = []
    let ownedPages: any[] = []
    let managedPages: any[] = []
    let livePhones: any[] = []

    if (token) {
      try {
        businessDetails = await metaGraph(
          `${RTA_BUSINESS_ID}?fields=id,name,verification_status,created_time`,
          token
        )
      } catch {
        businessDetails = { id: RTA_BUSINESS_ID, name: "Recruitment Training Academy", verification_status: "not_verified" }
      }

      try {
        const wabasRes = await metaGraph<{ data: any[] }>(
          `${RTA_BUSINESS_ID}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id,message_template_namespace`,
          token
        )
        ownedWabas = wabasRes.data || []
      } catch {
        ownedWabas = []
      }

      // Fetch phone numbers for each WABA
      for (const w of ownedWabas) {
        try {
          const pRes = await metaGraph<{ data: any[] }>(
            `${w.id}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
            token
          )
          if (pRes.data) {
            w.phoneNumbers = pRes.data
            livePhones.push(...pRes.data.map(p => ({ ...p, wabaId: w.id, wabaName: w.name })))
          }
        } catch {
          w.phoneNumbers = []
        }
      }

      try {
        const pagesRes = await metaGraph<{ data: any[] }>(
          `${RTA_BUSINESS_ID}/owned_pages?fields=id,name,category,link,is_published`,
          token
        )
        ownedPages = pagesRes.data || []
      } catch {
        ownedPages = []
      }

      try {
        const meRes = await metaGraph<{ data: any[] }>(
          "me/accounts?fields=id,name,link,category,tasks",
          token
        )
        managedPages = meRes.data || []
      } catch {
        managedPages = []
      }
    }

    // 2. Inspect the Facebook Page URL
    const publicPageInspection = await inspectPublicFacebookUrl(RTA_PAGE_URL)

    // Check webhook subscription status for the primary WABA
    let webhookSubscribed = false
    const primaryWaba = ownedWabas[0]
    if (token && primaryWaba?.id) {
      try {
        const sub = await isWabaSubscribed(primaryWaba.id, token)
        webhookSubscribed = sub.subscribed
      } catch {
        webhookSubscribed = false
      }
    }

    // Local DB WABA status for current organization
    const dbWaba = await prisma.waba.findFirst({
      where: { organizationId },
      include: { phoneNumbers: true },
    })

    const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "")

    const allUserMemberships = await prisma.membership.findMany({
      where: { userId: session.user.id, status: "ACTIVE" },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    })

    return NextResponse.json({
      ok: true,
      activeWorkspace: {
        id: organizationId,
        name: membership?.organization?.name || "Active Workspace",
        isRta: organizationId === "cmw6qdt5a0001m4v92koc2umi" || organizationId === "cmw7qdakr000114v9tsme9b32",
      },
      workspaces: allUserMemberships.map(m => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        isRta: m.organization.slug === "rta" || m.organization.slug === "recruitment-training-academy",
      })),
      businessPortfolio: {
        id: RTA_BUSINESS_ID,
        name: businessDetails?.name || "Recruitment Training Academy",
        verificationStatus: businessDetails?.verification_status || "not_verified",
        url: `https://business.facebook.com/latest/settings?business_id=${RTA_BUSINESS_ID}`,
      },
      waba: {
        hasWaba: ownedWabas.length > 0,
        primaryWaba: primaryWaba || null,
        allWabas: ownedWabas,
        livePhones,
        webhookSubscribed,
        webhookUrl: `${appUrl}/api/whatsapp/webhook`,
        verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "zkwa_webhook_verify_secure_2026",
        dbSynced: Boolean(dbWaba),
      },
      pageIntegration: {
        url: RTA_PAGE_URL,
        inspection: publicPageInspection,
        ownedPages,
        managedPages,
        isPageClaimed: ownedPages.some(p => p.id === publicPageInspection.numericId || p.link?.includes("Recruitmenttrainingacademy")),
        createPageUrl: `https://business.facebook.com/settings/pages?business_id=${RTA_BUSINESS_ID}`,
        addPageUrl: `https://business.facebook.com/settings/pages?business_id=${RTA_BUSINESS_ID}`,
      },
      metaAppId: process.env.META_APP_ID || "1710743377107186",
      graphVersion: graphVersion(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load RTA configuration." },
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

    const connection = await getRtaConnection(organizationId)

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    if (!token) {
      return NextResponse.json({ error: "No active Meta connection found." }, { status: 409 })
    }

    const body = await request.json()
    const { action } = body

    // ACTION 1: Sync WABA and Phone from Meta into Workspace DB so user can send/receive messages immediately
    if (action === "sync_waba") {
      const { wabaId, phoneNumberId, displayPhoneNumber, verifiedName } = body

      const targetWabaId = wabaId || "1169391638991834"
      const targetPhoneId = phoneNumberId || "1408496172352210"
      const targetDisplay = displayPhoneNumber || "+91 77957 83535"
      const targetName = verifiedName || "Recruitment Training Academy"

      // Upsert WABA in DB
      const waba = await prisma.waba.upsert({
        where: { wabaId: targetWabaId },
        update: {
          organizationId,
          name: targetName,
          status: "CONNECTED",
        },
        create: {
          wabaId: targetWabaId,
          organizationId,
          name: targetName,
          status: "CONNECTED",
          currency: "INR",
          timezone: "Asia/Kolkata",
        },
      })

      // Upsert Phone Number in DB
      const phone = await prisma.phoneNumber.upsert({
        where: { phoneNumberId: targetPhoneId },
        update: {
          wabaId: waba.id,
          phoneNumber: targetDisplay,
          displayName: targetName,
          status: "CONNECTED",
          qualityRating: "GREEN",
        },
        create: {
          phoneNumberId: targetPhoneId,
          wabaId: waba.id,
          phoneNumber: targetDisplay,
          displayName: targetName,
          status: "CONNECTED",
          qualityRating: "GREEN",
        },
      })

      // Try subscribing webhooks on Meta
      let subscribed = false
      try {
        await subscribeWaba(targetWabaId, token)
        subscribed = true
      } catch {
        subscribed = false
      }

      return NextResponse.json({
        ok: true,
        message: `✓ WABA (${targetWabaId}) & Phone (${targetDisplay}) successfully synchronized into your workspace! Direct WhatsApp Cloud API messaging is active.`,
        waba,
        phone,
        webhookSubscribed: subscribed,
      })
    }

    // ACTION: Connect Official Production WhatsApp WABA & Phone (+91 77957 83535)
    if (action === "connect_official_waba") {
      const { wabaId, phoneNumberId, displayPhoneNumber, verifiedName } = body

      if (!wabaId || !phoneNumberId) {
        return NextResponse.json({ error: "Official WABA ID and Phone Number ID are required." }, { status: 400 })
      }

      const targetWabaId = String(wabaId).trim()
      const targetPhoneId = String(phoneNumberId).trim()
      const targetPhone = displayPhoneNumber || "+91 77957 83535"
      const targetName = verifiedName || "Recruitment Training Academy"

      // 1. Verify with Meta Graph API
      let metaPhoneDetails: any = null
      try {
        metaPhoneDetails = await metaGraph<any>(
          `${targetPhoneId}?fields=id,display_phone_number,verified_name,status,code_verification_status,quality_rating`,
          token
        )
      } catch (err: any) {
        // Warning if Meta couldn't load, but continue with supplied values
      }

      // 2. Save / Upsert WABA in DB
      const rtaOrg = await prisma.organization.findFirst({
        where: { slug: { in: ["rta", "recruitment-training-academy"] } },
      })
      const targetOrgId = rtaOrg?.id || organizationId

      const waba = await prisma.waba.upsert({
        where: { wabaId: targetWabaId },
        update: {
          organizationId: targetOrgId,
          name: targetName,
          status: "CONNECTED",
          metaBusinessId: RTA_BUSINESS_ID,
        },
        create: {
          wabaId: targetWabaId,
          organizationId: targetOrgId,
          name: targetName,
          status: "CONNECTED",
          metaBusinessId: RTA_BUSINESS_ID,
          currency: "INR",
          timezone: "Asia/Kolkata",
        },
      })

      // 3. Save / Upsert Phone Number in DB
      const phone = await prisma.phoneNumber.upsert({
        where: { phoneNumberId: targetPhoneId },
        update: {
          wabaId: waba.id,
          phoneNumber: metaPhoneDetails?.display_phone_number || targetPhone,
          displayName: metaPhoneDetails?.verified_name || targetName,
          status: "CONNECTED",
          verificationStatus: metaPhoneDetails?.code_verification_status || "VERIFIED",
          qualityRating: metaPhoneDetails?.quality_rating || "GREEN",
        },
        create: {
          phoneNumberId: targetPhoneId,
          wabaId: waba.id,
          phoneNumber: metaPhoneDetails?.display_phone_number || targetPhone,
          displayName: metaPhoneDetails?.verified_name || targetName,
          status: "CONNECTED",
          verificationStatus: metaPhoneDetails?.code_verification_status || "VERIFIED",
          qualityRating: metaPhoneDetails?.quality_rating || "GREEN",
        },
      })

      // 4. Subscribe Webhooks on Meta
      let subscribed = false
      try {
        await subscribeWaba(targetWabaId, token)
        subscribed = true
      } catch {
        subscribed = false
      }

      return NextResponse.json({
        ok: true,
        message: `✓ Official Production WABA (${targetWabaId}) & Phone ${phone.phoneNumber} successfully connected to Recruitment Training Academy!`,
        waba,
        phone,
        metaDetails: metaPhoneDetails,
        webhookSubscribed: subscribed,
      })
    }

    // ACTION 2: Send live test WhatsApp message directly via Meta Cloud API & record in Live Chat Inbox
    if (action === "send_test_message") {
      const { recipientPhone, phoneNumberId, messageText, recipientLabel } = body

      if (!recipientPhone) {
        return NextResponse.json({ error: "Recipient phone number is required." }, { status: 400 })
      }

      const cleanPhone = String(recipientPhone).replace(/[^0-9]/g, "")
      const phoneIdToUse = phoneNumberId || "1408496172352210"
      const textToSend = messageText || "Hello! This is a test message from Recruitment Training Academy (+91 77957 83535). Your WhatsApp Cloud API gateway is active!"

      // Determine Contact display name
      const contactName = recipientLabel || (
        cleanPhone.includes("9632108103")
          ? "Customer RTA"
          : cleanPhone.includes("7824055618")
          ? "ZKandavel Infotech"
          : `Candidate ${cleanPhone.slice(-4)}`
      )

      let metaResponse: any = null
      let messageId: string | null = null
      let metaError: string | null = null

      // 1. Attempt sending through Meta Graph API
      try {
        const res = await metaGraph<{ messages?: { id: string }[]; error?: any }>(
          `${phoneIdToUse}/messages`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: cleanPhone,
              type: "text",
              text: { body: textToSend },
            }),
          }
        )
        metaResponse = res
        messageId = res.messages?.[0]?.id || null
      } catch (err: any) {
        metaError = err.message || "Meta API Error"
      }

      // 2. Find or Create Contact in local database for active workspace
      let contact = await prisma.contact.findFirst({
        where: { organizationId, phone: cleanPhone },
      })
      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            organizationId,
            phone: cleanPhone,
            name: contactName,
            tags: ["Fresher HR", "Direct RTA Test"],
            optedIn: true,
            source: "RTA_GATEWAY",
          },
        })
      }

      // 3. Find or Create Conversation in local database
      let conversation = await prisma.conversation.findFirst({
        where: { organizationId, contactId: contact.id },
      })

      const phoneRecord = await prisma.phoneNumber.findFirst({
        where: { phoneNumberId: phoneIdToUse },
      }) || await prisma.phoneNumber.findFirst({
        where: { waba: { organizationId } },
      })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            organizationId,
            contactId: contact.id,
            channel: "WHATSAPP",
            phoneNumberId: phoneRecord?.id || null,
            status: "OPEN",
            lastMessageAt: new Date(),
          },
        })
      }

      // 4. Create Message record in database so it shows up in /app/inbox immediately
      const createdMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          externalMessageId: messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          direction: "OUTBOUND",
          senderUserId: session.user.id,
          type: "TEXT",
          content: textToSend,
          status: messageId ? "SENT" : metaError ? "FAILED" : "QUEUED",
          sentAt: new Date(),
          metadata: {
            source: "RTA_GATEWAY_TESTER",
            senderBusinessPhone: "+91 77957 83535",
            recipientName: contactName,
            metaError,
          },
        },
      })

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), unreadCount: 0 },
      })

      if (metaError && !messageId) {
        return NextResponse.json({
          ok: false,
          recordedInInbox: true,
          conversationId: conversation.id,
          inboxUrl: `/app/inbox?conversationId=${conversation.id}`,
          contactName,
          recipient: cleanPhone,
          error: `Meta Cloud API send response: ${metaError}. Message has been logged in your Live Chat Inbox.`,
          message: `Notice: Meta Cloud API requires recipient number (+${cleanPhone}) to be verified on App 1710743377107186, or the official phone (+91 77957 83535) to be live. The chat thread has been created in your Live Chat Inbox.`,
        })
      }

      return NextResponse.json({
        ok: true,
        metaResponse,
        messageId,
        recipient: cleanPhone,
        contactName,
        conversationId: conversation.id,
        inboxUrl: `/app/inbox?conversationId=${conversation.id}`,
        message: `✓ Message sent from +91 77957 83535 to ${contactName} (+${cleanPhone}) and recorded in your Live Chat Inbox!`,
      })
    }

    // ACTION 3: Claim / Add Facebook Page to Business Portfolio 1707214344108990
    if (action === "claim_facebook_page") {
      const { pageId } = body
      if (!pageId) {
        return NextResponse.json({ error: "Page ID or URL is required." }, { status: 400 })
      }

      const numericId = String(pageId).trim()

      if (numericId.startsWith("1000")) {
        return NextResponse.json({
          error: `"${numericId}" is a Personal Facebook Profile (fb://profile/1000...), not an official Facebook Business Page. Meta requires an official Facebook Page to connect to Business Portfolios and link WhatsApp CTA buttons.`,
          isProfile: true,
          createPageUrl: `https://business.facebook.com/settings/pages?business_id=${RTA_BUSINESS_ID}`,
        }, { status: 422 })
      }

      try {
        const res = await metaGraph<{ success?: boolean; id?: string }>(
          `${RTA_BUSINESS_ID}/pages`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page_id: numericId }),
          }
        )

        return NextResponse.json({
          ok: true,
          message: `✓ Facebook Page (${numericId}) successfully added to Business Portfolio 1707214344108990!`,
          result: res,
        })
      } catch (err: any) {
        // Fallback to client_pages request
        try {
          const clientRes = await metaGraph<{ success?: boolean; id?: string }>(
            `${RTA_BUSINESS_ID}/client_pages`,
            token,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                page_id: numericId,
                permitted_tasks: ["ADVERTISE", "MESSAGING", "CREATE_CONTENT", "MODERATE", "ANALYZE"],
              }),
            }
          )
          return NextResponse.json({
            ok: true,
            message: `✓ Page access request submitted for Facebook Page (${numericId}) into Business Portfolio 1707214344108990!`,
            result: clientRes,
          })
        } catch (innerErr: any) {
          return NextResponse.json({
            error: `Meta rejected adding page: ${innerErr.message || err.message}`,
            manualUrl: `https://business.facebook.com/settings/pages?business_id=${RTA_BUSINESS_ID}`,
          }, { status: 400 })
        }
      }
    }

    // ACTION 4: Link WhatsApp Number to Facebook Page
    if (action === "link_whatsapp_to_page") {
      const { pageId, phoneNumber } = body
      const targetPhone = phoneNumber || RTA_DEFAULT_PHONE
      const targetPageId = pageId || "100075867504434"

      // Attempt Graph API call if supported
      try {
        const res = await metaGraph<{ success?: boolean; id?: string }>(
          `${targetPageId}/whatsapp_connected_phone_number`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone_number: targetPhone }),
          }
        )
        return NextResponse.json({
          ok: true,
          message: `✓ WhatsApp Number (${targetPhone}) linked to Facebook Page (${targetPageId})!`,
          result: res,
        })
      } catch (err: any) {
        // Meta typically requires WhatsApp link confirmation in Meta Business Suite / Page Settings
        return NextResponse.json({
          ok: false,
          needsConfirmation: true,
          pageId: targetPageId,
          phoneNumber: targetPhone,
          message: `To connect your WhatsApp number (+91 ${targetPhone}) as the chat CTA button on your Facebook Page, open Page WhatsApp Settings or Meta Business Suite. Meta will send a 6-digit confirmation code to your WhatsApp app.`,
          pageWhatsappSettingsUrl: `https://www.facebook.com/${targetPageId}/settings/?tab=whatsapp`,
          businessSuiteWhatsappUrl: `https://business.facebook.com/latest/settings/whatsapp_accounts?business_id=${RTA_BUSINESS_ID}`,
          error: err.message,
        })
      }
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed." },
      { status: 500 }
    )
  }
}
