import { prisma } from "@/lib/db/prisma"
import { activatePaidSubscription } from "@/lib/billing/activate"

export async function settlePaymentLink(transactionId:string,method:"RAZORPAY"|"CASHFREE",paidAmount:number){
  const payment=await prisma.payment.findFirst({where:{transactionId,method}})
  if(!payment)return {found:false,settled:false}
  if(Math.round(Number(payment.amount)*100)!==Math.round(paidAmount))
    throw new Error("Gateway payment amount does not match the stored payment.")
  if(payment.status==="APPROVED")return {found:true,settled:true}
  if(payment.status!=="PENDING")return {found:true,settled:false}

  await prisma.$transaction(async tx=>{
    const current=await tx.payment.findUnique({where:{id:payment.id}})
    if(!current||current.status!=="PENDING")return
    const now=new Date()
    await tx.payment.update({where:{id:current.id},data:{status:"APPROVED",verifiedAt:now}})
    await activatePaidSubscription(tx,current,now)
    await tx.notification.create({data:{organizationId:current.organizationId,type:"PAYMENT_APPROVED",
      title:"WhatsApp payment received",message:`Your payment of ₹${current.amount} was confirmed by ${method}.`}})
  })
  return {found:true,settled:true}
}