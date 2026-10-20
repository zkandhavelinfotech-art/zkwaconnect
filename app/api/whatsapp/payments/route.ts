import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"

export const runtime="nodejs"

const schema=z.object({
  contactId:z.string().min(1),
  amount:z.number().positive().max(1_000_000),
  description:z.string().trim().min(3).max(180),
  method:z.enum(["UPI","RAZORPAY","CASHFREE"]),
})

export async function GET(){
  try{
    const session=await getSession()
    const membership=session?.user.memberships.find(item=>item.status==="ACTIVE")
    if(!membership)return NextResponse.json({error:"Unauthorized"},{status:401})
    const [contacts,payments]=await Promise.all([
      // Payment requests are replies in the chat, so marketing opt-in isn't required.
      prisma.contact.findMany({where:{organizationId:membership.organizationId,NOT:{phone:{startsWith:"ig:"}}},
        select:{id:true,name:true,phone:true,email:true},orderBy:{updatedAt:"desc"},take:500}),
      prisma.payment.findMany({where:{organizationId:membership.organizationId,contactId:{not:null}},
        include:{contact:{select:{name:true,phone:true}}},orderBy:{createdAt:"desc"},take:50}),
    ])
    return NextResponse.json({contacts,payments,providers:{
      UPI:Boolean(process.env.UPI_ID),RAZORPAY:Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET),
      CASHFREE:Boolean(process.env.CASHFREE_CLIENT_ID&&process.env.CASHFREE_CLIENT_SECRET),
    }})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not load payment requests."},{status:500})}
}

async function createRazorpayLink(input:{id:string;amount:number;description:string;contact:{name:string|null;phone:string;email:string|null}}){
  const keyId=process.env.RAZORPAY_KEY_ID
  const keySecret=process.env.RAZORPAY_KEY_SECRET
  if(!keyId||!keySecret)throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")
  const response=await fetch("https://api.razorpay.com/v1/payment_links",{
    method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,"Content-Type":"application/json"},
    body:JSON.stringify({amount:Math.round(input.amount*100),currency:"INR",accept_partial:false,reference_id:input.id,
      description:input.description,customer:{name:input.contact.name||undefined,contact:input.contact.phone,email:input.contact.email||undefined},
      notify:{sms:false,email:false},reminder_enable:false,notes:{zkwaconnect_payment_id:input.id}}),
    signal:AbortSignal.timeout(15000),
  })
  const body=await response.json() as {id?:string;short_url?:string;error?:{description?:string}}
  if(!response.ok||!body.id||!body.short_url)throw new Error(body.error?.description||"Razorpay could not create a payment link.")
  return {transactionId:body.id,url:body.short_url}
}

async function createCashfreeLink(input:{id:string;amount:number;description:string;contact:{name:string|null;phone:string;email:string|null}}){
  const clientId=process.env.CASHFREE_CLIENT_ID
  const clientSecret=process.env.CASHFREE_CLIENT_SECRET
  if(!clientId||!clientSecret)throw new Error("Cashfree is not configured. Add CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.")
  const base=process.env.CASHFREE_ENV==="production"?"https://api.cashfree.com":"https://sandbox.cashfree.com"
  const response=await fetch(`${base}/pg/links`,{
    method:"POST",headers:{"Content-Type":"application/json","x-api-version":"2023-08-01","x-client-id":clientId,
      "x-client-secret":clientSecret,"x-request-id":input.id},
    body:JSON.stringify({link_id:input.id,link_amount:input.amount,link_currency:"INR",link_purpose:input.description,
      customer_details:{customer_name:input.contact.name||"Customer",customer_phone:input.contact.phone.replace(/\D/g,"").slice(-10),
        customer_email:input.contact.email||undefined},link_notify:{send_sms:false,send_email:false},link_notes:{zkwaconnect_payment_id:input.id}}),
    signal:AbortSignal.timeout(15000),
  })
  const body=await response.json() as {link_id?:string;link_url?:string;cf_link_id?:string;message?:string}
  if(!response.ok||!body.link_url)throw new Error(body.message||"Cashfree could not create a payment link.")
  return {transactionId:body.link_id||body.cf_link_id||input.id,url:body.link_url}
}

export async function POST(request:Request){
  try{
    const session=await getSession()
    const membership=session?.user.memberships.find(item=>item.status==="ACTIVE")
    if(!membership)return NextResponse.json({error:"Unauthorized"},{status:401})
    const input=schema.parse(await request.json())
    const contact=await prisma.contact.findFirst({where:{id:input.contactId,organizationId:membership.organizationId}})
    if(!contact)return NextResponse.json({error:"Contact not found."},{status:404})
    if(!contact.optedIn)return NextResponse.json({error:"This contact has not opted in to WhatsApp messages."},{status:403})
    const phoneNumber=await prisma.phoneNumber.findFirst({where:{waba:{organizationId:membership.organizationId},status:"CONNECTED"},orderBy:{createdAt:"asc"}})
    if(!phoneNumber)return NextResponse.json({error:"Connect a WhatsApp phone number first."},{status:409})
    const accessToken=await getMetaAccessToken(membership.organizationId)
    if(!accessToken)return NextResponse.json({error:"Connect Meta before sending payment links."},{status:409})
    if(input.method==="RAZORPAY"&&(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET))
      return NextResponse.json({error:"Razorpay is not configured."},{status:503})
    if(input.method==="CASHFREE"&&(!process.env.CASHFREE_CLIENT_ID||!process.env.CASHFREE_CLIENT_SECRET))
      return NextResponse.json({error:"Cashfree is not configured."},{status:503})
    if(input.method==="UPI"&&!process.env.UPI_ID)return NextResponse.json({error:"UPI_ID is not configured."},{status:503})

    const payment=await prisma.payment.create({data:{organizationId:membership.organizationId,contactId:contact.id,amount:input.amount,description:input.description,
      method:input.method,status:"PENDING",upiId:input.method==="UPI"?process.env.UPI_ID:undefined}})
    let linkUrl=""
    let transactionId:string|undefined
    try{
      if(input.method==="RAZORPAY"){
        const link=await createRazorpayLink({id:payment.id,amount:input.amount,description:input.description,contact})
        linkUrl=link.url;transactionId=link.transactionId
      }else if(input.method==="CASHFREE"){
        const link=await createCashfreeLink({id:payment.id,amount:input.amount,description:input.description,contact})
        linkUrl=link.url;transactionId=link.transactionId
      }else{
        const params=new URLSearchParams({pa:process.env.UPI_ID!,pn:process.env.COMPANY_NAME||"ZKWAConnect",
          am:input.amount.toFixed(2),cu:"INR",tn:input.description.slice(0,80)})
        linkUrl=`upi://pay?${params.toString()}`
      }
      await prisma.payment.update({where:{id:payment.id},data:{transactionId,paymentLinkUrl:linkUrl,proofUrl:linkUrl}})
    }catch(error){
      await prisma.payment.update({where:{id:payment.id},data:{status:"FAILED",rejectionReason:error instanceof Error?error.message:"Link creation failed."}})
      throw error
    }

    const message=`${input.description}\nAmount: ₹${input.amount.toFixed(2)}\nPay securely: ${linkUrl}`
    let whatsappSent=true
    try{
      await metaGraph(`${phoneNumber.phoneNumberId}/messages`,accessToken,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({messaging_product:"whatsapp",to:contact.phone,type:"text",text:{preview_url:true,body:message}})})
    }catch{whatsappSent=false}
    return NextResponse.json({ok:true,paymentId:payment.id,linkUrl,whatsappSent,
      message:whatsappSent?"Payment link sent to the opted-in WhatsApp contact.":"Payment link created; WhatsApp delivery failed. Copy the link and share it manually."},{status:201})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not create WhatsApp payment link."},{status:400})
  }
}