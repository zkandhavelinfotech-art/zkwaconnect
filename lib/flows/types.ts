// Shared by the flow builder UI and the webhook flow engine. Keep this file free of server-only imports.

export type FlowOption = { id:string; title:string; description?:string }

export type FlowNodeData = {
  // start
  // WELCOME: the customer opened the chat for the first time (WhatsApp welcome message event)
  // AD: the chat was started from a Click-to-WhatsApp ad (optionally only these ad IDs)
  // ORDER: the customer sent a cart from your WhatsApp catalog
  triggerType?:"KEYWORD"|"ANY_MESSAGE"|"WELCOME"|"AD"|"ORDER"
  adIds?:string[]
  keywords?:string[]
  match?:"CONTAINS"|"EXACT"
  // message / buttons / list / question / media caption / ask prompts
  text?:string
  header?:string
  footer?:string
  buttonLabel?:string
  options?:FlowOption[]
  // question / askLocation / askMedia / setAttribute / apiRequest: where the result is saved
  attribute?:string
  validation?:"TEXT"|"NUMBER"|"EMAIL"|"PHONE"
  errorText?:string
  // condition / setAttribute
  source?:"ATTRIBUTE"|"TAG"|"LAST_REPLY"
  operator?:"EQUALS"|"CONTAINS"|"EXISTS"
  value?:string
  // tag
  addTags?:string[]
  removeTags?:string[]
  // media
  mediaType?:"image"|"video"|"document"
  url?:string
  filename?:string
  // handoff
  note?:string
  // template
  templateId?:string
  templateName?:string
  parameters?:string[]
  // apiRequest
  method?:"GET"|"POST"
  body?:string
  responsePath?:string
  // connectFlow
  targetFlowId?:string
  targetFlowName?:string
  // delay
  delayMinutes?:number
  // products: catalog retailer IDs (SKUs) to show; empty = whole catalog
  productIds?:string[]
}

export type FlowNodeType = "start"|"message"|"buttons"|"list"|"media"|"template"|"question"|"askLocation"|"askMedia"
  |"condition"|"setAttribute"|"tag"|"apiRequest"|"connectFlow"|"delay"|"products"|"handoff"|"end"
export type FlowNode = { id:string; type:FlowNodeType; x:number; y:number; data:FlowNodeData }
// handle: "next" for single-exit nodes, "yes"/"no" for conditions, "success"/"failure" for API requests,
// "opt:<optionId>" for buttons and lists
export type FlowEdge = { id:string; from:string; handle:string; to:string }
export type FlowGraph = { nodes:FlowNode[]; edges:FlowEdge[] }

type Meta = { label:string; icon:string; color:string; hint:string; group:"trigger"|"message"|"action" }
export const NODE_META:Record<FlowNodeType,Meta> = {
  start:       {group:"trigger", label:"Flow start",          icon:"🚀",color:"#2563eb",hint:"Keyword or any message starts the flow"},
  message:     {group:"message", label:"Text",                icon:"💬",color:"#16a34a",hint:"Plain text reply"},
  buttons:     {group:"message", label:"Text buttons",        icon:"🔘",color:"#0891b2",hint:"Message with up to 3 reply buttons"},
  list:        {group:"message", label:"List",                icon:"📋",color:"#7c3aed",hint:"Menu with up to 10 options"},
  media:       {group:"message", label:"Media",               icon:"🖼️",color:"#059669",hint:"Image, video or document by URL"},
  products:    {group:"message", label:"Products",            icon:"🛍️",color:"#c2410c",hint:"Send catalog products (cart enabled)"},
  template:    {group:"message", label:"Template",            icon:"⚡",color:"#0d9488",hint:"Approved WhatsApp template (works outside 24h)"},
  handoff:     {group:"action",  label:"Request intervention",icon:"👤",color:"#b45309",hint:"Stop the bot and notify your team"},
  condition:   {group:"action",  label:"Condition",           icon:"🔀",color:"#db2777",hint:"Branch on attribute, tag or last reply"},
  connectFlow: {group:"action",  label:"Connect flow",        icon:"🔗",color:"#0f766e",hint:"Continue in another flow"},
  question:    {group:"action",  label:"Ask question",        icon:"❓",color:"#d97706",hint:"Save the answer to a contact attribute"},
  askLocation: {group:"action",  label:"Ask location",        icon:"📍",color:"#ea580c",hint:"Ask the customer to share their location"},
  askMedia:    {group:"action",  label:"Ask media",           icon:"📎",color:"#9333ea",hint:"Wait for a photo, video or document"},
  setAttribute:{group:"action",  label:"Set attribute",       icon:"🧮",color:"#475569",hint:"Save a value on the contact"},
  tag:         {group:"action",  label:"Add tag",             icon:"🏷️",color:"#4f46e5",hint:"Add or remove contact tags"},
  apiRequest:  {group:"action",  label:"API request",         icon:"🌐",color:"#1d4ed8",hint:"Call your HTTPS API and branch on the result"},
  delay:       {group:"action",  label:"Delay",               icon:"⏱️",color:"#0369a1",hint:"Wait minutes or hours, then continue"},
  end:         {group:"action",  label:"End flow",            icon:"⏹️",color:"#64748b",hint:"Finish the conversation flow"},
}

export function nodeHandles(node:FlowNode):{id:string;label:string}[] {
  switch(node.type){
    case "end": case "handoff": case "connectFlow": return []
    case "condition": return [{id:"yes",label:"Yes"},{id:"no",label:"No"}]
    case "apiRequest": return [{id:"success",label:"Success"},{id:"failure",label:"Failed"}]
    case "buttons": case "list": return (node.data.options||[]).map(option=>({id:`opt:${option.id}`,label:option.title||"Option"}))
    default: return [{id:"next",label:""}]
  }
}

export const ATTRIBUTE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/
export const WAITING_TYPES:FlowNodeType[] = ["buttons","list","question","askLocation","askMedia"]
// Free-form messages are only allowed within 24 h of the customer's last message, so delays stop short of that.
export const MAX_DELAY_MINUTES = 23*60

export function validateFlow(flow:FlowGraph):string[] {
  const errors:string[] = []
  const starts = flow.nodes.filter(node=>node.type==="start")
  if(starts.length!==1) errors.push("A flow needs exactly one Start node.")
  const start = starts[0]
  if(start){
    if((start.data.triggerType||"KEYWORD")==="KEYWORD"&&!(start.data.keywords||[]).some(keyword=>keyword.trim().length>=2))
      errors.push("Add at least one keyword (2+ characters) to the Start node, or trigger on any message.")
    if(!flow.edges.some(edge=>edge.from===start.id)) errors.push("Connect the Start node to the first step.")
  }
  const ids = new Set(flow.nodes.map(node=>node.id))
  for(const edge of flow.edges)
    if(!ids.has(edge.from)||!ids.has(edge.to)) errors.push("A connection points to a deleted step.")
  for(const node of flow.nodes){
    const name = `“${NODE_META[node.type].label}” step`
    const text = (node.data.text||"").trim()
    if(["message","buttons","list","question","askLocation","askMedia"].includes(node.type)&&!text) errors.push(`${name} needs message text.`)
    if(text.length>1024) errors.push(`${name} text must be 1,024 characters or fewer.`)
    if(node.type==="buttons"){
      const options = node.data.options||[]
      if(options.length<1||options.length>3) errors.push(`${name} needs 1–3 buttons.`)
      if(options.some(option=>!option.title.trim()||option.title.length>20)) errors.push(`${name}: button titles need 1–20 characters.`)
    }
    if(node.type==="list"){
      const options = node.data.options||[]
      if(options.length<1||options.length>10) errors.push(`${name} needs 1–10 options.`)
      if(options.some(option=>!option.title.trim()||option.title.length>24)) errors.push(`${name}: option titles need 1–24 characters.`)
      if(!(node.data.buttonLabel||"").trim()||(node.data.buttonLabel||"").length>20) errors.push(`${name} needs a menu button label of 1–20 characters.`)
    }
    if(["question","askLocation","askMedia","setAttribute"].includes(node.type)&&!ATTRIBUTE_PATTERN.test(node.data.attribute||""))
      errors.push(`${name} needs an attribute name like city or order_id (lowercase letters, numbers, _).`)
    if(node.type==="apiRequest"&&node.data.attribute&&!ATTRIBUTE_PATTERN.test(node.data.attribute))
      errors.push(`${name}: the attribute name can only use lowercase letters, numbers and _.`)
    if(node.type==="condition"){
      if(node.data.source==="ATTRIBUTE"&&!ATTRIBUTE_PATTERN.test(node.data.attribute||"")) errors.push(`${name} needs an attribute name.`)
      if(node.data.operator!=="EXISTS"&&!(node.data.value||"").trim()) errors.push(`${name} needs a value to compare.`)
    }
    if(node.type==="tag"&&!(node.data.addTags||[]).length&&!(node.data.removeTags||[]).length) errors.push(`${name} needs at least one tag.`)
    if(node.type==="media"&&!/^https:\/\//.test(node.data.url||"")) errors.push(`${name} needs a public https:// media URL.`)
    if(node.type==="template"&&!node.data.templateId) errors.push(`${name}: choose an approved template.`)
    if(node.type==="apiRequest"&&!/^https:\/\/[^\s]+$/.test(node.data.url||"")) errors.push(`${name} needs an https:// URL.`)
    if(node.type==="connectFlow"&&!node.data.targetFlowId) errors.push(`${name}: choose the flow to continue in.`)
    if(node.type==="products"&&(node.data.productIds||[]).filter(Boolean).length>30) errors.push(`${name}: up to 30 products.`)
    if(node.type==="delay"&&!(Number(node.data.delayMinutes)>=1&&Number(node.data.delayMinutes)<=MAX_DELAY_MINUTES))
      errors.push(`${name}: wait between 1 minute and 23 hours (WhatsApp's 24-hour reply window).`)
  }
  return [...new Set(errors)]
}

export function newId(prefix:string) {
  return `${prefix}_${Math.random().toString(36).slice(2,9)}`
}

export function defaultNodeData(type:FlowNodeType):FlowNodeData {
  switch(type){
    case "start": return {triggerType:"KEYWORD",keywords:["hi"],match:"EXACT"}
    case "message": return {text:"Hi {{name}}! 👋 Welcome to our business."}
    case "buttons": return {text:"How can we help you today?",options:[{id:newId("o"),title:"Pricing"},{id:newId("o"),title:"Talk to sales"}]}
    case "list": return {text:"Choose a category",buttonLabel:"View options",options:[{id:newId("o"),title:"Products"},{id:newId("o"),title:"Support"}]}
    case "question": return {text:"What's your city?",attribute:"city",validation:"TEXT",errorText:"Sorry, that doesn't look right. Please try again."}
    case "askLocation": return {text:"Please share your location so we can find the nearest branch.",attribute:"location",errorText:"Tap the button below to share your location."}
    case "askMedia": return {text:"Please send a photo of the issue.",attribute:"photo",errorText:"Please send a photo, video or document."}
    case "condition": return {source:"LAST_REPLY",operator:"CONTAINS",value:"yes"}
    case "setAttribute": return {attribute:"stage",value:"interested"}
    case "tag": return {addTags:["lead"],removeTags:[]}
    case "media": return {mediaType:"image",url:"https://",text:""}
    case "template": return {parameters:[]}
    case "apiRequest": return {method:"POST",url:"https://",body:'{"phone":"{{phone}}","name":"{{name}}"}',attribute:"api_result",responsePath:""}
    case "connectFlow": return {}
    case "delay": return {delayMinutes:30}
    case "products": return {header:"Our bestsellers",text:"Tap a product to view it and add it to your cart 🛒",productIds:[]}
    case "handoff": return {note:"Customer wants to talk to a person"}
    case "end": return {}
  }
}

export function starterFlow():FlowGraph {
  const start:FlowNode = {id:newId("n"),type:"start",x:60,y:160,data:defaultNodeData("start")}
  const welcome:FlowNode = {id:newId("n"),type:"buttons",x:360,y:120,data:defaultNodeData("buttons")}
  return {nodes:[start,welcome],edges:[{id:newId("e"),from:start.id,handle:"next",to:welcome.id}]}
}
