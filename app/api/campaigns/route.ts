import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const maxDuration=60

async function getOrg() {
  const session = await getSession()
  const m = session?.user.memberships.find(m => m.status === "ACTIVE")
  if (!m) throw new Error("Unauthorized")
  return { organizationId: m.organizationId, role: m.role }
}

export async function GET(req: Request) {
  try {
    const { organizationId } = await getOrg()
    const url    = new URL(req.url)
    const status = url.searchParams.get("status")
    if (url.searchParams.has("estimate")) {
      const labels = (url.searchParams.get("labels") || "").split(",").map(label => label.trim()).filter(Boolean)
      const count = await prisma.contact.count({ where: { organizationId, optedIn: true,
        ...(labels.length ? { OR: labels.map(label => ({ tags: { array_contains: [label] } })) } : {}) } })
      return NextResponse.json({ count })
    }
    const [campaigns, phoneNumbers, templates, audienceTags] = await Promise.all([
      prisma.campaign.findMany({
        where:   { organizationId, ...(status ? { status } : {}) },
        include: {
          phoneNumber: { select: { displayName:true, phoneNumber:true } },
          template:    { select: { name:true, language:true, status:true, content:true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.phoneNumber.findMany({
        where: { waba: { organizationId }, status: "CONNECTED" },
        select: { id:true, phoneNumber:true, displayName:true, wabaId:true },
      }),
      prisma.template.findMany({ where: { organizationId }, orderBy: { updatedAt:"desc" } }),
      prisma.$queryRaw<{ tag:string; count:number }[]>`
        SELECT tag, COUNT(*)::int AS count
        FROM contacts, jsonb_array_elements_text(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END) AS tag
        WHERE "organizationId" = ${organizationId} AND "optedIn" = true
        GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 200`,
    ])
    return NextResponse.json({ campaigns, phoneNumbers, templates, audienceTags })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 })
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phoneNumberId: z.string().min(1),
  templateId: z.string().min(1),
  audienceType: z.enum(["ALL", "TAGS"]),
  audienceLabels: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  templateParameters: z.record(z.string().regex(/^\d{1,2}$/),z.string().max(1024)).default({}),
})

export async function POST(req: Request) {
  try {
    const { organizationId } = await getOrg()
    const input = createSchema.parse(await req.json())
    if (input.audienceType === "TAGS" && input.audienceLabels.length === 0)
      return NextResponse.json({ error: "Choose at least one contact label." }, { status: 400 })

    const [phoneNumber, template] = await Promise.all([
      prisma.phoneNumber.findFirst({
        where: { id: input.phoneNumberId, waba: { organizationId }, status: "CONNECTED" },
      }),
      prisma.template.findFirst({
        where: { id: input.templateId, organizationId, status: "APPROVED" },
      }),
    ])
    if (!phoneNumber) return NextResponse.json({ error: "Choose a connected phone number in this workspace." }, { status: 400 })
    if (!template) return NextResponse.json({ error: "Choose an approved WhatsApp template." }, { status: 400 })
    if (template.wabaId !== phoneNumber.wabaId)
      return NextResponse.json({ error: "The selected template belongs to a different WhatsApp account." }, { status: 400 })

    const audienceWhere = {
      organizationId,
      optedIn: true,
      ...(input.audienceType === "TAGS" ? {
        OR: input.audienceLabels.map(label => ({ tags: { array_contains: [label] } })),
      } : {}),
    }
    const totalCount = await prisma.contact.count({ where: audienceWhere })
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        phoneNumberId: phoneNumber.id,
        templateId: template.id,
        name: input.name,
        audienceType: input.audienceType,
        audienceLabels: input.audienceType === "TAGS" ? input.audienceLabels : undefined,
        templateParameters: input.templateParameters as Prisma.InputJsonValue,
        totalCount,
        status: "DRAFT",
      },
      include: {
        phoneNumber: { select: { displayName:true, phoneNumber:true } },
        template: { select: { name:true, language:true, status:true } },
      },
    })
    return NextResponse.json({ campaign, message: "Campaign draft saved. Launch it from the campaign list when ready." }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create campaign." }, { status: 400 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { organizationId } = await getOrg()
    const { id, action }     = await req.json() as { id:string; action:string }
    const campaign = await prisma.campaign.findFirst({ where: { id, organizationId },include:{template:true,phoneNumber:true} })
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if(action==="launch"){
      if(!campaign.template||campaign.template.status!=="APPROVED")
        return NextResponse.json({error:"Campaign requires an approved WhatsApp template."},{status:400})
      if(campaign.status!=="DRAFT"&&campaign.status!=="PAUSED")
        return NextResponse.json({error:"Only draft or paused campaigns can launch."},{status:409})
      const labels=Array.isArray(campaign.audienceLabels)?campaign.audienceLabels.filter((label):label is string=>typeof label==="string"):[]
      const where:Prisma.ContactWhereInput={organizationId,optedIn:true,
        ...(campaign.audienceType==="TAGS"?{OR:labels.map(label=>({tags:{array_contains:[label]}}))}:{})}
      const recipients=await prisma.contact.findMany({where,select:{id:true,phone:true,name:true},take:501})
      if(recipients.length===0)return NextResponse.json({error:"No opted-in contacts match this campaign audience."},{status:400})
      if(recipients.length>500)return NextResponse.json({error:"This launch is limited to 500 recipients. Narrow the audience with contact labels."},{status:400})
      const accessToken=await getMetaAccessToken(organizationId)
      if(!accessToken)return NextResponse.json({error:"Connect Meta before launching a campaign."},{status:409})
      const content=campaign.template.content||""
      const placeholderNumbers=[...new Set([...content.matchAll(/\{\{(\d+)\}\}/g)].map(match=>match[1]))]
        .sort((a,b)=>Number(a)-Number(b))
      const variables=campaign.templateParameters&&typeof campaign.templateParameters==="object"&&!Array.isArray(campaign.templateParameters)
        ?campaign.templateParameters as Record<string,unknown>:{}
      const missing=placeholderNumbers.filter(number=>typeof variables[number]!=="string"||!String(variables[number]).trim())
      if(missing.length)return NextResponse.json({error:`Fill template variable(s): ${missing.join(", ")}.`},{status:400})

      await prisma.campaign.update({where:{id},data:{status:"RUNNING",startedAt:new Date(),totalCount:recipients.length,
        sentCount:0,deliveredCount:0,readCount:0,failedCount:0}})
      let sentCount=0
      let failedCount=0
      for(let offset=0;offset<recipients.length;offset+=5){
        const batch=recipients.slice(offset,offset+5)
        const outcomes=await Promise.all(batch.map(async contact=>{
          try{
            let conversation=await prisma.conversation.findFirst({where:{organizationId,phoneNumberId:campaign.phoneNumberId,
              contactId:contact.id,status:"OPEN"}})
            if(!conversation)conversation=await prisma.conversation.create({data:{organizationId,phoneNumberId:campaign.phoneNumberId,
              contactId:contact.id,status:"OPEN"}})
            const components=placeholderNumbers.length?[{type:"body",parameters:placeholderNumbers.map(number=>({type:"text",text:String(variables[number])}))}]:undefined
            const result=await metaGraph<{messages?:{id:string}[]}>(`${campaign.phoneNumber.phoneNumberId}/messages`,accessToken,{
              method:"POST",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:contact.phone,type:"template",
                template:{name:campaign.template!.name,language:{code:campaign.template!.language},...(components?{components}:{})}}),
            })
            await prisma.message.create({data:{conversationId:conversation.id,externalMessageId:result.messages?.[0]?.id,
              direction:"OUTBOUND",type:"TEMPLATE",content:campaign.template!.content||campaign.template!.name,status:"SENT",
              sentAt:new Date(),metadata:{campaignId:id,templateId:campaign.templateId}}})
            await prisma.conversation.update({where:{id:conversation.id},data:{lastMessageAt:new Date()}})
            return true
          }catch{return false}
        }))
        sentCount+=outcomes.filter(Boolean).length
        failedCount+=outcomes.length-outcomes.filter(Boolean).length
        await prisma.campaign.update({where:{id},data:{sentCount,failedCount}})
      }
      const updated=await prisma.campaign.update({where:{id},data:{status:"COMPLETED",completedAt:new Date()}})
      return NextResponse.json({campaign:updated,message:`Campaign finished: ${sentCount} accepted by Meta, ${failedCount} failed.`})
    }

    const newStatus: Record<string,string> = {
      pause:"PAUSED", resume:"RUNNING", cancel:"CANCELLED"
    }
    if (!newStatus[action]) return NextResponse.json({ error: "Invalid action" }, { status: 400 })

    const updated = await prisma.campaign.update({
      where: { id },
      data:  {
        status: newStatus[action],
        ...(action === "cancel" ? { completedAt: new Date() } : {}),
      },
    })
    return NextResponse.json({ campaign: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
