import crypto from "node:crypto"
import { NextRequest,NextResponse } from "next/server"
import { settlePaymentLink } from "@/lib/billing/settle-payment"

export const runtime="nodejs"

export async function POST(request:NextRequest){
  const raw=await request.text()
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET
  const signature=request.headers.get("x-razorpay-signature")
  if(!secret||!signature)return NextResponse.json({error:"Webhook not configured."},{status:503})
  const expected=Buffer.from(crypto.createHmac("sha256",secret).update(raw).digest("hex"))
  const received=Buffer.from(signature)
  if(expected.length!==received.length||!crypto.timingSafeEqual(expected,received))
    return NextResponse.json({error:"Invalid signature."},{status:401})
  try{
    const event=JSON.parse(raw) as {event?:string;payload?:{payment_link?:{entity?:{id?:string;amount_paid?:number;status?:string}}}}
    if(event.event!=="payment_link.paid")return NextResponse.json({received:true})
    const link=event.payload?.payment_link?.entity
    if(!link?.id||typeof link.amount_paid!=="number")return NextResponse.json({error:"Invalid payment-link event."},{status:400})
    const result=await settlePaymentLink(link.id,"RAZORPAY",link.amount_paid)
    return result.found?NextResponse.json({received:true,settled:result.settled}):NextResponse.json({error:"Payment link not found."},{status:404})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not process payment event."},{status:400})}
}