import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { handleInboundMessage } from "@/lib/flows/engine"

export const runtime = "nodejs"

type IncomingMessage = {
  id:string
  from:string
  type:string
  timestamp?:string
  text?:{body?:string}
  interactive?:{button_reply?:{id?:string;title?:string};list_reply?:{id?:string;title?:string}}
  button?:{text?:string;payload?:string}
  [key:string]:unknown
}
type IncomingStatus = { id:string; status:string; timestamp?:string }
type ChangeValue = {
  metadata?:{phone_number_id?:string;display_phone_number?:string}
  contacts?:{profile?:{name?:string};wa_id?:string}[]
  messages?:IncomingMessage[]
  statuses?:IncomingStatus[]
}
type WebhookBody = { entry?:{id?:string;changes?:{field?:string;value?:ChangeValue}[]}[] }

export async function GET(request:NextRequest) {
  const params=request.nextUrl.searchParams
  const mode=params.get("hub.mode")
  const token=params.get("hub.verify_token")
  const challenge=params.get("hub.challenge")
  if(mode==="subscribe"&&token&&token===process.env.META_VERIFY_TOKEN&&challenge)
    return new Response(challenge,{status:200,headers:{"Content-Type":"text/plain"}})
  return NextResponse.json({error:"Webhook verification failed."},{status:403})
}

function signatureIsValid(rawBody:string,signature:string|null) {
  const secret=process.env.META_APP_SECRET
  if(!secret||!signature?.startsWith("sha256="))return false
  const expected=Buffer.from(`sha256=${crypto.createHmac("sha256",secret).update(rawBody).digest("hex")}`)
  const received=Buffer.from(signature)
  return expected.length===received.length&&crypto.timingSafeEqual(expected,received)
}

function timestamp(value?:string) {
  const parsed=Number(value)
  return Number.isFinite(parsed)&&parsed>0?new Date(parsed*1000):new Date()
}

async function processMessage(organizationId:string,phoneNumber:NonNullable<Awaited<ReturnType<typeof prisma.phoneNumber.findUnique>>>,
  message:IncomingMessage,profileName?:string) {
  const prior=await prisma.message.findFirst({where:{externalMessageId:message.id,direction:"INBOUND"},select:{id:true}})
  if(prior)return
  const body=message.text?.body||message.interactive?.button_reply?.title||message.interactive?.list_reply?.title||message.button?.text||""
  const replyId=message.interactive?.button_reply?.id||message.interactive?.list_reply?.id||message.button?.payload
  const contact=await prisma.contact.upsert({
    where:{organizationId_phone:{organizationId,phone:message.from}},
    create:{organizationId,phone:message.from,name:profileName||null,source:"WHATSAPP_INBOUND",optedIn:false},
    update:profileName?{name:profileName}:{},
  })
  let conversation=await prisma.conversation.findFirst({where:{organizationId,phoneNumberId:phoneNumber.id,contactId:contact.id,status:"OPEN"}})
  if(!conversation)conversation=await prisma.conversation.create({
    data:{organizationId,phoneNumberId:phoneNumber.id,contactId:contact.id,status:"OPEN",lastMessageAt:timestamp(message.timestamp)},
  })
  await prisma.message.create({data:{
    conversationId:conversation.id,externalMessageId:message.id,direction:"INBOUND",type:message.type.toUpperCase(),
    content:body||null,status:"RECEIVED",metadata:message as Prisma.InputJsonValue,sentAt:timestamp(message.timestamp),
  }})
  await prisma.conversation.update({where:{id:conversation.id},data:{lastMessageAt:timestamp(message.timestamp),unreadCount:{increment:1}}})

  if(!body&&!replyId)return
  await handleInboundMessage({organizationId,metaPhoneNumberId:phoneNumber.phoneNumberId,conversationId:conversation.id,
    flowState:conversation.flowState,contact,text:body,replyId,
    getAccessToken:async()=>{
      const accessToken=await getMetaAccessToken(organizationId)
      if(!accessToken)throw new Error("No connected Meta token is available to send the workflow reply.")
      return accessToken
    }})
}

export async function POST(request:NextRequest) {
  const rawBody=await request.text()
  if(!signatureIsValid(rawBody,request.headers.get("x-hub-signature-256")))
    return NextResponse.json({error:"Invalid webhook signature."},{status:401})

  let payload:WebhookBody
  try{payload=JSON.parse(rawBody) as WebhookBody}
  catch{return NextResponse.json({error:"Invalid JSON payload."},{status:400})}

  try{
    for(const entry of payload.entry||[]){
      for(const change of entry.changes||[]){
        const value=change.value||{}
        const phoneNumberId=value.metadata?.phone_number_id
        const phoneNumber=phoneNumberId?await prisma.phoneNumber.findUnique({where:{phoneNumberId},include:{waba:true}}):null
        const organizationId=phoneNumber?.waba.organizationId||null

        for(const status of value.statuses||[]){
          const message=await prisma.message.findFirst({where:{externalMessageId:status.id},select:{id:true,status:true,metadata:true}})
          if(!message)continue
          const nextStatus=status.status.toUpperCase()
          if(message.status===nextStatus)continue
          await prisma.message.update({where:{id:message.id},data:{status:nextStatus,
            ...(status.status==="delivered"?{deliveredAt:timestamp(status.timestamp)}:{}),
            ...(status.status==="read"?{readAt:timestamp(status.timestamp)}:{})}})
          if(message.metadata&&typeof message.metadata==="object"&&!Array.isArray(message.metadata)){
            const campaignId=(message.metadata as Record<string,unknown>).campaignId
            if(typeof campaignId==="string")await prisma.campaign.updateMany({where:{id:campaignId,organizationId:organizationId||undefined},data:
              status.status==="delivered"?{deliveredCount:{increment:1}}:status.status==="read"?{readCount:{increment:1}}:
                status.status==="failed"?{failedCount:{increment:1}}:{}})
          }
        }
        for(const message of value.messages||[]){
          const profile=value.contacts?.find(contact=>contact.wa_id===message.from)?.profile?.name
          if(phoneNumber&&organizationId)await processMessage(organizationId,phoneNumber,message,profile)
          const existing=await prisma.webhookEvent.findFirst({where:{externalEventId:message.id}})
          if(existing)await prisma.webhookEvent.update({where:{id:existing.id},data:{status:phoneNumber?"PROCESSED":"UNMATCHED",error:null,processedAt:new Date()}})
          else await prisma.webhookEvent.create({data:{
              organizationId,wabaId:phoneNumber?.waba.wabaId||entry.id||null,eventType:`whatsapp.${message.type}`,
              externalEventId:message.id,payload:message as Prisma.InputJsonValue,status:phoneNumber?"PROCESSED":"UNMATCHED",
              processedAt:new Date(),
            }})
        }
      }
    }
    return NextResponse.json({received:true})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Webhook processing failed."},{status:500})
  }
}