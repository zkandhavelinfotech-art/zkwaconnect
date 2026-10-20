"use client"
import { useEffect, useRef, useState } from "react"
import type { FlowGraph, FlowNode } from "@/lib/flows/types"

// A local, send-nothing approximation of lib/flows/engine.ts for testing flows in the builder.
type Bubble = { from:"bot"|"user"|"system"; text:string; options?:string[]; list?:string }
type SimState = { attributes:Record<string,string>; tags:string[]; waiting:string|null; retries:number }

const norm = (text:string)=>text.trim().toLocaleLowerCase()
const SAMPLE_LOCATION = "📍 Share sample location"
const SAMPLE_MEDIA = "📷 Send sample photo"

export function FlowSimulator({flow}:{flow:FlowGraph}) {
  const [bubbles,setBubbles] = useState<Bubble[]>([])
  const [input,setInput] = useState("")
  const state = useRef<SimState>({attributes:{},tags:[],waiting:null,retries:0})
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{endRef.current?.scrollIntoView({block:"end"})},[bubbles])

  const start = flow.nodes.find(node=>node.type==="start")
  const keywords = (start?.data.keywords||[]).map(norm).filter(keyword=>keyword.length>=2)

  function simulateWelcome(){
    if(!start)return
    state.current = {attributes:{},tags:[],waiting:null,retries:0}
    const out:Bubble[] = [{from:"system",text:"👋 Customer opened the chat for the first time"}]
    run(start.id,"",out)
    setBubbles(out)
  }

  function reset(){state.current = {attributes:{},tags:[],waiting:null,retries:0};setBubbles([])}

  function personalize(text:string){
    return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi,(_,key:string)=>{
      const name = key.toLowerCase()
      if(name==="name")return state.current.attributes.name||"Priya"
      if(name==="phone")return "919876543210"
      return state.current.attributes[name]??""
    })
  }

  function render(node:FlowNode):Bubble {
    const text = personalize(node.data.text||"")
    if(node.type==="buttons")return {from:"bot",text:[node.data.header,text,node.data.footer].filter(Boolean).join("\n\n"),options:(node.data.options||[]).map(option=>option.title)}
    if(node.type==="list")return {from:"bot",text:[node.data.header,text,node.data.footer].filter(Boolean).join("\n\n"),list:node.data.buttonLabel||"Options",
      options:(node.data.options||[]).map(option=>option.title)}
    if(node.type==="media")return {from:"bot",text:`📎 ${node.data.mediaType||"image"}: ${node.data.url||""}${text?`\n${text}`:""}`}
    if(node.type==="template")return {from:"bot",text:`📋 Template: ${node.data.templateName||"not chosen"}`}
    if(node.type==="askLocation")return {from:"bot",text,options:[SAMPLE_LOCATION]}
    if(node.type==="askMedia")return {from:"bot",text,options:[SAMPLE_MEDIA]}
    return {from:"bot",text}
  }

  function run(fromId:string|undefined,lastReply:string,out:Bubble[]){
    const s = state.current
    const next = (node:FlowNode,handle:string)=>flow.edges.find(edge=>edge.from===node.id&&edge.handle===handle)?.to
    let current = fromId
    for(let step=0;current&&step<25;step++){
      const node = flow.nodes.find(item=>item.id===current)
      if(!node)break
      switch(node.type){
        case "start": current = next(node,"next"); break
        case "message": case "media": case "template": out.push(render(node)); current = next(node,"next"); break
        case "setAttribute":
          s.attributes[node.data.attribute||"value"] = personalize(node.data.value||"")
          out.push({from:"system",text:`Saved {{${node.data.attribute}}} = ${s.attributes[node.data.attribute||"value"]||"(empty)"}`}); current = next(node,"next"); break
        case "apiRequest":
          out.push({from:"system",text:`🌐 ${node.data.method||"POST"} ${node.data.url||""} — not called in preview, following Success`})
          current = next(node,"success"); break
        case "connectFlow":
          out.push({from:"system",text:`🔗 Continues in “${node.data.targetFlowName||"another flow"}” (open that flow to test it)`}); s.waiting = null; return
        case "products": {
          const ids = (node.data.productIds||[]).filter(Boolean)
          out.push({from:"bot",text:`🛍️ ${node.data.header?`${node.data.header}\n`:""}${node.data.text||""}\n[${ids.length?`${ids.length} product(s): ${ids.join(", ")}`:"View catalog"}]`}); current = next(node,"next"); break
        }
        case "delay": {
          const m = Number(node.data.delayMinutes)||1
          out.push({from:"system",text:`⏱ Waits ${m>=60&&m%60===0?`${m/60} h`:`${m} min`} on WhatsApp — skipped in preview`}); current = next(node,"next"); break
        }
        case "tag": {
          const remove = new Set((node.data.removeTags||[]).map(norm))
          s.tags = [...new Set([...s.tags.filter(tag=>!remove.has(norm(tag))),...(node.data.addTags||[]).filter(Boolean)])]
          out.push({from:"system",text:`Tags: ${s.tags.join(", ")||"none"}`}); current = next(node,"next"); break
        }
        case "condition": {
          const d = node.data, expected = norm(d.value||"")
          let ok:boolean
          if(d.source==="TAG")ok = s.tags.some(tag=>d.operator==="CONTAINS"?norm(tag).includes(expected):norm(tag)===expected)
          else{
            const actual = norm(d.source==="ATTRIBUTE"?s.attributes[d.attribute||""]||"":lastReply)
            ok = d.operator==="EXISTS"?actual.length>0:d.operator==="CONTAINS"?actual.includes(expected):actual===expected
          }
          out.push({from:"system",text:`Condition → ${ok?"Yes":"No"}`}); current = next(node,ok?"yes":"no"); break
        }
        case "buttons": case "list": case "question": case "askLocation": case "askMedia":
          out.push(render(node)); s.waiting = node.id; s.retries = 0; return
        case "handoff": out.push({from:"system",text:"👤 Handed off to your team. The bot stops here."}); s.waiting = null; return
        case "end": current = undefined; break
      }
    }
    s.waiting = null
    out.push({from:"system",text:"Flow finished."})
  }

  function send(text:string){
    const trimmed = text.trim()
    if(!trimmed)return
    const s = state.current
    const out:Bubble[] = [{from:"user",text:trimmed}]
    const waiting = s.waiting?flow.nodes.find(node=>node.id===s.waiting):undefined
    if(waiting){
      if(waiting.type==="askLocation"||waiting.type==="askMedia"){
        const expected = waiting.type==="askLocation"?SAMPLE_LOCATION:SAMPLE_MEDIA
        if(trimmed===expected){
          const attribute = waiting.data.attribute||(waiting.type==="askLocation"?"location":"media")
          s.attributes[attribute] = waiting.type==="askLocation"?"12.9716,77.5946":"sample-media-id"
          if(waiting.type==="askLocation")s.attributes[`${attribute}_address`] = "MG Road, Bengaluru"
          run(flow.edges.find(edge=>edge.from===waiting.id&&edge.handle==="next")?.to,trimmed,out)
        }else if(s.retries<2){s.retries++;out.push({from:"bot",text:personalize(waiting.data.errorText||"Please use the button below."),options:[expected]})}
        else{s.waiting = null;out.push({from:"system",text:"Nothing shared — flow stopped."})}
      }else if(waiting.type==="question"){
        const v = waiting.data.validation
        const valid = v==="NUMBER"?/^-?\d+(\.\d+)?$/.test(trimmed):v==="EMAIL"?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed):
          v==="PHONE"?/^\+?\d{8,15}$/.test(trimmed.replace(/[\s-]/g,"")):true
        if(valid){
          s.attributes[waiting.data.attribute||"answer"] = trimmed
          run(flow.edges.find(edge=>edge.from===waiting.id&&edge.handle==="next")?.to,trimmed,out)
        }else if(s.retries<2){s.retries++;out.push({from:"bot",text:personalize(waiting.data.errorText||"Sorry, that doesn't look right.")})}
        else{s.waiting = null;out.push({from:"system",text:"Too many invalid answers — flow stopped."})}
      }else{
        const options = waiting.data.options||[]
        const picked = options.find((option,index)=>norm(option.title)===norm(trimmed)||String(index+1)===trimmed)
        if(picked)run(flow.edges.find(edge=>edge.from===waiting.id&&edge.handle===`opt:${picked.id}`)?.to,picked.title,out)
        else if(s.retries<2){s.retries++;out.push({from:"bot",text:"Please choose one of the options below 👇"},render(waiting))}
        else{s.waiting = null;out.push({from:"system",text:"No option chosen — flow stopped."})}
      }
    }else{
      const n = norm(trimmed)
      const triggered = start&&start.data.triggerType!=="WELCOME"&&(start.data.triggerType==="ANY_MESSAGE"||start.data.triggerType==="AD"||start.data.triggerType==="ORDER"||
        (start.data.match==="CONTAINS"?keywords.some(keyword=>n.includes(keyword)):keywords.includes(n)))
      if(triggered)run(start.id,trimmed,out)
      else out.push({from:"system",text:`No trigger matched. Try: ${keywords.join(", ")||"any message"}`})
    }
    setBubbles(current=>[...current,...out])
    setInput("")
  }

  const last = bubbles[bubbles.length-1]
  return <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:420}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:"#183633"}}>Test preview</div>
      <button onClick={reset} style={{border:"1px solid #d7e2df",borderRadius:6,padding:"5px 8px",background:"#fff",fontSize:11,cursor:"pointer"}}>Restart</button>
    </div>
    <div style={{fontSize:10,color:"#71817e",marginBottom:8}}>Nothing is sent to WhatsApp. Uses unsaved changes.</div>
    <div style={{flex:1,overflowY:"auto",background:"#efeae2",borderRadius:8,padding:10,display:"flex",flexDirection:"column",gap:6}}>
      {!bubbles.length&&<div style={{fontSize:11,color:"#64748b",textAlign:"center",marginTop:20}}>
        {start?.data.triggerType==="WELCOME"
          ? <button onClick={simulateWelcome} style={{border:"1px solid #075e54",borderRadius:16,padding:"6px 12px",background:"#fff",color:"#075e54",fontSize:12,fontWeight:700,cursor:"pointer"}}>👋 Simulate: customer opens the chat</button>
          : start?.data.triggerType==="AD"?<>Type any message to simulate a customer arriving from your ad.</>
          : <>Type {keywords[0]?`“${keywords[0]}”`:"a message"} to start the flow.</>}</div>}
      {bubbles.map((bubble,index)=>bubble.from==="system"?
        <div key={index} style={{alignSelf:"center",fontSize:10,background:"#fff8c5",color:"#6b5900",borderRadius:6,padding:"3px 8px"}}>{bubble.text}</div>:
        <div key={index} style={{alignSelf:bubble.from==="user"?"flex-end":"flex-start",maxWidth:"85%"}}>
          <div style={{background:bubble.from==="user"?"#d9fdd3":"#fff",borderRadius:8,padding:"6px 9px",fontSize:12,color:"#111b21",
            whiteSpace:"pre-wrap",overflowWrap:"anywhere",boxShadow:"0 1px 1px rgba(0,0,0,.08)"}}>{bubble.text}</div>
          {bubble.options&&!bubble.list&&bubble.options.map(option=>
            <button key={option} disabled={bubble!==last} onClick={()=>send(option)} style={{display:"block",width:"100%",marginTop:3,
              background:"#fff",border:0,borderRadius:8,padding:"6px",fontSize:12,color:"#027eb5",cursor:"pointer"}}>{option}</button>)}
          {bubble.list&&<details style={{marginTop:3,background:"#fff",borderRadius:8,padding:"6px 9px",fontSize:12}}>
            <summary style={{color:"#027eb5",cursor:"pointer"}}>☰ {bubble.list}</summary>
            {bubble.options?.map(option=><button key={option} disabled={bubble!==last} onClick={()=>send(option)}
              style={{display:"block",width:"100%",textAlign:"left",background:"none",border:0,borderTop:"1px solid #eee",padding:"6px 0",fontSize:12,cursor:"pointer"}}>{option}</button>)}
          </details>}
        </div>)}
      <div ref={endRef}/>
    </div>
    <form onSubmit={event=>{event.preventDefault();send(input)}} style={{display:"flex",gap:6,marginTop:8}}>
      <input aria-label="Test message" value={input} onChange={event=>setInput(event.target.value)} placeholder="Type a message"
        style={{flex:1,minHeight:36,padding:"7px 10px",border:"1px solid #cbd5d3",borderRadius:18,fontSize:12}}/>
      <button type="submit" style={{border:0,borderRadius:18,padding:"0 14px",background:"#075e54",color:"#fff",fontSize:12,cursor:"pointer"}}>Send</button>
    </form>
  </div>
}
