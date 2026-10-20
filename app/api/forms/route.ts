import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { metaGraph } from "@/lib/meta/graph"

export const runtime = "nodejs"

async function getOrganization() {
  const session=await getSession()
  const membership=session?.user.memberships.find(item=>item.status==="ACTIVE")
  if(!membership)return null
  return prisma.organization.findUnique({where:{id:membership.organizationId},select:{id:true,slug:true,name:true}})
}

const fieldSchema=z.object({
  key:z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  label:z.string().trim().min(1).max(80),
  type:z.enum(["TEXT","EMAIL","PHONE","LONG_TEXT","SELECT","WHATSAPP_CONSENT"]),
  required:z.boolean().default(false),
  options:z.array(z.string().trim().min(1).max(80)).max(20).default([]),
})
const createSchema=z.object({
  name:z.string().trim().min(2).max(80),
  title:z.string().trim().min(2).max(100),
  description:z.string().trim().max(300).default(""),
  wabaId:z.string().optional(),
  fields:z.array(fieldSchema).min(1).max(12),
})

export async function GET(){
  try{
    const organization=await getOrganization()
    if(!organization)return NextResponse.json({error:"Unauthorized"},{status:401})
    const [forms,wabas]=await Promise.all([
      prisma.hostedForm.findMany({where:{organizationId:organization.id},include:{waba:{select:{name:true}},_count:{select:{submissions:true}},
        submissions:{orderBy:{submittedAt:"desc"},take:10,select:{id:true,values:true,whatsappConsent:true,submittedAt:true}}},orderBy:{updatedAt:"desc"}}),
      prisma.waba.findMany({where:{organizationId:organization.id,status:"CONNECTED"},select:{id:true,name:true,wabaId:true}}),
    ])
    return NextResponse.json({forms,wabas})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not load forms."},{status:500})}
}

export async function POST(request:Request){
  try{
    const organization=await getOrganization()
    if(!organization)return NextResponse.json({error:"Unauthorized"},{status:401})
    const input=createSchema.parse(await request.json())
    const keys=new Set<string>()
    for(const field of input.fields){
      if(keys.has(field.key))return NextResponse.json({error:"Form field keys must be unique."},{status:400})
      keys.add(field.key)
      if(field.type==="SELECT"&&field.options.length===0)return NextResponse.json({error:`Add options for ${field.label}.`},{status:400})
    }
    const waba=input.wabaId?await prisma.waba.findFirst({where:{id:input.wabaId,organizationId:organization.id,status:"CONNECTED"}}):null
    if(input.wabaId&&!waba)return NextResponse.json({error:"Selected WhatsApp account is not connected to this workspace."},{status:400})
    const nameSlug=input.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30)||"form"
    const slug=`${organization.slug}-${nameSlug}-${crypto.randomBytes(3).toString("hex")}`
    const form=await prisma.hostedForm.create({data:{
      organizationId:organization.id,wabaId:waba?.id,slug,name:input.name,title:input.title,
      description:input.description,fields:input.fields as Prisma.InputJsonValue,status:"PUBLISHED",
    }})
    return NextResponse.json({form,publicUrl:`/forms/${form.slug}`},{status:201})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not create form."},{status:400})}
}

const flowActionSchema=z.object({action:z.enum(["create_meta_flow","publish_meta_flow"]),formId:z.string().min(1)})

export async function PATCH(request:Request){
  try{
    const organization=await getOrganization()
    if(!organization)return NextResponse.json({error:"Unauthorized"},{status:401})
    const {action,formId}=flowActionSchema.parse(await request.json())
    const form=await prisma.hostedForm.findFirst({where:{id:formId,organizationId:organization.id},include:{waba:true}})
    if(!form)return NextResponse.json({error:"Form not found."},{status:404})
    if(!form.waba)return NextResponse.json({error:"Connect this form to a WABA before creating a native Flow."},{status:400})
    const accessToken=await getMetaAccessToken(organization.id)
    if(!accessToken)return NextResponse.json({error:"Connect your Meta account first."},{status:409})

    if(action==="create_meta_flow"){
      if(form.metaFlowId)return NextResponse.json({error:"A Meta Flow is already linked to this form."},{status:409})
      const fields=z.array(fieldSchema).parse(form.fields)
      const formChildren:Record<string,unknown>[]=[
        {type:"TextHeading",text:form.title},
        ...(form.description?[{type:"TextBody",text:form.description}]:[]),
      ]
      for(const field of fields){
        if(field.type==="WHATSAPP_CONSENT")continue
        if(field.type==="SELECT")formChildren.push({type:"Dropdown",name:field.key,label:field.label,required:field.required,
          "data-source":field.options.map((option,index)=>({id:`option_${index+1}`,title:option}))})
        else formChildren.push({type:field.type==="LONG_TEXT"?"TextArea":"TextInput",name:field.key,label:field.label,
          required:field.required,"input-type":field.type==="EMAIL"?"email":field.type==="PHONE"?"phone":"text"})
      }
      const payload=Object.fromEntries(fields.filter(field=>field.type!=="WHATSAPP_CONSENT").map(field=>[field.key,`4{form.${field.key}}`]))
      const nativePayload=Object.fromEntries(fields.filter(field=>field.type!=="WHATSAPP_CONSENT")
        .map(field=>[field.key,String.fromCharCode(36)+"{form."+field.key+"}"]))
      formChildren.push({type:"Footer",label:"Submit","on-click-action":{name:"complete",payload:nativePayload}})
      const flowJson={version:"7.1",data_api_version:"3.0",routing_model:{FORM:[]},screens:[{
        id:"FORM",title:form.title,terminal:true,layout:{type:"SingleColumnLayout",children:[{type:"Form",name:"form",children:formChildren}]},
      }]}
      const created=await metaGraph<{id:string}>(`${form.waba.wabaId}/flows`,accessToken,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:form.name,categories:["OTHER"],flow_json:JSON.stringify(flowJson)}),
      })
      const updated=await prisma.hostedForm.update({where:{id:form.id},data:{metaFlowId:created.id,status:"META_DRAFT"}})
      return NextResponse.json({form:updated,metaFlowId:created.id,message:"Native Flow draft created in Meta. Publish it after reviewing in WhatsApp Manager."})
    }

    if(!form.metaFlowId)return NextResponse.json({error:"Create the Meta Flow before publishing."},{status:400})
    await metaGraph(`${form.metaFlowId}/publish`,accessToken,{method:"POST"})
    const updated=await prisma.hostedForm.update({where:{id:form.id},data:{status:"PUBLISHED"}})
    return NextResponse.json({form:updated,message:"Native Meta Flow published."})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Meta Flow operation failed."},{status:400})}
}