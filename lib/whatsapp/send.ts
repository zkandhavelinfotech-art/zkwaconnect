import { Prisma } from "@/generated/prisma/client"
import { assertCanSend } from "@/lib/billing/limits"
import { chargeTemplateMessage, refundCharge, serviceWindowOpen } from "@/lib/billing/messaging"
import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"

export type OutboundPayload =
  | { type:"text"; text:{ preview_url:boolean; body:string } }
  | { type:"interactive"; interactive:Record<string,unknown> }
  | { type:"template"; template:Record<string,unknown> }
  | { type:"image"|"video"|"document"|"audio"; [key:string]:unknown }

type SendTarget = {
  accessToken:string
  metaPhoneNumberId:string
  to:string
  conversationId:string
  senderUserId?:string
}

// Sends a WhatsApp message and records it in the conversation.
export async function sendAndRecord(target:SendTarget,payload:OutboundPayload,summary:string,metadata:Prisma.InputJsonValue,extra:{mediaUrl?:string} = {}) {
  // Every outgoing message needs an active plan within its monthly limit.
  const conversation = await prisma.conversation.findUniqueOrThrow({where:{id:target.conversationId},select:{organizationId:true}})
  await assertCanSend(conversation.organizationId)
  // Template messages are charged to the workspace wallet (if its billing option uses one) before sending.
  let charge:string|null = null
  if(payload.type==="template"){
    const meta = metadata&&typeof metadata==="object"&&!Array.isArray(metadata)?metadata as Record<string,unknown>:{}
    const template = typeof meta.templateId==="string"?await prisma.template.findUnique({where:{id:meta.templateId},select:{category:true,name:true}}):null
    charge = await chargeTemplateMessage({organizationId:conversation.organizationId,category:template?.category||null,
      inServiceWindow:await serviceWindowOpen(target.conversationId),conversationId:target.conversationId,reason:`Template “${template?.name||"message"}”`})
  }
  let result:{messages?:{id:string}[]}
  try{
    result = await metaGraph<{messages?:{id:string}[]}>(`${target.metaPhoneNumberId}/messages`,target.accessToken,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:target.to,...payload}),
    })
  }catch(error){
    await refundCharge(charge)
    throw error
  }
  await prisma.message.create({data:{
    conversationId:target.conversationId,externalMessageId:result.messages?.[0]?.id,direction:"OUTBOUND",senderUserId:target.senderUserId,
    type:payload.type.toUpperCase(),content:summary,status:"SENT",sentAt:new Date(),metadata,mediaUrl:extra.mediaUrl,
  }})
  await prisma.conversation.update({where:{id:target.conversationId},data:{lastMessageAt:new Date()}})
  return result.messages?.[0]?.id
}
