import crypto from "node:crypto"
import { NextRequest,NextResponse } from "next/server"
import { settlePaymentLink } from "@/lib/billing/settle-payment"

export const runtime="nodejs"

export async function POST(request:NextRequest){
  const raw=await request.text()
  const secret=process.env.CASHFREE_WEBHOOK_SECRET
  const signature=request.headers.get("x-webhook-signature")
  const timestamp=request.headers.get("x-webhook-timestamp")
  if(!secret||!signature||!timestamp)return NextResponse.json({error:"Webhook not configured."},{status:503})
  const expected=crypto.createHmac("sha256",secret).update(timestamp+raw).digest("base64")
  const expectedBuffer=Buffer.from(expected)
  const receivedBuffer=Buffer.from(signature)
  if(expectedBuffer.length!==receivedBuffer.length||!crypto.timingSafeEqual(expectedBuffer,receivedBuffer))
    return NextResponse.json({error:"Invalid signature."},{status:401})
  try{
    const event=JSON.parse(raw) as {type?:string;data?:{link_id?:string;link_status?:string;link_amount_paid?:number;payment?:{payment_amount?:number}}}
    const data=event.data
    if(!data?.link_id||data.link_status?.toUpperCase()!=="PAID")return NextResponse.json({received:true})
    const amount=Number(data.link_amount_paid??data.payment?.payment_amount)
    if(!Number.isFinite(amount))return NextResponse.json({error:"Invalid paid amount."},{status:400})
    const result=await settlePaymentLink(data.link_id,"CASHFREE",Math.round(amount*100))
    return result.found?NextResponse.json({received:true,settled:result.settled}):NextResponse.json({error:"Payment link not found."},{status:404})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not process Cashfree payment event."},{status:400})}
}