import { NextResponse } from "next/server"
import { emitEvent } from "@/lib/developer/webhooks"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"

type FormField={key:string;label:string;type:"TEXT"|"EMAIL"|"PHONE"|"LONG_TEXT"|"SELECT"|"WHATSAPP_CONSENT";required:boolean;options:string[]}

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params
  const form=await prisma.hostedForm.findFirst({where:{slug,status:"PUBLISHED"},select:{name:true,title:true,description:true,fields:true,organization:{select:{name:true}}}})
  if(!form)return NextResponse.json({error:"Form not found."},{status:404})
  return NextResponse.json({...form,fields:form.fields as FormField[]})
}

export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
  try{
    const {slug}=await params
    const form=await prisma.hostedForm.findFirst({where:{slug,status:"PUBLISHED"},include:{organization:{select:{id:true}}}})
    if(!form)return NextResponse.json({error:"Form not found."},{status:404})
    const fields=z.array(z.object({key:z.string(),label:z.string(),type:z.enum(["TEXT","EMAIL","PHONE","LONG_TEXT","SELECT","WHATSAPP_CONSENT"]),required:z.boolean(),options:z.array(z.string())})).parse(form.fields)
    const body=await request.json() as {values?:unknown}
    const values=body.values
    if(!values||typeof values!=="object"||Array.isArray(values))return NextResponse.json({error:"Invalid form response."},{status:400})
    const raw=values as Record<string,unknown>
    const sanitized:Record<string,string|boolean>={}
    for(const field of fields){
      const value=raw[field.key]
      if(field.type==="WHATSAPP_CONSENT"){
        sanitized[field.key]=value===true
        continue
      }
      const text=typeof value==="string"?value.trim():""
      if(field.required&&!text)return NextResponse.json({error:`${field.label} is required.`},{status:400})
      if(field.type==="EMAIL"&&text&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))return NextResponse.json({error:`Enter a valid ${field.label.toLowerCase()}.`},{status:400})
      if(field.type==="PHONE"&&text&&!/^\+?[0-9 ()-]{7,20}$/.test(text))return NextResponse.json({error:"Enter a valid phone number."},{status:400})
      if(field.type==="SELECT"&&text&&!field.options.includes(text))return NextResponse.json({error:`Choose a valid ${field.label.toLowerCase()}.`},{status:400})
      sanitized[field.key]=text.slice(0,2000)
    }

    const consentField=fields.find(field=>field.type==="WHATSAPP_CONSENT")
    const whatsappConsent=consentField?sanitized[consentField.key]===true:false
    const phoneField=fields.find(field=>field.type==="PHONE")
    const emailField=fields.find(field=>field.type==="EMAIL")
    const nameField=fields.find(field=>/name/i.test(field.key)||/name/i.test(field.label))
    let contactId:string|undefined
    const phone=phoneField?String(sanitized[phoneField.key]||""):""
    if(phone){
      const contact=await prisma.contact.upsert({
        where:{organizationId_phone:{organizationId:form.organizationId,phone}},
        create:{organizationId:form.organizationId,phone,name:nameField?String(sanitized[nameField.key]||"")||null:null,
          email:emailField?String(sanitized[emailField.key]||"")||null:null,source:"HOSTED_FORM",optedIn:whatsappConsent,
          metadata:{formId:form.id,consentCaptured:whatsappConsent,consentCapturedAt:whatsappConsent?new Date().toISOString():null}},
        update:{...(whatsappConsent?{optedIn:true}:{}),source:"HOSTED_FORM"},
      })
      contactId=contact.id
    }
    const submission=await prisma.formSubmission.create({data:{formId:form.id,contactId,values:sanitized as Prisma.InputJsonValue,whatsappConsent}})
    await emitEvent(form.organizationId,"form.submitted",{form_id:form.id,form_name:form.name,submission_id:submission.id,contact_id:contactId||null,
      whatsapp_consent:whatsappConsent,values:sanitized})
    return NextResponse.json({ok:true,submissionId:submission.id,message:"Thanks. Your response has been submitted."},{status:201})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not submit form."},{status:400})}
}