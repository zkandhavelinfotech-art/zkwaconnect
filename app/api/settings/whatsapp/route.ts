import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { isWabaSubscribed, subscribeWaba } from "@/lib/meta/waba"
import { VERTICAL_KEYS } from "@/lib/meta/profile"

export const runtime = "nodejs"

type MetaPhone = {
  id:string; display_phone_number:string; verified_name?:string; quality_rating?:string; code_verification_status?:string
  name_status?:string; status?:string; platform_type?:string; messaging_limit_tier?:string
}
type Profile = { about?:string; address?:string; description?:string; email?:string; profile_picture_url?:string; websites?:string[]; vertical?:string }

async function getMember() {
  const session = await getSession()
  const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
  return membership ? { organizationId:membership.organizationId, role:membership.role } : null
}

function message(error:unknown) {
  return error instanceof Error ? error.message : "Meta request failed."
}

export async function GET() {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    const { organizationId } = member
    const [accessToken, wabas, subscription, lastEvent, events24h] = await Promise.all([
      getMetaAccessToken(organizationId),
      prisma.waba.findMany({ where:{ organizationId }, include:{ phoneNumbers:true }, orderBy:{ createdAt:"asc" } }),
      prisma.subscription.findFirst({ where:{ organizationId }, include:{ plan:true }, orderBy:{ createdAt:"desc" } }),
      prisma.webhookEvent.findFirst({ where:{ organizationId }, orderBy:{ createdAt:"desc" }, select:{ createdAt:true, eventType:true } }),
      prisma.webhookEvent.count({ where:{ organizationId, createdAt:{ gte:new Date(Date.now() - 86_400_000) } } }),
    ])

    const periodStart = subscription?.currentPeriodStart || new Date(Date.now() - 30 * 86_400_000)
    const messagesUsed = await prisma.message.count({ where:{ direction:"OUTBOUND", createdAt:{ gte:periodStart },
      conversation:{ organizationId } } })

    const warnings:string[] = []
    if (!accessToken && wabas.length) warnings.push("Meta is not connected, so live details could not be loaded. Reconnect Meta from setup.")

    const accounts = await Promise.all(wabas.map(async waba => {
      const live = accessToken ? await Promise.all([
        metaGraph<{ name?:string; account_review_status?:string; currency?:string; timezone_id?:string }>(
          `${waba.wabaId}?fields=name,account_review_status,currency,timezone_id`, accessToken).catch(error => { warnings.push(`WABA ${waba.name}: ${message(error)}`); return null }),
        waba.metaBusinessId ? metaGraph<{ verification_status?:string }>(`${waba.metaBusinessId}?fields=verification_status`, accessToken)
          .catch(() => null) : Promise.resolve(null),
        isWabaSubscribed(waba.wabaId, accessToken).catch(error => { warnings.push(`Webhook subscription check for ${waba.name}: ${message(error)}`); return null }),
        metaGraph<{ data:MetaPhone[] }>(`${waba.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,platform_type&limit=50`,
          accessToken).catch(error => { warnings.push(`Phone numbers for ${waba.name}: ${message(error)}`); return null }),
      ]) : null
      const [info, business, subscribed, phonesLive] = live || [null, null, null, null]

      const phones = await Promise.all(waba.phoneNumbers.map(async phone => {
        const metaPhone = phonesLive?.data.find(item => item.id === phone.phoneNumberId)
        // Messaging tier is requested separately because Meta rejects the whole call if a field is unavailable.
        const tier = accessToken && metaPhone ? await metaGraph<{ messaging_limit_tier?:string }>(`${phone.phoneNumberId}?fields=messaging_limit_tier`, accessToken)
          .then(result => result.messaging_limit_tier).catch(() => undefined) : undefined
        const profile = accessToken && phone.status === "CONNECTED" ? await metaGraph<{ data:Profile[] }>(
          `${phone.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`, accessToken)
          .then(result => result.data[0] || {}).catch(error => { warnings.push(`Profile for ${phone.phoneNumber}: ${message(error)}`); return null }) : null
        if (metaPhone && (metaPhone.quality_rating !== phone.qualityRating || (tier && tier !== phone.messagingLimit) || metaPhone.verified_name !== phone.displayName))
          await prisma.phoneNumber.update({ where:{ id:phone.id }, data:{ qualityRating:metaPhone.quality_rating ?? phone.qualityRating,
            messagingLimit:tier ?? phone.messagingLimit, displayName:metaPhone.verified_name ?? phone.displayName } })
        return {
          id:phone.id, phoneNumberId:phone.phoneNumberId, phoneNumber:metaPhone?.display_phone_number || phone.phoneNumber,
          displayName:metaPhone?.verified_name || phone.displayName, status:phone.status, metaStatus:metaPhone?.status || null,
          nameStatus:metaPhone?.name_status || null, qualityRating:metaPhone?.quality_rating || phone.qualityRating,
          messagingLimit:tier || phone.messagingLimit, verificationStatus:metaPhone?.code_verification_status || phone.verificationStatus,
          profile,
        }
      }))
      const reviewStatus = info?.account_review_status || null
      if (info && (reviewStatus !== waba.verificationStatus || (info.name && info.name !== waba.name)))
        await prisma.waba.update({ where:{ id:waba.id }, data:{ verificationStatus:reviewStatus, name:info.name || waba.name } })
      return {
        id:waba.id, wabaId:waba.wabaId, name:info?.name || waba.name, status:waba.status, metaBusinessId:waba.metaBusinessId,
        currency:info?.currency || waba.currency, timezone:info?.timezone_id || waba.timezone, accountReviewStatus:reviewStatus,
        businessVerificationStatus:business?.verification_status || null, webhookSubscribed:subscribed?.subscribed ?? null, phones,
      }
    }))

    return NextResponse.json({
      metaConnected:Boolean(accessToken), accounts, warnings, canEdit:["OWNER","ADMIN","MANAGER"].includes(member.role),
      webhook:{ lastEventAt:lastEvent?.createdAt || null, lastEventType:lastEvent?.eventType || null, events24h },
      plan:subscription ? { name:subscription.plan.name, status:subscription.status, monthlyPrice:subscription.plan.monthlyPrice,
        maxMessages:subscription.plan.maxMessages, maxPhoneNumbers:subscription.plan.maxPhoneNumbers, maxUsers:subscription.plan.maxUsers,
        trialEndsAt:subscription.trialEndsAt, currentPeriodEnd:subscription.currentPeriodEnd, messagesUsed } : null,
    })
  } catch (error) {
    return NextResponse.json({ error:message(error) }, { status:500 })
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action:z.literal("updateProfile"),
    phoneId:z.string().min(1),
    about:z.string().trim().max(139),
    address:z.string().trim().max(256),
    description:z.string().trim().max(512),
    email:z.union([z.literal(""), z.string().trim().email().max(128)]),
    websites:z.array(z.string().trim().url().max(256)).max(2),
    vertical:z.enum(VERTICAL_KEYS),
  }),
  z.object({ action:z.literal("subscribeWebhook"), wabaId:z.string().min(1) }),
])

export async function POST(request:Request) {
  try {
    const member = await getMember()
    if (!member) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    if (!["OWNER","ADMIN","MANAGER"].includes(member.role))
      return NextResponse.json({ error:"Only owners, admins and managers can change WhatsApp settings." }, { status:403 })
    const { organizationId } = member
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error:"Connect Meta first." }, { status:409 })
    const input = postSchema.parse(await request.json())

    if (input.action === "subscribeWebhook") {
      const waba = await prisma.waba.findFirst({ where:{ id:input.wabaId, organizationId } })
      if (!waba) return NextResponse.json({ error:"WhatsApp account not found." }, { status:404 })
      await subscribeWaba(waba.wabaId, accessToken)
      return NextResponse.json({ message:"Webhook subscription enabled. New messages will now reach ZKWAConnect." })
    }

    const phone = await prisma.phoneNumber.findFirst({ where:{ id:input.phoneId, waba:{ organizationId } } })
    if (!phone) return NextResponse.json({ error:"Phone number not found." }, { status:404 })
    await metaGraph(`${phone.phoneNumberId}/whatsapp_business_profile`, accessToken, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ messaging_product:"whatsapp", about:input.about || undefined, address:input.address, description:input.description,
        email:input.email, websites:input.websites, vertical:input.vertical }),
    })
    return NextResponse.json({ message:"Business profile saved to WhatsApp." })
  } catch (error) {
    return NextResponse.json({ error:message(error) }, { status:400 })
  }
}
