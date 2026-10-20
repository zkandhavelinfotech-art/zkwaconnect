import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { validateFlow, type FlowGraph } from "@/lib/flows/types"

async function getOrganizationId() {
  const session = await getSession()
  return session?.user.memberships.find(item => item.status === "ACTIVE")?.organizationId || null
}

export async function GET() {
  try {
    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({error:"Unauthorized"},{status:401})
    const [workflows,phoneNumbers] = await Promise.all([
      prisma.workflow.findMany({where:{organizationId},orderBy:[{priority:"asc"},{createdAt:"desc"}]}),
      prisma.phoneNumber.findMany({where:{waba:{organizationId},status:"CONNECTED"},
        select:{id:true,phoneNumber:true,displayName:true}}),
    ])
    return NextResponse.json({workflows,phoneNumbers})
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Could not load workflows."},{status:500})
  }
}

const flowSchema = z.object({
  nodes:z.array(z.object({
    id:z.string().min(1).max(40),
    type:z.enum(["start","message","buttons","list","media","template","question","askLocation","askMedia","condition","setAttribute","tag","apiRequest","connectFlow","handoff","end"]),
    x:z.number().finite(),
    y:z.number().finite(),
    data:z.record(z.unknown()),
  })).min(1).max(120),
  edges:z.array(z.object({id:z.string().min(1).max(40),from:z.string(),handle:z.string().max(60),to:z.string()})).max(400),
})

// Keeps the indexed trigger columns in sync with the flow's Start node.
function triggerColumns(flow:FlowGraph) {
  const start = flow.nodes.find(node=>node.type==="start")
  const type = start?.data.triggerType||"KEYWORD"
  const anyMessage = type!=="KEYWORD"
  return {triggerType:type,
    triggerValue:anyMessage?"":(start?.data.keywords||[]).map(keyword=>keyword.trim()).filter(Boolean).join(", ").slice(0,500)}
}

function parseFlow(value:unknown) {
  const flow = flowSchema.parse(value) as unknown as FlowGraph
  const errors = validateFlow(flow)
  if (errors.length) throw new Error(errors.join(" "))
  return flow
}

const createSchema = z.object({
  name:z.string().trim().min(2).max(80),
  triggerType:z.enum(["KEYWORD","ANY_MESSAGE"]).default("KEYWORD"),
  triggerValue:z.string().trim().max(100).default(""),
  replyText:z.string().trim().max(1000).default(""),
  handoffToHuman:z.boolean().default(false),
  priority:z.number().int().min(1).max(1000).default(100),
  flow:z.unknown().optional(),
})

export async function POST(request:Request) {
  try {
    const organizationId=await getOrganizationId()
    if(!organizationId)return NextResponse.json({error:"Unauthorized"},{status:401})
    const {flow:rawFlow,...input}=createSchema.parse(await request.json())
    if(rawFlow!==undefined){
      const flow=parseFlow(rawFlow)
      const workflow=await prisma.workflow.create({data:{organizationId,name:input.name,priority:input.priority,status:"PAUSED",
        replyText:"",flow:flow as unknown as Prisma.InputJsonValue,...triggerColumns(flow)}})
      return NextResponse.json({workflow,message:"Flow saved paused. Enable it when ready."},{status:201})
    }
    if(input.triggerType==="KEYWORD"&&input.triggerValue.length<2)
      return NextResponse.json({error:"Keyword triggers need at least 2 characters."},{status:400})
    if(!input.replyText)return NextResponse.json({error:"Add a reply message."},{status:400})
    const workflow=await prisma.workflow.create({data:{...input,organizationId,status:"PAUSED"}})
    return NextResponse.json({workflow,message:"Rule saved paused. Enable it when ready."},{status:201})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not save workflow."},{status:400})
  }
}

const putSchema=z.object({id:z.string().min(1),name:z.string().trim().min(2).max(80),flow:z.unknown()})

export async function PUT(request:Request) {
  try {
    const organizationId=await getOrganizationId()
    if(!organizationId)return NextResponse.json({error:"Unauthorized"},{status:401})
    const input=putSchema.parse(await request.json())
    const existing=await prisma.workflow.findFirst({where:{id:input.id,organizationId}})
    if(!existing)return NextResponse.json({error:"Workflow not found."},{status:404})
    const flow=parseFlow(input.flow)
    const workflow=await prisma.workflow.update({where:{id:existing.id},data:{name:input.name,
      flow:flow as unknown as Prisma.InputJsonValue,...triggerColumns(flow)}})
    return NextResponse.json({workflow,message:"Flow saved."})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not save flow."},{status:400})
  }
}

const updateSchema=z.object({id:z.string().min(1),action:z.enum(["enable","pause","delete","duplicate"])})

export async function PATCH(request:Request) {
  try {
    const organizationId=await getOrganizationId()
    if(!organizationId)return NextResponse.json({error:"Unauthorized"},{status:401})
    const {id,action}=updateSchema.parse(await request.json())
    const workflow=await prisma.workflow.findFirst({where:{id,organizationId}})
    if(!workflow)return NextResponse.json({error:"Workflow not found."},{status:404})
    if(action==="delete"){
      await prisma.workflow.delete({where:{id:workflow.id}})
      return NextResponse.json({ok:true})
    }
    if(action==="duplicate"){
      const {id:_id,createdAt:_created,updatedAt:_updated,flow,...rest}=workflow
      const copy=await prisma.workflow.create({data:{...rest,name:`${workflow.name} (copy)`.slice(0,80),status:"PAUSED",
        flow:flow===null?Prisma.JsonNull:flow as Prisma.InputJsonValue}})
      return NextResponse.json({workflow:copy})
    }
    if(action==="enable"&&workflow.flow){
      const errors=validateFlow(workflow.flow as unknown as FlowGraph)
      if(errors.length)return NextResponse.json({error:`Fix the flow before enabling: ${errors.join(" ")}`},{status:400})
    }
    const updated=await prisma.workflow.update({where:{id:workflow.id},data:{status:action==="enable"?"ACTIVE":"PAUSED"}})
    return NextResponse.json({workflow:updated})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Could not update workflow."},{status:400})
  }
}
