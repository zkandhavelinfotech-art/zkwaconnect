import { prisma } from "@/lib/db/prisma"

// One conversation thread per contact and business number. Inbound messages reopen resolved
// threads; outbound sends (campaigns, payments) reuse the thread without changing its status.
export async function findOrCreateConversation(input:{
  organizationId:string
  phoneNumberId:string
  contactId:string
  reopen:boolean
  at?:Date
}) {
  const existing = await prisma.conversation.findFirst({
    where:{organizationId:input.organizationId,phoneNumberId:input.phoneNumberId,contactId:input.contactId},
    orderBy:{updatedAt:"desc"},
  })
  if(existing){
    if(input.reopen&&existing.status==="RESOLVED")
      return prisma.conversation.update({where:{id:existing.id},data:{status:"OPEN"}})
    return existing
  }
  return prisma.conversation.create({data:{organizationId:input.organizationId,phoneNumberId:input.phoneNumberId,
    contactId:input.contactId,status:"OPEN",lastMessageAt:input.at}})
}
