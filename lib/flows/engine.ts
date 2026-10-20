import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { sendAndRecord, type OutboundPayload } from "@/lib/whatsapp/send"
import { MAX_DELAY_MINUTES, type FlowGraph, type FlowNode } from "@/lib/flows/types"
import { readPath, safeFetch } from "@/lib/flows/safe-fetch"
import { buildTemplateMessage } from "@/lib/whatsapp/template-media"
import { autoAssignConversation } from "@/lib/inbox/automation"

const MAX_STEPS = 25
const STATE_TTL_MS = 24*60*60*1000
const MAX_RETRIES = 2
const MAX_FLOW_HOPS = 3

// resumeAt: set while a Delay step is waiting; the background worker continues the flow then.
type FlowState = { workflowId:string; nodeId:string; expiresAt:string; retries:number; resumeAt?:string }
type ContactRow = { id:string; phone:string; name:string|null; email:string|null; tags:Prisma.JsonValue; metadata:Prisma.JsonValue }
type WorkflowRow = { id:string; name:string; triggerType:string; triggerValue:string; replyText:string; handoffToHuman:boolean; flow:Prisma.JsonValue }

export type InboundContext = {
  organizationId:string
  metaPhoneNumberId:string
  conversationId:string
  flowState:Prisma.JsonValue
  contact:ContactRow
  text:string
  replyId?:string
  location?:{ latitude:number; longitude:number; name?:string; address?:string }
  welcome?:boolean
  referral?:{ sourceType:string; sourceId?:string }
  order?:{ id:string; total:number; currency:string; itemsText:string; count:number }
  media?:{ type:string; id:string; caption?:string }
  getAccessToken:()=>Promise<string>
}

function record(value:unknown):Record<string,unknown> {
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}
}

function parseFlow(value:Prisma.JsonValue):FlowGraph|null {
  const flow = record(value)
  return Array.isArray(flow.nodes)&&Array.isArray(flow.edges)?flow as unknown as FlowGraph:null
}

function parseState(value:Prisma.JsonValue):FlowState|null {
  const state = record(value)
  if(typeof state.workflowId!=="string"||typeof state.nodeId!=="string"||typeof state.expiresAt!=="string")return null
  if(Date.parse(state.expiresAt)<Date.now())return null
  return {workflowId:state.workflowId,nodeId:state.nodeId,expiresAt:state.expiresAt,retries:Number(state.retries)||0,
    ...(typeof state.resumeAt==="string"?{resumeAt:state.resumeAt}:{})}
}

function normalize(text:string) {
  return text.trim().toLocaleLowerCase()
}

function triggerMatches(workflow:WorkflowRow,normalized:string) {
  if(!normalized)return false
  const flow = parseFlow(workflow.flow)
  if(flow){
    const start = flow.nodes.find(node=>node.type==="start")
    if(!start||start.data.triggerType==="WELCOME"||start.data.triggerType==="AD"||start.data.triggerType==="ORDER")return false
    if(start.data.triggerType==="ANY_MESSAGE")return true
    const keywords = (start.data.keywords||[]).map(normalize).filter(keyword=>keyword.length>=2)
    return start.data.match==="CONTAINS"
      ?keywords.some(keyword=>normalized.includes(keyword))
      :keywords.includes(normalized)
  }
  return workflow.triggerType==="ANY_MESSAGE"||
    (workflow.triggerType==="KEYWORD"&&normalized.includes(normalize(workflow.triggerValue)))
}

function isCatchAll(workflow:WorkflowRow) {
  const flow = parseFlow(workflow.flow)
  return flow?flow.nodes.find(node=>node.type==="start")?.data.triggerType==="ANY_MESSAGE":workflow.triggerType==="ANY_MESSAGE"
}

class FlowRun {
  private attributes:Record<string,string>
  private tags:string[]
  private accessToken:string|null = null

  constructor(private ctx:InboundContext) {
    const attributes = record(record(ctx.contact.metadata).attributes)
    this.attributes = Object.fromEntries(Object.entries(attributes).map(([key,value])=>[key,String(value)]))
    this.tags = Array.isArray(ctx.contact.tags)?ctx.contact.tags.filter((tag):tag is string=>typeof tag==="string"):[]
  }

  personalize(text:string,encode:(value:string)=>string = value=>value) {
    return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi,(_,key:string)=>{
      const name = key.toLowerCase()
      if(name==="name")return encode(this.ctx.contact.name||"there")
      if(name==="phone")return encode(this.ctx.contact.phone)
      return encode(this.attributes[name]??"")
    })
  }

  async send(payload:OutboundPayload,summary:string,metadata:Record<string,unknown>) {
    this.accessToken ??= await this.ctx.getAccessToken()
    await sendAndRecord({accessToken:this.accessToken,metaPhoneNumberId:this.ctx.metaPhoneNumberId,
      to:this.ctx.contact.phone,conversationId:this.ctx.conversationId},payload,summary,metadata as Prisma.InputJsonValue)
  }

  setOrder(order:NonNullable<InboundContext["order"]>) {
    Object.assign(this.attributes,{order_id:order.id,order_total:String(order.total),order_currency:order.currency,order_items:order.itemsText,order_count:String(order.count)})
  }

  async sendProducts(workflow:WorkflowRow,node:FlowNode) {
    this.accessToken ??= await this.ctx.getAccessToken()
    const { catalogMessage, productMessage } = await import("@/lib/commerce/catalog")
    const phone = await prisma.phoneNumber.findUnique({where:{phoneNumberId:this.ctx.metaPhoneNumberId},include:{waba:true}})
    const { connectedCatalog } = await import("@/lib/commerce/catalog")
    const catalog = phone?await connectedCatalog(phone.waba.wabaId,this.accessToken).catch(()=>null):null
    if(!catalog)return
    const ids = (node.data.productIds||[]).map(id=>id.trim()).filter(Boolean)
    const body = this.personalize(node.data.text||"")
    const payload = ids.length?productMessage(catalog.id,ids,{header:this.personalize(node.data.header||""),body}):catalogMessage(body||"Browse our catalog 🛍️")
    await this.send(payload,`🛍️ ${ids.length?`${ids.length} product(s)`:"Catalog"}${body?`: ${body}`:""}`,{workflowId:workflow.id,flowNodeId:node.id})
  }

  async setState(state:FlowState|null) {
    await prisma.conversation.update({where:{id:this.ctx.conversationId},
      data:{flowState:state?state as unknown as Prisma.InputJsonValue:Prisma.JsonNull}})
  }

  async saveContact(extra:Prisma.ContactUpdateInput = {}) {
    const metadata = record(this.ctx.contact.metadata)
    await prisma.contact.update({where:{id:this.ctx.contact.id},data:{
      tags:this.tags,metadata:{...metadata,attributes:this.attributes} as Prisma.InputJsonValue,...extra}})
  }

  async runLegacyRule(workflow:WorkflowRow) {
    const reply = this.personalize(workflow.replyText)
    await this.send({type:"text",text:{preview_url:false,body:reply}},reply,{workflowId:workflow.id,handoffToHuman:workflow.handoffToHuman})
    if(workflow.handoffToHuman)await this.notifyHandoff(workflow,`matched workflow “${workflow.name}”.`)
  }

  async notifyHandoff(workflow:WorkflowRow,reason:string) {
    await prisma.notification.create({data:{organizationId:this.ctx.organizationId,type:"WORKFLOW_HANDOFF",
      title:"Conversation needs a human reply",message:`${this.ctx.contact.name||this.ctx.contact.phone} ${reason}`,
      metadata:{conversationId:this.ctx.conversationId,workflowId:workflow.id}}})
    await autoAssignConversation(this.ctx.organizationId,this.ctx.conversationId).catch(()=>null)
  }

  async sendNode(workflow:WorkflowRow,node:FlowNode) {
    const meta = {workflowId:workflow.id,flowNodeId:node.id}
    const body = this.personalize(node.data.text||"")
    if(node.type==="message"||node.type==="question"||node.type==="askMedia")
      return this.send({type:"text",text:{preview_url:true,body}},body,meta)
    if(node.type==="askLocation")
      return this.send({type:"interactive",interactive:{type:"location_request_message",body:{text:body},action:{name:"send_location"}}},
        `${body}\n[📍 Send location]`,meta)
    if(node.type==="buttons"){
      const options = node.data.options||[]
      return this.send({type:"interactive",interactive:{type:"button",
        ...(node.data.header?{header:{type:"text",text:this.personalize(node.data.header)}}:{}),
        body:{text:body},...(node.data.footer?{footer:{text:node.data.footer}}:{}),
        action:{buttons:options.map(option=>({type:"reply",reply:{id:`${node.id}:${option.id}`,title:option.title}}))},
      }},`${body}\n${options.map(option=>`[${option.title}]`).join(" ")}`,meta)
    }
    if(node.type==="list"){
      const options = node.data.options||[]
      return this.send({type:"interactive",interactive:{type:"list",
        ...(node.data.header?{header:{type:"text",text:this.personalize(node.data.header)}}:{}),
        body:{text:body},...(node.data.footer?{footer:{text:node.data.footer}}:{}),
        action:{button:node.data.buttonLabel||"Options",sections:[{title:"Options",rows:options.map(option=>({
          id:`${node.id}:${option.id}`,title:option.title,...(option.description?{description:option.description}:{})}))}]},
      }},`${body}\n${options.map((option,index)=>`${index+1}. ${option.title}`).join("\n")}`,meta)
    }
    if(node.type==="media"){
      const kind = node.data.mediaType||"image"
      const caption = this.personalize(node.data.text||"")
      return this.send({type:kind,[kind]:{link:node.data.url,...(caption?{caption}:{}),
        ...(kind==="document"&&node.data.filename?{filename:node.data.filename}:{})}},caption||`[${kind}]`,meta)
    }
  }

  async sendTemplate(workflow:WorkflowRow,node:FlowNode) {
    const template = await prisma.template.findFirst({where:{id:node.data.templateId||"",organizationId:this.ctx.organizationId,status:"APPROVED"}})
    if(!template)return
    const count = new Set([...(template.content||"").matchAll(/\{\{(\d+)\}\}/g)].map(match=>match[1])).size
    const parameters = Array.from({length:count},(_,index)=>this.personalize(node.data.parameters?.[index]||"").trim()||"-")
    const preview = (template.content||template.name).replace(/\{\{(\d+)\}\}/g,(match,number)=>parameters[Number(number)-1]??match)
    this.accessToken ??= await this.ctx.getAccessToken()
    const message = await buildTemplateMessage(template,parameters,{accessToken:this.accessToken,metaPhoneNumberId:this.ctx.metaPhoneNumberId})
    await this.send({type:"template",template:message},preview,{workflowId:workflow.id,flowNodeId:node.id,templateId:template.id})
  }

  async setAttribute(attribute:string,value:string) {
    this.attributes[attribute] = value.slice(0,500)
    await this.saveContact(attribute==="name"&&value?{name:value.slice(0,120)}:attribute==="email"&&value?{email:value.slice(0,200)}:{})
  }

  async callApi(node:FlowNode) {
    const url = this.personalize(node.data.url||"",encodeURIComponent)
    const body = node.data.method==="POST"?this.personalize(node.data.body||"",value=>JSON.stringify(value).slice(1,-1)):undefined
    try {
      const result = await safeFetch(url,{method:node.data.method==="GET"?"GET":"POST",body})
      if(node.data.attribute){
        this.attributes[`${node.data.attribute}_status`] = String(result.status)
        await this.setAttribute(node.data.attribute,readPath(result.text,node.data.responsePath||""))
      }
      return result.ok
    } catch(error) {
      if(node.data.attribute){
        this.attributes[`${node.data.attribute}_status`] = "error"
        await this.setAttribute(node.data.attribute,error instanceof Error?error.message:"Request failed")
      }
      return false
    }
  }

  evaluate(node:FlowNode,lastReply:string) {
    const operator = node.data.operator||"EQUALS"
    const expected = normalize(node.data.value||"")
    if(node.data.source==="TAG")
      return this.tags.some(tag=>operator==="CONTAINS"?normalize(tag).includes(expected):normalize(tag)===expected)
    const actual = normalize(node.data.source==="ATTRIBUTE"?this.attributes[node.data.attribute||""]||"":lastReply)
    if(operator==="EXISTS")return actual.length>0
    return operator==="CONTAINS"?actual.includes(expected):actual===expected
  }

  async run(workflow:WorkflowRow,flow:FlowGraph,fromNodeId:string|undefined,lastReply:string,hops = 0):Promise<void> {
    const nodes = new Map(flow.nodes.map(node=>[node.id,node]))
    const next = (node:FlowNode,handle:string)=>flow.edges.find(edge=>edge.from===node.id&&edge.handle===handle)?.to
    let current = fromNodeId
    for(let step=0;current&&step<MAX_STEPS;step++){
      const node = nodes.get(current)
      if(!node)break
      switch(node.type){
        case "start": current = next(node,"next"); break
        case "message": case "media": await this.sendNode(workflow,node); current = next(node,"next"); break
        case "tag": {
          const remove = new Set((node.data.removeTags||[]).map(normalize))
          this.tags = [...new Set([...this.tags.filter(tag=>!remove.has(normalize(tag))),...(node.data.addTags||[])])]
          await this.saveContact()
          current = next(node,"next"); break
        }
        case "condition": current = next(node,this.evaluate(node,lastReply)?"yes":"no"); break
        case "template": await this.sendTemplate(workflow,node); current = next(node,"next"); break
        case "products": await this.sendProducts(workflow,node); current = next(node,"next"); break
        case "setAttribute": await this.setAttribute(node.data.attribute||"value",this.personalize(node.data.value||"")); current = next(node,"next"); break
        case "apiRequest": current = next(node,await this.callApi(node)?"success":"failure"); break
        case "connectFlow": {
          // Continue in another flow of this workspace (it may be paused — used as a sub-flow).
          const target = hops<MAX_FLOW_HOPS?await prisma.workflow.findFirst({where:{id:node.data.targetFlowId||"",organizationId:this.ctx.organizationId},
            select:{id:true,name:true,triggerType:true,triggerValue:true,replyText:true,handoffToHuman:true,flow:true}}):null
          const targetFlow = target?parseFlow(target.flow):null
          const targetStart = targetFlow?.nodes.find(item=>item.type==="start")
          if(!target||!targetFlow||!targetStart){current = undefined; break}
          return this.run(target,targetFlow,targetStart.id,lastReply,hops+1)
        }
        case "delay": {
          const minutes = Math.min(Math.max(Number(node.data.delayMinutes)||1,1),MAX_DELAY_MINUTES)
          await this.setState({workflowId:workflow.id,nodeId:node.id,retries:0,resumeAt:new Date(Date.now()+minutes*60_000).toISOString(),
            expiresAt:new Date(Date.now()+minutes*60_000+STATE_TTL_MS).toISOString()})
          return
        }
        case "buttons": case "list": case "question": case "askLocation": case "askMedia":
          await this.sendNode(workflow,node)
          await this.setState({workflowId:workflow.id,nodeId:node.id,retries:0,
            expiresAt:new Date(Date.now()+STATE_TTL_MS).toISOString()})
          return
        case "handoff":
          await this.setState(null)
          await this.notifyHandoff(workflow,`asked for a person in flow “${workflow.name}”.${node.data.note?` ${node.data.note}`:""}`)
          return
        case "end": current = undefined; break
      }
    }
    await this.setState(null)
  }

  // Returns true when the waiting step consumed the reply.
  async resume(workflow:WorkflowRow,flow:FlowGraph,state:FlowState) {
    const node = flow.nodes.find(item=>item.id===state.nodeId)
    if(!node)return false
    const text = this.ctx.text.trim()
    const next = (handle:string)=>flow.edges.find(edge=>edge.from===node.id&&edge.handle===handle)?.to

    if(node.type==="buttons"||node.type==="list"){
      const options = node.data.options||[]
      const picked = options.find((option,index)=>this.ctx.replyId===`${node.id}:${option.id}`||
        normalize(option.title)===normalize(text)||String(index+1)===text)
      if(picked){await this.run(workflow,flow,next(`opt:${picked.id}`),picked.title);return true}
      return false
    }
    if(node.type==="question"){
      const valid = node.data.validation==="NUMBER"?/^-?\d+(\.\d+)?$/.test(text):
        node.data.validation==="EMAIL"?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text):
        node.data.validation==="PHONE"?/^\+?\d{8,15}$/.test(text.replace(/[\s-]/g,"")):text.length>0
      if(!valid)return false
      const attribute = node.data.attribute||"answer"
      this.attributes[attribute] = text.slice(0,500)
      await this.saveContact(attribute==="name"?{name:text.slice(0,120)}:attribute==="email"?{email:text.slice(0,200)}:{})
      await this.run(workflow,flow,next("next"),text)
      return true
    }
    if(node.type==="askLocation"){
      const location = this.ctx.location
      if(!location)return false
      const attribute = node.data.attribute||"location"
      this.attributes[`${attribute}_address`] = [location.name,location.address].filter(Boolean).join(", ").slice(0,500)
      await this.setAttribute(attribute,`${location.latitude},${location.longitude}`)
      await this.run(workflow,flow,next("next"),text||this.attributes[`${attribute}_address`])
      return true
    }
    if(node.type==="askMedia"){
      const media = this.ctx.media
      if(!media)return false
      const attribute = node.data.attribute||"media"
      this.attributes[`${attribute}_type`] = media.type
      if(media.caption)this.attributes[`${attribute}_caption`] = media.caption.slice(0,500)
      await this.setAttribute(attribute,media.id)
      await this.run(workflow,flow,next("next"),media.caption||text)
      return true
    }
    return false
  }

  async retry(workflow:WorkflowRow,flow:FlowGraph,state:FlowState) {
    const node = flow.nodes.find(item=>item.id===state.nodeId)
    if(!node||state.retries>=MAX_RETRIES){await this.setState(null);return}
    const asks = node.type==="question"||node.type==="askLocation"||node.type==="askMedia"
    const hint = asks?this.personalize(node.data.errorText||"Sorry, that doesn't look right. Please try again.")
      :"Please choose one of the options below 👇"
    await this.send({type:"text",text:{preview_url:false,body:hint}},hint,{workflowId:workflow.id,flowNodeId:node.id,retry:true})
    if(node.type!=="question"&&node.type!=="askMedia")await this.sendNode(workflow,node)
    await this.setState({...state,retries:state.retries+1})
  }
}

// Returns true when a flow (or legacy rule) handled the message, so the inbox can skip the away message.
export async function handleInboundMessage(ctx:InboundContext):Promise<boolean> {
  const workflows:WorkflowRow[] = await prisma.workflow.findMany({
    where:{organizationId:ctx.organizationId,status:"ACTIVE"},orderBy:[{priority:"asc"},{createdAt:"asc"}],
    select:{id:true,name:true,triggerType:true,triggerValue:true,replyText:true,handoffToHuman:true,flow:true},
  })
  const runner = new FlowRun(ctx)
  // First time the customer opens the chat: run the welcome flow, if any.
  if(ctx.welcome){
    const welcome = workflows.map(workflow=>({workflow,flow:parseFlow(workflow.flow)}))
      .find(item=>item.flow?.nodes.find(node=>node.type==="start")?.data.triggerType==="WELCOME")
    if(welcome?.flow)await runner.run(welcome.workflow,welcome.flow,welcome.flow.nodes.find(node=>node.type==="start")?.id,"")
    return Boolean(welcome?.flow)
  }
  // A cart from the WhatsApp catalog: run the "order received" flow with the order details as attributes.
  if(ctx.order){
    const orderFlow = workflows.map(workflow=>({workflow,flow:parseFlow(workflow.flow)}))
      .find(item=>item.flow?.nodes.find(node=>node.type==="start")?.data.triggerType==="ORDER")
    if(!orderFlow?.flow)return false
    runner.setOrder(ctx.order)
    await runner.setState(null)
    await runner.run(orderFlow.workflow,orderFlow.flow,orderFlow.flow.nodes.find(node=>node.type==="start")?.id,"")
    return true
  }
  // Chat opened from a Click-to-WhatsApp ad: an "ad" flow (for this ad, or any ad) takes priority.
  if(ctx.referral?.sourceType==="ad"){
    const adFlow = workflows.map(workflow=>({workflow,flow:parseFlow(workflow.flow)})).map(item=>({...item,start:item.flow?.nodes.find(node=>node.type==="start")}))
      .filter(item=>item.start?.data.triggerType==="AD")
      .sort((a,b)=>(b.start!.data.adIds||[]).length-(a.start!.data.adIds||[]).length)
      .find(item=>!(item.start!.data.adIds||[]).filter(Boolean).length||(item.start!.data.adIds||[]).map(id=>id.trim()).includes(ctx.referral!.sourceId||""))
    if(adFlow?.flow){
      await runner.setState(null)
      await runner.run(adFlow.workflow,adFlow.flow,adFlow.start!.id,ctx.text)
      return true
    }
  }
  const normalized = normalize(ctx.text)
  const trigger = workflows.find(workflow=>triggerMatches(workflow,normalized))

  const state = parseState(ctx.flowState)
  const active = state&&(workflows.find(workflow=>workflow.id===state.workflowId)||await prisma.workflow.findFirst({
    where:{id:state.workflowId,organizationId:ctx.organizationId},
    select:{id:true,name:true,triggerType:true,triggerValue:true,replyText:true,handoffToHuman:true,flow:true}}))
  const activeFlow = active?parseFlow(active.flow):null
  if(state&&active&&activeFlow&&state.resumeAt){
    // The flow is in a Delay step: a message for another flow cancels the wait; otherwise the wait continues.
    if(!trigger||trigger.id===active.id||isCatchAll(trigger))return false
  }else if(state&&active&&activeFlow){
    if(await runner.resume(active,activeFlow,state))return true
    // An explicit keyword for another flow wins over re-prompting the current step.
    if(!trigger||trigger.id===active.id||isCatchAll(trigger)){
      await runner.retry(active,activeFlow,state)
      return true
    }
  }else if(ctx.flowState!==null){
    await runner.setState(null)
  }

  if(!trigger)return false
  const flow = parseFlow(trigger.flow)
  if(!flow){await runner.runLegacyRule(trigger);return true}
  const start = flow.nodes.find(node=>node.type==="start")
  await runner.run(trigger,flow,start?.id,ctx.text)
  return true
}

// Continues flows whose Delay step is due. Conversations are claimed with SKIP LOCKED so each resumes once.
export async function resumeDueDelays(limit = 20) {
  const due = await prisma.$queryRaw<{ id:string; flowState:Prisma.JsonValue }[]>`
    UPDATE conversations SET "flowState" = "flowState" || '{"resuming":true}'::jsonb
    WHERE id IN (SELECT id FROM conversations
                 WHERE "flowState"->>'resumeAt' IS NOT NULL AND ("flowState"->>'resumeAt')::timestamptz <= now()
                   AND "flowState"->>'resuming' IS NULL
                 LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, "flowState"`
  for(const row of due){
    try {
      const state = parseState(row.flowState)
      const conversation = await prisma.conversation.findUnique({where:{id:row.id},include:{contact:true,phoneNumber:true}})
      const workflow = state&&conversation?await prisma.workflow.findFirst({where:{id:state.workflowId,organizationId:conversation.organizationId},
        select:{id:true,name:true,triggerType:true,triggerValue:true,replyText:true,handoffToHuman:true,flow:true}}):null
      const flow = workflow?parseFlow(workflow.flow):null
      if(!state||!conversation?.phoneNumber||!workflow||!flow){
        await prisma.conversation.update({where:{id:row.id},data:{flowState:Prisma.JsonNull}})
        continue
      }
      const runner = new FlowRun({organizationId:conversation.organizationId,metaPhoneNumberId:conversation.phoneNumber!.phoneNumberId,
        conversationId:conversation.id,flowState:row.flowState,contact:conversation.contact,text:"",
        getAccessToken:async()=>{
          const { getMetaAccessToken } = await import("@/lib/onboarding/context")
          const token = await getMetaAccessToken(conversation.organizationId)
          if(!token)throw new Error("No connected Meta token to continue the flow.")
          return token
        }})
      const next = flow.edges.find(edge=>edge.from===state.nodeId&&edge.handle==="next")?.to
      await runner.run(workflow,flow,next,"")
    } catch(error) {
      console.error("[flows] could not continue after delay",row.id,error)
      await prisma.conversation.update({where:{id:row.id},data:{flowState:Prisma.JsonNull}}).catch(()=>null)
    }
  }
  return due.length
}
