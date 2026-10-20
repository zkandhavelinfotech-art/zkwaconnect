import { NextResponse } from "next/server"
import { linkBase } from "@/lib/links"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"
import { Prisma } from "@/generated/prisma/client"
import { saveTemplateMedia, uploadSampleHandle, type MediaAssets, type MediaKind } from "@/lib/whatsapp/template-media"

export const runtime = "nodejs"

async function getOrganizationId() {
  const session = await getSession()
  return session?.user.memberships.find(item => item.status === "ACTIVE")?.organizationId || null
}

type MetaTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  components?: {type?:string;text?:string;[key:string]:unknown}[]
  rejected_reason?: string
}

function bodyText(components:MetaTemplate["components"]){
  return components?.find(component=>component.type==="BODY")?.text||null
}

export async function GET() {
  try {
    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    const [templates, wabas] = await Promise.all([
      prisma.template.findMany({ where:{organizationId}, orderBy:{updatedAt:"desc"} }),
      prisma.waba.findMany({ where:{organizationId,status:"CONNECTED"}, select:{id:true,wabaId:true,name:true} }),
    ])
    return NextResponse.json({ templates, wabas })
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Could not load templates." }, { status:500 })
  }
}

// Shared body checks: numbered variables in order, not at the start/end, with a sample for each.
function validateBody(text: string | undefined, samples: string[]): { component: Record<string,unknown> } | { error: string } {
  if (!text) return { error:"Message body is required." }
  const numbers = [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])))].sort((a,b)=>a-b)
  if (numbers.some((number,index)=>number!==index+1)) return { error:"Number variables in order without gaps: {{1}}, {{2}}, {{3}}…" }
  if (/^\s*\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}[\s.!?]*$/.test(text))
    return { error:"Meta rejects templates that start or end with a variable. Add some text before and after." }
  const examples = samples.slice(0, numbers.length)
  if (examples.length < numbers.length || examples.some(example=>!example))
    return { error:`Add a sample value for each of the ${numbers.length} variable(s). Meta uses them to review your template.` }
  return { component:{type:"BODY",text,...(numbers.length ? {example:{body_text:[examples]}} : {})} }
}

export async function POST(request: Request) {
  try {
    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
    const buttonSchema = z.discriminatedUnion("type", [
      z.object({ type:z.literal("QUICK_REPLY"), text:z.string().trim().min(1).max(25) }),
      z.object({ type:z.literal("URL"), text:z.string().trim().min(1).max(25), url:z.string().trim().url().max(2000), track:z.boolean().optional() }),
      z.object({ type:z.literal("PHONE_NUMBER"), text:z.string().trim().min(1).max(25), phone_number:z.string().trim().regex(/^\+\d{8,15}$/) }),
    ])
    const schema = z.object({
      action: z.enum(["sync", "create", "delete"]),
      wabaId: z.string().min(1),
      name: z.string().trim().min(2).max(512).regex(/^[a-z0-9_]+$/).optional(),
      language: z.string().trim().min(2).max(10).default("en_US"),
      category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).default("UTILITY"),
      body: z.string().trim().max(1024).optional(),
      header: z.string().trim().max(60).optional(),
      footer: z.string().trim().max(60).optional(),
      buttons: z.array(buttonSchema).max(10).default([]),
      examples: z.array(z.string().trim().max(200)).max(20).default([]),
      codeExpiryMinutes: z.number().int().min(1).max(90).default(10),
      templateType: z.enum(["TEXT", "MEDIA", "CAROUSEL"]).default("TEXT"),
      headerFormat: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]).default("IMAGE"),
      media: z.object({ dataUrl: z.string().min(50).max(30_000_000), name: z.string().max(200) }).optional(),
      cards: z.array(z.object({
        media: z.object({ dataUrl: z.string().min(50).max(30_000_000), name: z.string().max(200) }),
        body: z.string().trim().min(1, "Each card needs text.").max(160, "Card text can be up to 160 characters."),
        buttons: z.array(buttonSchema).min(1).max(2),
      })).max(10).default([]),
    })
    const input = schema.parse(await request.json())
    const waba = await prisma.waba.findFirst({ where:{id:input.wabaId,organizationId,status:"CONNECTED"} })
    if (!waba) return NextResponse.json({ error:"Choose a connected WhatsApp Business Account." }, { status:404 })
    const accessToken = await getMetaAccessToken(organizationId)
    if (!accessToken) return NextResponse.json({ error:"Connect your Meta account first." }, { status:409 })

    if (input.action === "sync") {
      const response = await metaGraph<{data:MetaTemplate[]}>(
        `${waba.wabaId}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=100`, accessToken,
      )
      const synced = await Promise.all(response.data.map(template => prisma.template.upsert({
        where:{organizationId_name_language:{organizationId,name:template.name,language:template.language}},
        create:{organizationId,wabaId:waba.id,metaTemplateId:template.id,name:template.name,language:template.language,
          category:template.category,status:template.status,content:bodyText(template.components),components:template.components as object | undefined,
          rejectionReason:template.rejected_reason},
        update:{metaTemplateId:template.id,category:template.category,status:template.status,content:bodyText(template.components),
          components:template.components as object | undefined,rejectionReason:template.rejected_reason},
      })))
      return NextResponse.json({ok:true,count:synced.length})
    }

    if (input.action === "delete") {
      if (!input.name) return NextResponse.json({error:"Template name is required."},{status:400})
      await metaGraph(`${waba.wabaId}/message_templates?name=${encodeURIComponent(input.name)}`, accessToken, { method:"DELETE" })
      await prisma.template.deleteMany({where:{organizationId,wabaId:waba.id,name:input.name}})
      return NextResponse.json({ok:true,message:`Template ${input.name} deleted from Meta.`})
    }

    if (!input.name) return NextResponse.json({error:"Template name is required."},{status:400})
    let components: Record<string,unknown>[]
    let content: string
    let mediaAssets: MediaAssets | undefined
    let trackedButtons:{index:number;destination:string}[] = []
    if (input.templateType === "CAROUSEL") {
      // Carousel ("gallery"): main text + 2–10 swipeable cards, each with its own image/video, text and buttons.
      if (input.category !== "MARKETING") return NextResponse.json({error:"Carousel templates must use the Marketing category."},{status:400})
      if (input.cards.length < 2) return NextResponse.json({error:"Add at least 2 cards (up to 10)."},{status:400})
      const layout = input.cards[0].buttons.map(button => button.type).join(",")
      if (input.cards.some(card => card.buttons.map(button => button.type).join(",") !== layout))
        return NextResponse.json({error:"Every card must have the same number and type of buttons."},{status:400})
      if (input.cards.some(card => /\{\{/.test(card.body))) return NextResponse.json({error:"Card text can't contain variables."},{status:400})
      if (input.headerFormat === "DOCUMENT") return NextResponse.json({error:"Carousel cards use images or videos."},{status:400})
      const body = validateBody(input.body, input.examples)
      if ("error" in body) return NextResponse.json({error:body.error},{status:400})
      const kind = input.headerFormat.toLowerCase() as MediaKind
      const cardAssets = await Promise.all(input.cards.map(card => saveTemplateMedia(card.media.dataUrl, card.media.name, kind)))
      const handles = await Promise.all(cardAssets.map(asset => uploadSampleHandle(asset, accessToken)))
      components = [
        body.component,
        {type:"CAROUSEL",cards:input.cards.map((card,index)=>({components:[
          {type:"HEADER",format:input.headerFormat,example:{header_handle:[handles[index]]}},
          {type:"BODY",text:card.body},
          {type:"BUTTONS",buttons:card.buttons},
        ]}))},
      ]
      content = input.body!
      mediaAssets = { cards: cardAssets }
    } else if (input.category === "AUTHENTICATION") {
      // Meta only accepts its fixed OTP format for authentication templates.
      components = [
        {type:"BODY",add_security_recommendation:true},
        {type:"FOOTER",code_expiration_minutes:input.codeExpiryMinutes},
        {type:"BUTTONS",buttons:[{type:"OTP",otp_type:"COPY_CODE",text:"Copy code"}]},
      ]
      content = "{{1}} is your verification code. For your security, do not share this code."
    } else {
      const body = validateBody(input.body, input.examples)
      if ("error" in body) return NextResponse.json({error:body.error},{status:400})
      if (input.header && /\{\{/.test(input.header))
        return NextResponse.json({error:"Header variables are not supported here. Use plain header text."},{status:400})
      let headerComponent: Record<string,unknown> | null = input.header ? {type:"HEADER",format:"TEXT",text:input.header} : null
      if (input.templateType === "MEDIA") {
        // Media header: the file is Meta's review sample and is kept so we can attach it when sending.
        if (!input.media) return NextResponse.json({error:`Upload the header ${input.headerFormat.toLowerCase()}.`},{status:400})
        const asset = await saveTemplateMedia(input.media.dataUrl, input.media.name, input.headerFormat.toLowerCase() as MediaKind)
        headerComponent = {type:"HEADER",format:input.headerFormat,example:{header_handle:[await uploadSampleHandle(asset, accessToken)]}}
        mediaAssets = { header: asset }
      }
      // "Track clicks": the button points at our short-link path; the real URL is kept here and filled in per message.
      const base = linkBase()
      trackedButtons = input.buttons.flatMap((button, index) => button.type === "URL" && button.track ? [{ index, destination: button.url }] : [])
      const metaButtons = input.buttons.map(button => button.type === "URL" && button.track
        ? { type:"URL", text:button.text, url:`${base}/l/{{1}}`, example:[`${base}/l/demo12345a`] }
        : button.type === "URL" ? { type:"URL", text:button.text, url:button.url } : button)
      components = [
        ...(headerComponent ? [headerComponent] : []),
        body.component,
        ...(input.footer ? [{type:"FOOTER",text:input.footer}] : []),
        ...(metaButtons.length ? [{type:"BUTTONS",buttons:metaButtons}] : []),
      ]
      content = input.body!
    }
    const result = await metaGraph<MetaTemplate>(`${waba.wabaId}/message_templates`, accessToken, {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:input.name,language:input.language,category:input.category,components}),
    })
    const template = await prisma.template.upsert({
      where:{organizationId_name_language:{organizationId,name:input.name,language:input.language}},
      create:{organizationId,wabaId:waba.id,metaTemplateId:result.id,name:input.name,language:input.language,
        category:input.category,status:result.status || "PENDING",content,components:components as object[],
        ...(mediaAssets ? {mediaAssets:mediaAssets as object} : {}), ...(trackedButtons.length ? {trackedButtons} : {})},
      update:{metaTemplateId:result.id,category:input.category,status:result.status || "PENDING",content,components:components as object[],rejectionReason:null,
        mediaAssets:mediaAssets ? mediaAssets as object : Prisma.JsonNull, trackedButtons:trackedButtons.length ? trackedButtons : Prisma.JsonNull},
    })
    return NextResponse.json({template,message:"Submitted to Meta for review."},{status:201})
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({error:`${error.issues[0]?.path.join(".") || "Input"}: ${error.issues[0]?.message}`},{status:400})
    return NextResponse.json({error:error instanceof Error ? error.message : "Template operation failed."},{status:400})
  }
}