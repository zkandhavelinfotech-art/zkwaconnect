import crypto from "node:crypto"
import { handleConsentKeyword } from "@/lib/inbox/consent"
import { handleInstagramEntry } from "@/lib/instagram/accounts"
import { notifyNewMessage } from "@/lib/push"
import { handleCodReply } from "@/lib/integrations/store"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { itemsText, recordWhatsAppOrder } from "@/lib/commerce/orders"
import { emitEvent } from "@/lib/developer/webhooks"
import { autoAssignConversation, sendAwayMessageIfClosed } from "@/lib/inbox/automation"
import { applyRecipientStatus, markBroadcastReply, type WhatsAppStatus } from "@/lib/campaigns/status"
import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { handleInboundMessage } from "@/lib/flows/engine"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { applyTemplateEvent } from "@/lib/whatsapp/template-events"

export const runtime = "nodejs"

type IncomingMessage = {
  id:string
  from:string
  type:string
  timestamp?:string
  text?:{body?:string}
  interactive?:{button_reply?:{id?:string;title?:string};list_reply?:{id?:string;title?:string}}
  button?:{text?:string;payload?:string}
  location?:{latitude?:number;longitude?:number;name?:string;address?:string}
  [key:string]:unknown
}
type IncomingStatus = WhatsAppStatus
type ChangeValue = {
  metadata?:{phone_number_id?:string;display_phone_number?:string}
  contacts?:{profile?:{name?:string};wa_id?:string}[]
  messages?:IncomingMessage[]
  statuses?:IncomingStatus[]
}
type WebhookBody = { object?:string; entry?:{id?:string;changes?:{field?:string;value?:ChangeValue}[];messaging?:Parameters<typeof handleInstagramEntry>[0]["messaging"]}[] }

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
  const location=typeof message.location?.latitude==="number"&&typeof message.location?.longitude==="number"
    ?{latitude:message.location.latitude,longitude:message.location.longitude,name:message.location.name,address:message.location.address}:undefined
  const mediaPart=["image","video","document","audio","sticker"].includes(message.type)?message[message.type] as {id?:string;caption?:string}|undefined:undefined
  const media=mediaPart?.id?{type:message.type,id:mediaPart.id,caption:mediaPart.caption}:undefined
  // Click-to-WhatsApp ad / post the customer tapped to start this chat.
  const referral=message.referral&&typeof message.referral==="object"?message.referral as {source_type?:string;source_id?:string;source_url?:string
    headline?:string;body?:string;media_type?:string;ctwa_clid?:string}:null
  const existed=await prisma.contact.findUnique({where:{organizationId_phone:{organizationId,phone:message.from}},select:{id:true}})
  const contact=await prisma.contact.upsert({
    where:{organizationId_phone:{organizationId,phone:message.from}},
    create:{organizationId,phone:message.from,name:profileName||null,source:referral?"CTWA_AD":"WHATSAPP_INBOUND",optedIn:false},
    update:profileName?{name:profileName}:{},
  })
  const conversation=await findOrCreateConversation({organizationId,phoneNumberId:phoneNumber.id,contactId:contact.id,
    reopen:true,at:timestamp(message.timestamp)})
  await prisma.message.create({data:{
    conversationId:conversation.id,externalMessageId:message.id,direction:"INBOUND",type:message.type.toUpperCase(),
    content:body||(location?`📍 ${[location.name,location.address].filter(Boolean).join(", ")||`${location.latitude}, ${location.longitude}`}`:mediaPart?.caption||null),status:"RECEIVED",metadata:message as Prisma.InputJsonValue,sentAt:timestamp(message.timestamp),
  }})
  await prisma.conversation.update({where:{id:conversation.id},data:{lastMessageAt:timestamp(message.timestamp),unreadCount:{increment:1}}})
  if(message.type!=="request_welcome")await markBroadcastReply(contact.id,timestamp(message.timestamp))
  if(message.type!=="request_welcome")notifyNewMessage(organizationId,conversation.id,contact.name||`+${contact.phone}`,body||(message.type==="order"?"🛒 New order":`[${message.type}]`))
    .catch(error=>console.error("[push]",error))
  if(referral)await prisma.adReferral.create({data:{organizationId,contactId:contact.id,conversationId:conversation.id,messageId:message.id,
    sourceType:(referral.source_type||"ad").slice(0,20),sourceId:referral.source_id?.slice(0,64)||null,sourceUrl:referral.source_url?.slice(0,500)||null,
    headline:referral.headline?.slice(0,200)||null,body:referral.body?.slice(0,1000)||null,mediaType:referral.media_type?.slice(0,20)||null,
    ctwaClid:referral.ctwa_clid?.slice(0,200)||null}}).catch(error=>console.error("[webhook] referral not saved",error))
  const contactInfo={id:contact.id,phone:contact.phone,name:contact.name}
  if(!existed)await emitEvent(organizationId,"contact.created",{contact:{...contactInfo,source:"WHATSAPP_INBOUND"}})
  if(message.type!=="request_welcome")await emitEvent(organizationId,"message.received",{message_id:message.id,conversation_id:conversation.id,
    phone_number:phoneNumber.phoneNumber,contact:contactInfo,type:message.type,text:body||mediaPart?.caption||null,
    media:mediaPart?.id?{id:mediaPart.id,mime_type:(mediaPart as {mime_type?:string}).mime_type||null}:null,location:location||null,
    reply_id:replyId||null,referral:message.referral||null,timestamp:timestamp(message.timestamp).toISOString()})

  const welcome=message.type==="request_welcome"
  const getAccessToken=async()=>{
    const accessToken=await getMetaAccessToken(organizationId)
    if(!accessToken)throw new Error("No connected Meta token is available to send the workflow reply.")
    return accessToken
  }
  // Cart sent from the WhatsApp catalog → order.
  let orderInfo:{id:string;total:number;currency:string;itemsText:string;count:number}|undefined
  if(message.type==="order"&&message.order&&typeof message.order==="object"){
    const token=await getMetaAccessToken(organizationId)
    const recorded=await recordWhatsAppOrder({organizationId,contactId:contact.id,conversationId:conversation.id,messageId:message.id,
      order:message.order as Parameters<typeof recordWhatsAppOrder>[0]["order"],customerName:contact.name,phone:contact.phone,token})
    await prisma.message.updateMany({where:{externalMessageId:message.id,direction:"INBOUND"},data:{content:recorded.summary}})
    orderInfo={id:recorded.order.orderNumber||recorded.order.id,total:Number(recorded.order.total),currency:recorded.order.currency,
      itemsText:itemsText(recorded.items,10),count:recorded.items.reduce((sum,item)=>sum+item.quantity,0)}
  }
  let handled=false
  // STOP / START (opt-out keywords) are answered before chatbots and the away message.
  if(body&&!replyId?.startsWith("cod_")){
    const consent=await handleConsentKeyword({organizationId,contactId:contact.id,conversationId:conversation.id,text:body,to:contact.phone,
      metaPhoneNumberId:phoneNumber.phoneNumberId,getAccessToken}).catch(error=>{console.error("[webhook] consent keyword failed",error);return null})
    if(consent)return
  }
  if(replyId?.startsWith("cod_")){
    const result=await handleCodReply(organizationId,replyId).catch(error=>{console.error("[webhook] COD reply failed",error);return null})
    if(result==="confirmed"||result==="cancelled"){
      const text=result==="confirmed"?"✅ Thank you! Your cash-on-delivery order is confirmed and will be shipped soon.":"Your order has been cancelled as requested. Reply here if you need anything."
      const accessToken=await getMetaAccessToken(organizationId)
      if(accessToken)await sendAndRecord({accessToken,metaPhoneNumberId:phoneNumber.phoneNumberId,to:contact.phone,conversationId:conversation.id},
        {type:"text",text:{preview_url:false,body:text}},text,{source:"COD_CONFIRMATION"}).catch(error=>console.error("[webhook] COD reply message failed",error))
      return
    }
  }
  if(body||replyId||location||media||welcome||orderInfo){
    try{
      handled=await handleInboundMessage({organizationId,metaPhoneNumberId:phoneNumber.phoneNumberId,conversationId:conversation.id,
        flowState:conversation.flowState,contact,text:body||mediaPart?.caption||"",replyId,location,media,welcome,getAccessToken,
        referral:referral?{sourceType:referral.source_type||"ad",sourceId:referral.source_id}:undefined,order:orderInfo})
    }catch(error){console.error("[webhook] flow failed",error)}
  }
  if(welcome||handled)return
  // No chatbot answered: route the chat to an agent and, outside business hours, send the away message.
  await autoAssignConversation(organizationId,conversation.id).catch(error=>console.error("[webhook] auto-assign failed",error))
  await sendAwayMessageIfClosed({organizationId,conversationId:conversation.id,to:contact.phone,metaPhoneNumberId:phoneNumber.phoneNumberId,
    getAccessToken,at:timestamp(message.timestamp)}).catch(error=>console.error("[webhook] away message failed",error))
}

export async function POST(request:NextRequest) {
  const rawBody=await request.text()
  if(!signatureIsValid(rawBody,request.headers.get("x-hub-signature-256")))
    return NextResponse.json({error:"Invalid webhook signature."},{status:401})

  let payload:WebhookBody
  try{payload=JSON.parse(rawBody) as WebhookBody}
  catch{return NextResponse.json({error:"Invalid JSON payload."},{status:400})}

  if(payload.object==="instagram"){
    for(const entry of payload.entry||[])await handleInstagramEntry(entry).catch(error=>console.error("[webhook] instagram",error))
    return NextResponse.json({received:true})
  }
  try{
    for(const entry of payload.entry||[]){
      for(const change of entry.changes||[]){
        // Template review results: entry.id is the WABA ID for these events.
        if(change.field==="message_template_status_update"||change.field==="template_category_update"){
          if(entry.id)await applyTemplateEvent(entry.id,change.field,(change.value||{}) as Parameters<typeof applyTemplateEvent>[2])
          continue
        }
        const value=change.value||{}
        const phoneNumberId=value.metadata?.phone_number_id
        const phoneNumber=phoneNumberId?await prisma.phoneNumber.findUnique({where:{phoneNumberId},include:{waba:true}}):null
        const organizationId=phoneNumber?.waba.organizationId||null

        for(const status of value.statuses||[]){
          await applyRecipientStatus(status)
          if(organizationId)await emitEvent(organizationId,"message.status",{message_id:status.id,status:status.status,
            recipient:(status as {recipient_id?:string}).recipient_id||null,timestamp:timestamp(status.timestamp).toISOString(),
            errors:status.errors?.map(error=>({code:error.code,title:error.title||error.message||null}))||null})
          const message=await prisma.message.findFirst({where:{externalMessageId:status.id},select:{id:true,status:true,metadata:true}})
          if(!message)continue
          const nextStatus=status.status.toUpperCase()
          if(message.status===nextStatus)continue
          await prisma.message.update({where:{id:message.id},data:{status:nextStatus,
            ...(status.status==="delivered"?{deliveredAt:timestamp(status.timestamp)}:{}),
            ...(status.status==="read"?{readAt:timestamp(status.timestamp)}:{})}})
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