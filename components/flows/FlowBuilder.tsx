"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  NODE_META, defaultNodeData, newId, nodeHandles, validateFlow,
  type FlowEdge, type FlowGraph, type FlowNode, type FlowNodeData, type FlowNodeType, type FlowOption,
} from "@/lib/flows/types"
import { FlowSimulator } from "@/components/flows/FlowSimulator"

// Fixed node geometry so connection points can be computed without measuring the DOM.
const NODE_W = 240
const HEADER_H = 34
const BODY_H = 62
const ROW_H = 28

function nodeHeight(node:FlowNode) {
  return HEADER_H+BODY_H+nodeHandles(node).length*ROW_H
}
function handlePoint(node:FlowNode,handle:string) {
  const index = Math.max(0,nodeHandles(node).findIndex(item=>item.id===handle))
  return {x:node.x+NODE_W,y:node.y+HEADER_H+BODY_H+index*ROW_H+ROW_H/2}
}
function inputPoint(node:FlowNode) {
  return {x:node.x,y:node.y+HEADER_H/2}
}
function curve(a:{x:number;y:number},b:{x:number;y:number}) {
  const dx = Math.max(60,Math.abs(b.x-a.x)/2)
  return `M ${a.x} ${a.y} C ${a.x+dx} ${a.y}, ${b.x-dx} ${b.y}, ${b.x} ${b.y}`
}

function preview(node:FlowNode) {
  const d = node.data
  switch(node.type){
    case "start": return d.triggerType==="WELCOME"?"Customer opens the chat for the first time":d.triggerType==="ANY_MESSAGE"?"Any incoming message":
      d.triggerType==="ORDER"?"Customer sends a cart from your catalog":
      d.triggerType==="AD"?`Chat started from ${(d.adIds||[]).filter(Boolean).length?`ad ${(d.adIds||[]).filter(Boolean).join(", ")}`:"any Click-to-WhatsApp ad"}`:
      `${d.match==="CONTAINS"?"Contains":"Exactly"}: ${(d.keywords||[]).filter(Boolean).join(", ")||"—"}`
    case "tag": return [d.addTags?.filter(Boolean).length?`+ ${d.addTags.filter(Boolean).join(", ")}`:"",
      d.removeTags?.filter(Boolean).length?`− ${d.removeTags.filter(Boolean).join(", ")}`:""].filter(Boolean).join("  ")||"No tags"
    case "condition": {
      const subject = d.source==="TAG"?"Has tag":d.source==="ATTRIBUTE"?`{{${d.attribute||"?"}}}`:"Last reply"
      return d.source==="TAG"?`${subject} “${d.value||""}”`:`${subject} ${d.operator==="EXISTS"?"is set":`${(d.operator||"EQUALS").toLowerCase()} “${d.value||""}”`}`
    }
    case "media": return `${d.mediaType||"image"} · ${d.url||""}`
    case "handoff": return d.note||"Notify your team and stop the bot"
    case "end": return "Flow ends here"
    case "question": case "askLocation": case "askMedia": return `${d.text||""}\n→ saves {{${d.attribute||"?"}}}`
    case "template": return d.templateName?`Template: ${d.templateName}`:"Choose an approved template"
    case "setAttribute": return `{{${d.attribute||"?"}}} = ${d.value||"—"}`
    case "apiRequest": return `${d.method||"POST"} ${d.url||""}${d.attribute?`\n→ saves {{${d.attribute}}}`:""}`
    case "connectFlow": return d.targetFlowName?`Continue in “${d.targetFlowName}”`:"Choose a flow to continue in"
    case "products": return `${(d.productIds||[]).filter(Boolean).length?`${(d.productIds||[]).filter(Boolean).length} product(s)`:"Whole catalog"}${d.text?` · ${d.text}`:""}`
    case "delay": { const m = Number(d.delayMinutes)||0; return `Wait ${m>=60&&m%60===0?`${m/60} hour${m===60?"":"s"}`:`${m} minute${m===1?"":"s"}`}, then continue` }
    default: return d.text||""
  }
}

const label:React.CSSProperties = {display:"block",fontSize:11,fontWeight:700,color:"#526763",margin:"10px 0 5px"}
const field:React.CSSProperties = {width:"100%",boxSizing:"border-box",minHeight:36,padding:"7px 9px",border:"1px solid #cbd5d3",
  borderRadius:6,fontSize:12,color:"#183633",background:"#fff",fontFamily:"inherit"}
const smallBtn:React.CSSProperties = {border:"1px solid #d7e2df",borderRadius:6,padding:"6px 9px",background:"#fff",fontSize:11,
  cursor:"pointer",color:"#183633"}

type Drag =
  | {kind:"node";id:string;dx:number;dy:number}
  | {kind:"pan";sx:number;sy:number;vx:number;vy:number}
  | {kind:"connect";from:string;handle:string;x:number;y:number}

type Props = {
  initialName:string
  initialFlow:FlowGraph
  status?:string
  saving:boolean
  onSave:(name:string,flow:FlowGraph)=>void
  workflowId?:string
  onToggleActive?:(enable:boolean)=>void
  toggling?:boolean
}
export type TemplateOption = { id:string; name:string; language:string; content:string|null }
export type FlowOptionRef = { id:string; name:string }

export function FlowBuilder({initialName,initialFlow,status,saving,onSave,workflowId,onToggleActive,toggling}:Props) {
  const [templates,setTemplates] = useState<TemplateOption[]>([])
  const [otherFlows,setOtherFlows] = useState<FlowOptionRef[]>([])
  const [iceBreakers,setIceBreakers] = useState<string[]>([])
  useEffect(()=>{
    fetch("/api/flows/conversational").then(response=>response.ok?response.json():null).then(body=>{
      if(body)setIceBreakers([...new Set<string>((body.numbers||[]).flatMap((number:{prompts:string[]})=>number.prompts))])
    }).catch(()=>null)
    fetch("/api/templates").then(response=>response.ok?response.json():null).then(body=>{
      if(body)setTemplates((body.templates||[]).filter((item:{status:string})=>item.status==="APPROVED"))
    }).catch(()=>null)
    fetch("/api/workflows").then(response=>response.ok?response.json():null).then(body=>{
      if(body)setOtherFlows((body.workflows||[]).filter((item:{id:string;flow:unknown})=>item.flow&&item.id!==workflowId)
        .map((item:{id:string;name:string})=>({id:item.id,name:item.name})))
    }).catch(()=>null)
  },[workflowId])
  const [name,setName] = useState(initialName)
  const [flow,setFlow] = useState<FlowGraph>(initialFlow)
  const [selected,setSelected] = useState<string|null>(null)
  const [selectedEdge,setSelectedEdge] = useState<string|null>(null)
  const [view,setView] = useState({x:20,y:20,zoom:1})
  const [drag,setDrag] = useState<Drag|null>(null)
  const [panel,setPanel] = useState<"edit"|"preview">("edit")
  const [dirty,setDirty] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  const errors = useMemo(()=>validateFlow(flow),[flow])
  const nodesById = useMemo(()=>new Map(flow.nodes.map(node=>[node.id,node])),[flow.nodes])
  const selectedNode = selected?nodesById.get(selected)||null:null

  const update = useCallback((recipe:(flow:FlowGraph)=>FlowGraph)=>{setFlow(recipe);setDirty(true)},[])

  useEffect(()=>{
    if(!dirty)return
    const warn = (event:BeforeUnloadEvent)=>{event.preventDefault()}
    window.addEventListener("beforeunload",warn)
    return ()=>window.removeEventListener("beforeunload",warn)
  },[dirty])

  const toWorld = useCallback((clientX:number,clientY:number)=>{
    const rect = canvasRef.current!.getBoundingClientRect()
    return {x:(clientX-rect.left-view.x)/view.zoom,y:(clientY-rect.top-view.y)/view.zoom}
  },[view])

  const addNode = useCallback((type:FlowNodeType,at?:{x:number;y:number})=>{
    if(type==="start"&&flow.nodes.some(node=>node.type==="start"))return
    const rect = canvasRef.current?.getBoundingClientRect()
    const position = at||(rect?toWorld(rect.left+rect.width/2-NODE_W/2,rect.top+rect.height/3):{x:200,y:200})
    // Auto-connect a new step to the selected one when it has a free exit.
    const source = selected?flow.nodes.find(item=>item.id===selected):undefined
    const free = source&&nodeHandles(source).find(handle=>!flow.edges.some(edge=>edge.from===source.id&&edge.handle===handle.id))
    const place = source&&!at?{x:source.x+NODE_W+80,y:source.y}:{x:Math.round(position.x),y:Math.round(position.y)}
    const node:FlowNode = {id:newId("n"),type,...place,data:defaultNodeData(type)}
    const edge:FlowEdge|null = source&&free?{id:newId("e"),from:source.id,handle:free.id,to:node.id}:null
    update(current=>({nodes:[...current.nodes,node],edges:edge?[...current.edges,edge]:current.edges}))
    setSelected(node.id);setPanel("edit")
  },[flow,selected,toWorld,update])

  const deleteNode = useCallback((id:string)=>{
    const node = nodesById.get(id)
    if(!node||node.type==="start")return
    update(current=>({nodes:current.nodes.filter(item=>item.id!==id),edges:current.edges.filter(edge=>edge.from!==id&&edge.to!==id)}))
    setSelected(null)
  },[nodesById,update])

  const duplicateNode = useCallback((id:string)=>{
    const node = nodesById.get(id)
    if(!node||node.type==="start")return
    const data:FlowNodeData = JSON.parse(JSON.stringify(node.data))
    if(data.options)data.options = data.options.map(option=>({...option,id:newId("o")}))
    const copy:FlowNode = {...node,id:newId("n"),x:node.x+30,y:node.y+30,data}
    update(current=>({...current,nodes:[...current.nodes,copy]}))
    setSelected(copy.id)
  },[nodesById,update])

  useEffect(()=>{
    function onKey(event:KeyboardEvent){
      const target = event.target as HTMLElement
      if(["INPUT","TEXTAREA","SELECT"].includes(target.tagName))return
      if(event.key!=="Delete"&&event.key!=="Backspace")return
      if(selectedEdge){update(current=>({...current,edges:current.edges.filter(edge=>edge.id!==selectedEdge)}));setSelectedEdge(null)}
      else if(selected)deleteNode(selected)
    }
    window.addEventListener("keydown",onKey)
    return ()=>window.removeEventListener("keydown",onKey)
  },[selected,selectedEdge,deleteNode,update])

  useEffect(()=>{
    if(!drag)return
    function move(event:PointerEvent){
      if(!drag)return
      if(drag.kind==="pan"){setView(current=>({...current,x:drag.vx+event.clientX-drag.sx,y:drag.vy+event.clientY-drag.sy}));return}
      const point = toWorld(event.clientX,event.clientY)
      if(drag.kind==="node"){
        const x = Math.round(point.x-drag.dx), y = Math.round(point.y-drag.dy)
        setFlow(current=>({...current,nodes:current.nodes.map(node=>node.id===drag.id?{...node,x,y}:node)}))
        setDirty(true)
      }else setDrag({...drag,x:point.x,y:point.y})
    }
    function up(event:PointerEvent){
      if(drag?.kind==="connect"){
        const point = toWorld(event.clientX,event.clientY)
        const target = [...flow.nodes].reverse().find(node=>node.id!==drag.from&&node.type!=="start"&&
          point.x>=node.x-12&&point.x<=node.x+NODE_W&&point.y>=node.y-12&&point.y<=node.y+nodeHeight(node))
        if(target)update(current=>({...current,edges:[...current.edges.filter(edge=>!(edge.from===drag.from&&edge.handle===drag.handle)),
          {id:newId("e"),from:drag.from,handle:drag.handle,to:target.id}]}))
      }
      setDrag(null)
    }
    window.addEventListener("pointermove",move)
    window.addEventListener("pointerup",up)
    return ()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up)}
  },[drag,flow.nodes,toWorld,update])

  function zoomBy(factor:number,clientX?:number,clientY?:number){
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = (clientX??rect.left+rect.width/2)-rect.left, cy = (clientY??rect.top+rect.height/2)-rect.top
    setView(current=>{
      const zoom = Math.min(1.6,Math.max(0.35,current.zoom*factor))
      return {zoom,x:cx-(cx-current.x)*(zoom/current.zoom),y:cy-(cy-current.y)*(zoom/current.zoom)}
    })
  }

  function fitView(){
    const rect = canvasRef.current?.getBoundingClientRect()
    if(!rect||!flow.nodes.length)return
    const minX = Math.min(...flow.nodes.map(node=>node.x)), minY = Math.min(...flow.nodes.map(node=>node.y))
    const maxX = Math.max(...flow.nodes.map(node=>node.x+NODE_W)), maxY = Math.max(...flow.nodes.map(node=>node.y+nodeHeight(node)))
    const zoom = Math.min(1.1,Math.max(0.35,Math.min((rect.width-60)/(maxX-minX),(rect.height-60)/(maxY-minY))))
    setView({zoom,x:(rect.width-(maxX-minX)*zoom)/2-minX*zoom,y:(rect.height-(maxY-minY)*zoom)/2-minY*zoom})
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{fitView()},[])

  function setData(id:string,patch:Partial<FlowNodeData>){
    update(current=>({...current,nodes:current.nodes.map(node=>node.id===id?{...node,data:{...node.data,...patch}}:node)}))
  }

  function setOptions(node:FlowNode,options:FlowOption[]){
    const ids = new Set(options.map(option=>`opt:${option.id}`))
    update(current=>({
      nodes:current.nodes.map(item=>item.id===node.id?{...item,data:{...item.data,options}}:item),
      edges:current.edges.filter(edge=>edge.from!==node.id||ids.has(edge.handle)),
    }))
  }

  function save(){
    const clean = (list?:string[])=>(list||[]).map(item=>item.trim()).filter(Boolean)
    const cleaned:FlowGraph = {...flow,nodes:flow.nodes.map(node=>({...node,data:{...node.data,
      ...(node.data.keywords?{keywords:clean(node.data.keywords)}:{}),
      ...(node.data.addTags?{addTags:clean(node.data.addTags)}:{}),
      ...(node.data.removeTags?{removeTags:clean(node.data.removeTags)}:{}),
    }}))}
    setFlow(cleaned)
    onSave(name,cleaned)
    setDirty(false)
  }

  const connectFrom = drag?.kind==="connect"?nodesById.get(drag.from):undefined

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 104px)",minHeight:560}}>
      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <a href="/app/automation" style={{...smallBtn,textDecoration:"none"}}>← Flows</a>
        <input aria-label="Flow name" value={name} maxLength={80} onChange={event=>{setName(event.target.value);setDirty(true)}}
          style={{...field,width:280,fontSize:14,fontWeight:700}}/>
        {(()=>{
          const isActive = status==="ACTIVE"
          const blocked = !workflowId||!onToggleActive?"Save the flow first":dirty?"Save your changes first":errors.length&&!isActive?"Fix the issues first":""
          return <div title={blocked||(isActive?"Customers can trigger this flow":"This flow is off")} style={{display:"flex",alignItems:"center",gap:8,
            background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:"4px 10px 4px 12px"}}>
            <span style={{fontSize:12,fontWeight:600,color:isActive?"#94a3b8":"#0f172a"}}>Inactive</span>
            <button type="button" role="switch" aria-checked={isActive} aria-label="Flow active" disabled={Boolean(blocked)||toggling}
              onClick={()=>onToggleActive?.(!isActive)} style={{width:42,height:24,borderRadius:12,border:0,padding:2,cursor:blocked?"not-allowed":"pointer",
                background:isActive?"#25D366":"#cbd5e1",opacity:blocked?.55:1,transition:"background .15s"}}>
              <span style={{display:"block",width:20,height:20,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.25)",
                transform:isActive?"translateX(18px)":"none",transition:"transform .15s"}}/>
            </button>
            <span style={{fontSize:12,fontWeight:600,color:isActive?"#0f172a":"#94a3b8"}}>Active</span>
          </div>
        })()}
        <span style={{fontSize:11,color:errors.length?"#b45309":"#168253"}}>
          {errors.length?`${errors.length} issue${errors.length>1?"s":""} to fix`:"✓ Ready to enable"}</span>
        <div style={{flex:1}}/>
        <button onClick={()=>setPanel(panel==="preview"?"edit":"preview")} style={smallBtn}>
          {panel==="preview"?"✏️ Edit step":"▶ Test in preview"}</button>
        <button onClick={save} disabled={saving||name.trim().length<2} style={{border:0,borderRadius:6,padding:"9px 16px",
          background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",opacity:saving?.7:1}}>
          {saving?"Saving…":dirty?"Save flow":"Saved"}</button>
      </div>

      <div style={{flex:1,display:"grid",gridTemplateColumns:"212px minmax(0,1fr) 320px",gap:12,minHeight:0}}>
        {/* Palette */}
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:10,overflowY:"auto"}}>
          {([["message","Message types"],["action","Actions"]] as const).map(([group,title])=><div key={group} style={{marginBottom:14}}>
            <div style={{fontFamily:"Sora,sans-serif",fontSize:13,fontWeight:700,color:"#183633",margin:"2px 2px 8px",paddingBottom:6,borderBottom:"1px solid #eef2f1"}}>{title}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {(Object.keys(NODE_META) as FlowNodeType[]).filter(type=>NODE_META[type].group===group).map(type=>
                <button key={type} draggable onDragStart={event=>event.dataTransfer.setData("application/x-flow-node",type)}
                  onClick={()=>addNode(type)} title={NODE_META[type].hint}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,minHeight:66,textAlign:"center",
                    border:"1px solid #e2e8f0",borderRadius:8,background:"#fff",padding:"8px 4px",cursor:"grab",fontSize:11,lineHeight:1.2,color:"#183633",
                    boxShadow:"0 1px 2px rgba(15,23,42,.04)"}}>
                  <span style={{fontSize:17,color:NODE_META[type].color}}>{NODE_META[type].icon}</span><span>{NODE_META[type].label}</span>
                </button>)}
            </div>
          </div>)}
          <div style={{fontSize:10,color:"#71817e",lineHeight:1.5,marginTop:10}}>
            Drag a step onto the canvas, or click to add it after the selected step. Drag from a ● dot to another step to connect.
            Select a step or line and press Delete to remove it.
          </div>
        </div>

        {/* Canvas */}
        <div ref={canvasRef}
          onPointerDown={event=>{
            if(event.target!==event.currentTarget&&!(event.target as HTMLElement).dataset.canvas)return
            setSelected(null);setSelectedEdge(null)
            setDrag({kind:"pan",sx:event.clientX,sy:event.clientY,vx:view.x,vy:view.y})
          }}
          onWheel={event=>zoomBy(event.deltaY<0?1.1:1/1.1,event.clientX,event.clientY)}
          onDragOver={event=>event.preventDefault()}
          onDrop={event=>{
            const type = event.dataTransfer.getData("application/x-flow-node") as FlowNodeType
            if(type&&NODE_META[type])addNode(type,(()=>{const p = toWorld(event.clientX,event.clientY);return {x:p.x-NODE_W/2,y:p.y-20}})())
          }}
          style={{position:"relative",overflow:"hidden",borderRadius:8,border:"1px solid #e2e8f0",touchAction:"none",
            cursor:drag?.kind==="pan"?"grabbing":"grab",
            backgroundColor:"#f4f7f6",backgroundImage:"radial-gradient(#d3dedb 1px, transparent 1px)",
            backgroundSize:`${20*view.zoom}px ${20*view.zoom}px`,backgroundPosition:`${view.x}px ${view.y}px`}}>
          <div data-canvas="1" style={{position:"absolute",inset:0}}/>
          <div style={{position:"absolute",left:0,top:0,transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`,transformOrigin:"0 0"}}>
            <svg style={{position:"absolute",left:0,top:0,overflow:"visible",width:1,height:1}}>
              {flow.edges.map(edge=>{
                const from = nodesById.get(edge.from), to = nodesById.get(edge.to)
                if(!from||!to)return null
                const a = handlePoint(from,edge.handle), b = inputPoint(to)
                const active = selectedEdge===edge.id
                return <g key={edge.id}>
                  <path d={curve(a,b)} stroke="transparent" strokeWidth={14} fill="none" style={{cursor:"pointer",pointerEvents:"stroke"}}
                    onPointerDown={event=>{event.stopPropagation();setSelectedEdge(edge.id);setSelected(null)}}/>
                  <path d={curve(a,b)} stroke={active?"#dc2626":"#7c9a94"} strokeWidth={active?3:2} fill="none" pointerEvents="none"
                    markerEnd="url(#arrow)"/>
                </g>
              })}
              {drag?.kind==="connect"&&connectFrom&&<path d={curve(handlePoint(connectFrom,drag.handle),{x:drag.x,y:drag.y})}
                stroke="#075e54" strokeWidth={2} strokeDasharray="6 4" fill="none"/>}
              <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c9a94"/></marker></defs>
            </svg>
            {flow.nodes.map(node=>{
              const meta = NODE_META[node.type]
              const isSelected = selected===node.id
              return <div key={node.id}
                onPointerDown={event=>{
                  if((event.target as HTMLElement).dataset.handle)return
                  event.stopPropagation()
                  const point = toWorld(event.clientX,event.clientY)
                  setSelected(node.id);setSelectedEdge(null);setPanel("edit")
                  setDrag({kind:"node",id:node.id,dx:point.x-node.x,dy:point.y-node.y})
                }}
                style={{position:"absolute",left:node.x,top:node.y,width:NODE_W,background:"#fff",borderRadius:9,
                  border:`${isSelected?2:1}px solid ${isSelected?meta.color:"#d7e2df"}`,
                  boxShadow:isSelected?`0 6px 20px ${meta.color}33`:"0 2px 6px rgba(15,23,42,.06)",cursor:"move",userSelect:"none"}}>
                {node.type!=="start"&&<div style={{position:"absolute",left:-7,top:HEADER_H/2-7,width:14,height:14,borderRadius:"50%",
                  background:"#fff",border:`2px solid ${meta.color}`}}/>}
                <div style={{height:HEADER_H,display:"flex",alignItems:"center",gap:7,padding:"0 10px",borderBottom:"1px solid #eef2f1",
                  background:`${meta.color}12`,borderRadius:"8px 8px 0 0"}}>
                  <span style={{fontSize:13}}>{meta.icon}</span>
                  <span style={{fontSize:12,fontWeight:700,color:meta.color}}>{meta.label}</span>
                </div>
                <div style={{height:BODY_H,boxSizing:"border-box",padding:"7px 10px",fontSize:11,color:"#334155",lineHeight:1.4,
                  overflow:"hidden",whiteSpace:"pre-wrap",overflowWrap:"anywhere",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical"}}>
                  {preview(node)}
                </div>
                {nodeHandles(node).map(handle=>{
                  const connected = flow.edges.some(edge=>edge.from===node.id&&edge.handle===handle.id)
                  return <div key={handle.id} style={{height:ROW_H,position:"relative",display:"flex",alignItems:"center",justifyContent:"flex-end",
                    padding:"0 16px 0 10px",borderTop:"1px solid #f1f5f4",fontSize:11,color:"#475569"}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{handle.label||"Next"}</span>
                    <div data-handle="1" title="Drag to connect"
                      onPointerDown={event=>{
                        event.stopPropagation()
                        const point = toWorld(event.clientX,event.clientY)
                        setDrag({kind:"connect",from:node.id,handle:handle.id,x:point.x,y:point.y})
                      }}
                      style={{position:"absolute",right:-7,top:ROW_H/2-7,width:14,height:14,borderRadius:"50%",cursor:"crosshair",
                        background:connected?meta.color:"#fff",border:`2px solid ${meta.color}`}}/>
                  </div>
                })}
              </div>
            })}
          </div>
          {/* Zoom controls */}
          <div style={{position:"absolute",right:10,bottom:10,display:"flex",gap:4,background:"#fff",border:"1px solid #e2e8f0",
            borderRadius:8,padding:4}}>
            <button aria-label="Zoom out" onClick={()=>zoomBy(1/1.2)} style={smallBtn}>−</button>
            <span style={{fontSize:11,alignSelf:"center",minWidth:38,textAlign:"center",color:"#475569"}}>{Math.round(view.zoom*100)}%</span>
            <button aria-label="Zoom in" onClick={()=>zoomBy(1.2)} style={smallBtn}>+</button>
            <button onClick={fitView} style={smallBtn}>Fit</button>
          </div>
          {selectedEdge&&<button onClick={()=>{update(current=>({...current,edges:current.edges.filter(edge=>edge.id!==selectedEdge)}));setSelectedEdge(null)}}
            style={{...smallBtn,position:"absolute",left:10,bottom:10,color:"#b91c1c"}}>Delete connection</button>}
        </div>

        {/* Inspector / preview */}
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:14,overflowY:"auto",minHeight:0}}>
          {panel==="preview"?<FlowSimulator flow={flow}/>:selectedNode?
            <Inspector node={selectedNode} templates={templates} flows={otherFlows} iceBreakers={iceBreakers} setData={patch=>setData(selectedNode.id,patch)} setOptions={options=>setOptions(selectedNode,options)}
              onDelete={()=>deleteNode(selectedNode.id)} onDuplicate={()=>duplicateNode(selectedNode.id)}/>:
            <div>
              <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:"#183633",marginBottom:8}}>Flow checklist</div>
              {errors.length?<ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#92400e",lineHeight:1.6}}>
                {errors.map(error=><li key={error}>{error}</li>)}</ul>:
                <div style={{fontSize:12,color:"#166534"}}>Everything looks good. Save, then switch the flow to Active.</div>}
              <div style={{fontSize:11,color:"#71817e",lineHeight:1.6,marginTop:14}}>
                <strong>Personalize</strong> any text with <code>{"{{name}}"}</code>, <code>{"{{phone}}"}</code> or an answer saved by an
                Ask question step, e.g. <code>{"{{city}}"}</code>.<br/><br/>
                Customers can tap a button, pick from a list, or type the option&apos;s name or number. A flow waits up to 24 hours
                for a reply, matching WhatsApp&apos;s customer service window.
              </div>
            </div>}
        </div>
      </div>
    </div>
  )
}

function ListInput({value,onChange,placeholder}:{value:string[]|undefined;onChange:(value:string[])=>void;placeholder?:string}) {
  return <input value={(value||[]).join(", ")} placeholder={placeholder} style={field}
    onChange={event=>onChange(event.target.value.split(",").map((item,index,all)=>index<all.length-1?item.trim():item.trimStart()))}/>
}

function Inspector({node,templates,flows,iceBreakers,setData,setOptions,onDelete,onDuplicate}:{
  node:FlowNode;templates:TemplateOption[];flows:FlowOptionRef[];iceBreakers:string[];setData:(patch:Partial<FlowNodeData>)=>void;setOptions:(options:FlowOption[])=>void
  onDelete:()=>void;onDuplicate:()=>void
}) {
  const d = node.data
  const meta = NODE_META[node.type]
  const options = d.options||[]
  const maxOptions = node.type==="buttons"?3:10
  const maxTitle = node.type==="buttons"?20:24
  const textArea = (placeholder:string)=><textarea rows={5} maxLength={1024} value={d.text||""} placeholder={placeholder}
    onChange={event=>setData({text:event.target.value})} style={{...field,resize:"vertical"}}/>

  return <div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <span style={{fontSize:18}}>{meta.icon}</span>
      <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:meta.color}}>{meta.label}</div>
    </div>
    <div style={{fontSize:11,color:"#71817e"}}>{meta.hint}</div>

    {node.type==="start"&&<>
      <label style={label}>Start this flow when</label>
      <select value={d.triggerType||"KEYWORD"} onChange={event=>setData({triggerType:event.target.value as FlowNodeData["triggerType"]})} style={field}>
        <option value="KEYWORD">A customer sends a keyword or taps an ice breaker</option>
        <option value="WELCOME">Customer opens the chat for the first time (welcome)</option>
        <option value="AD">Customer clicks a Click-to-WhatsApp ad</option>
        <option value="ORDER">Customer sends a cart (order) from your catalog</option>
        <option value="ANY_MESSAGE">Any message arrives (catch-all)</option>
      </select>
      {d.triggerType==="WELCOME"&&<div style={{fontSize:10,color:"#71817e",marginTop:6,lineHeight:1.5}}>
        Runs when someone opens your WhatsApp chat for the first time, before they type. Turn on <strong>Welcome message</strong> under Flows → Ice breakers &amp; commands.</div>}
      {d.triggerType==="ORDER"&&<div style={{fontSize:10,color:"#71817e",marginTop:6,lineHeight:1.5}}>
        Runs when a customer sends a cart from your WhatsApp catalog. Use <code>{"{{order_id}}"}</code>, <code>{"{{order_total}}"}</code>, <code>{"{{order_items}}"}</code> and <code>{"{{order_count}}"}</code> in messages —
        e.g. ask for the delivery address, then send a payment link.</div>}
      {d.triggerType==="AD"&&<>
        <label style={label}>Only for these ad IDs (optional, comma separated)</label>
        <ListInput value={d.adIds} onChange={adIds=>setData({adIds})} placeholder="Leave empty for any ad"/>
        <div style={{fontSize:10,color:"#71817e",marginTop:6,lineHeight:1.5}}>Runs when a customer starts the chat from your ad — before keyword flows.
          A flow for specific ad IDs wins over an “any ad” flow. Find ad IDs in Ads Manager or in the inbox (“From ad”).</div>
      </>}
      {(d.triggerType||"KEYWORD")==="KEYWORD"&&<>
        <label style={label}>Keywords (comma separated)</label>
        <ListInput value={d.keywords} onChange={keywords=>setData({keywords})} placeholder="hi, hello, menu"/>
        {iceBreakers.length>0&&<div style={{marginTop:8}}>
          <div style={{fontSize:10,color:"#71817e",marginBottom:4}}>Your ice breakers — tap to start this flow from one:</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{iceBreakers.map(prompt=>{
            const added = (d.keywords||[]).some(keyword=>keyword.trim().toLowerCase()===prompt.toLowerCase())
            return <button key={prompt} type="button" disabled={added} onClick={()=>setData({keywords:[...(d.keywords||[]).filter(Boolean),prompt],match:"EXACT"})}
              style={{...smallBtn,fontSize:10,padding:"3px 7px",background:added?"#dcfce7":"#fff",color:added?"#15803d":"#183633"}}>{added?"✓ ":"+ "}{prompt}</button>
          })}</div>
        </div>}
        <label style={label}>Match</label>
        <select value={d.match||"EXACT"} onChange={event=>setData({match:event.target.value as "EXACT"|"CONTAINS"})} style={field}>
          <option value="EXACT">Message is exactly the keyword</option><option value="CONTAINS">Message contains the keyword</option>
        </select>
      </>}
      <div style={{fontSize:10,color:"#71817e",marginTop:8}}>Matching ignores upper/lower case. When several flows match, the one with the higher priority (older first) runs.</div>
    </>}

    {(node.type==="buttons"||node.type==="list")&&<>
      <label style={label}>Header (optional)</label>
      <input maxLength={60} value={d.header||""} onChange={event=>setData({header:event.target.value})} style={field}/>
    </>}
    {["message","buttons","list","question","askLocation","askMedia"].includes(node.type)&&<>
      <label style={label}>{node.type==="question"?"Question":node.type==="askLocation"||node.type==="askMedia"?"Message to the customer":"Message"}</label>
      {textArea(node.type==="question"?"What's your email address?":"Hi {{name}}, …")}
    </>}
    {(node.type==="buttons"||node.type==="list")&&<>
      <label style={label}>Footer (optional)</label>
      <input maxLength={60} value={d.footer||""} onChange={event=>setData({footer:event.target.value})} style={field}/>
      {node.type==="list"&&<><label style={label}>Menu button label</label>
        <input maxLength={20} value={d.buttonLabel||""} onChange={event=>setData({buttonLabel:event.target.value})} style={field}/></>}
      <label style={label}>{node.type==="buttons"?`Buttons (max ${maxOptions})`:`Options (max ${maxOptions})`}</label>
      {options.map((option,index)=><div key={option.id} style={{marginBottom:6,padding:6,border:"1px solid #eef2f1",borderRadius:6}}>
        <div style={{display:"flex",gap:5}}>
          <input aria-label={`Option ${index+1}`} maxLength={maxTitle} value={option.title} style={field}
            onChange={event=>setOptions(options.map(item=>item.id===option.id?{...item,title:event.target.value}:item))}/>
          <button aria-label="Remove option" onClick={()=>setOptions(options.filter(item=>item.id!==option.id))} style={{...smallBtn,color:"#b91c1c"}}>✕</button>
        </div>
        {node.type==="list"&&<input placeholder="Description (optional)" maxLength={72} value={option.description||""}
          onChange={event=>setOptions(options.map(item=>item.id===option.id?{...item,description:event.target.value}:item))}
          style={{...field,marginTop:5,minHeight:30}}/>}
      </div>)}
      {options.length<maxOptions&&<button onClick={()=>setOptions([...options,{id:newId("o"),title:`Option ${options.length+1}`}])}
        style={smallBtn}>+ Add {node.type==="buttons"?"button":"option"}</button>}
      <div style={{fontSize:10,color:"#71817e",marginTop:6}}>Each {node.type==="buttons"?"button":"option"} gets its own exit on the canvas. Titles up to {maxTitle} characters.</div>
    </>}

    {node.type==="question"&&<>
      <label style={label}>Save answer as attribute</label>
      <input value={d.attribute||""} maxLength={40} placeholder="city" style={field}
        onChange={event=>setData({attribute:event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_")})}/>
      <div style={{fontSize:10,color:"#71817e",marginTop:4}}>Use <code>name</code> or <code>email</code> to also update the contact&apos;s name or email.</div>
      <label style={label}>Expected answer</label>
      <select value={d.validation||"TEXT"} onChange={event=>setData({validation:event.target.value as FlowNodeData["validation"]})} style={field}>
        <option value="TEXT">Any text</option><option value="NUMBER">Number</option><option value="EMAIL">Email</option><option value="PHONE">Phone number</option>
      </select>
      <label style={label}>Message when the answer is invalid</label>
      <input maxLength={300} value={d.errorText||""} onChange={event=>setData({errorText:event.target.value})} style={field}/>
    </>}

    {node.type==="condition"&&<>
      <label style={label}>Check</label>
      <select value={d.source||"LAST_REPLY"} onChange={event=>setData({source:event.target.value as FlowNodeData["source"]})} style={field}>
        <option value="LAST_REPLY">Customer&apos;s last reply</option><option value="ATTRIBUTE">Saved attribute</option><option value="TAG">Contact tag</option>
      </select>
      {d.source==="ATTRIBUTE"&&<><label style={label}>Attribute</label>
        <input value={d.attribute||""} placeholder="city" style={field}
          onChange={event=>setData({attribute:event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_")})}/></>}
      {d.source!=="TAG"&&<><label style={label}>Operator</label>
        <select value={d.operator||"EQUALS"} onChange={event=>setData({operator:event.target.value as FlowNodeData["operator"]})} style={field}>
          <option value="EQUALS">equals</option><option value="CONTAINS">contains</option><option value="EXISTS">is not empty</option>
        </select></>}
      {(d.operator!=="EXISTS"||d.source==="TAG")&&<><label style={label}>{d.source==="TAG"?"Tag":"Value"}</label>
        <input value={d.value||""} maxLength={100} onChange={event=>setData({value:event.target.value})} style={field}/></>}
      <div style={{fontSize:10,color:"#71817e",marginTop:6}}>Matching ignores upper/lower case. Connect both the Yes and No exits.</div>
    </>}

    {node.type==="tag"&&<>
      <label style={label}>Add tags</label>
      <ListInput value={d.addTags} onChange={addTags=>setData({addTags})} placeholder="lead, interested"/>
      <label style={label}>Remove tags</label>
      <ListInput value={d.removeTags} onChange={removeTags=>setData({removeTags})} placeholder="cold"/>
      <div style={{fontSize:10,color:"#71817e",marginTop:6}}>Tags appear in Contacts and can be used as campaign audiences.</div>
    </>}

    {node.type==="media"&&<>
      <label style={label}>Media type</label>
      <select value={d.mediaType||"image"} onChange={event=>setData({mediaType:event.target.value as FlowNodeData["mediaType"]})} style={field}>
        <option value="image">Image (JPG/PNG)</option><option value="video">Video (MP4)</option><option value="document">Document (PDF)</option>
      </select>
      <label style={label}>Public file URL</label>
      <input value={d.url||""} placeholder="https://example.com/brochure.pdf" onChange={event=>setData({url:event.target.value.trim()})} style={field}/>
      {d.mediaType==="document"&&<><label style={label}>File name shown to customer</label>
        <input value={d.filename||""} maxLength={100} placeholder="Brochure.pdf" onChange={event=>setData({filename:event.target.value})} style={field}/></>}
      <label style={label}>Caption (optional)</label>
      {textArea("Here is our latest catalogue 📘")}
    </>}

    {(node.type==="askLocation"||node.type==="askMedia")&&<>
      <label style={label}>Save as attribute</label>
      <input value={d.attribute||""} maxLength={40} placeholder="city" style={field}
        onChange={event=>setData({attribute:event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_")})}/>
      <div style={{fontSize:10,color:"#71817e",marginTop:4}}>{node.type==="askLocation"
        ?<>Saves “latitude,longitude” and the address in <code>{`{{${d.attribute||"location"}_address}}`}</code>. Customers get WhatsApp&apos;s Send location button.</>
        :<>Saves the WhatsApp media ID; the type is in <code>{`{{${d.attribute||"photo"}_type}}`}</code> and any caption in <code>{`{{${d.attribute||"photo"}_caption}}`}</code>.</>}</div>
      <label style={label}>Message if they reply with something else</label>
      <input maxLength={300} value={d.errorText||""} onChange={event=>setData({errorText:event.target.value})} style={field}/>
    </>}

    {node.type==="setAttribute"&&<>
      <label style={label}>Attribute</label>
      <input value={d.attribute||""} maxLength={40} placeholder="city" style={field}
        onChange={event=>setData({attribute:event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_")})}/>
      <label style={label}>Value</label>
      <input maxLength={500} value={d.value||""} placeholder="interested or {{city}}" onChange={event=>setData({value:event.target.value})} style={field}/>
      <div style={{fontSize:10,color:"#71817e",marginTop:4}}>Use <code>name</code> or <code>email</code> to update the contact itself. Values can include other attributes.</div>
    </>}

    {node.type==="template"&&(()=>{
      const chosen = templates.find(item=>item.id===d.templateId)
      const count = new Set([...(chosen?.content||"").matchAll(/\{\{(\d+)\}\}/g)].map(match=>match[1])).size
      return <>
        <label style={label}>Approved template</label>
        <select value={d.templateId||""} style={field} onChange={event=>{
          const item = templates.find(template=>template.id===event.target.value)
          setData({templateId:item?.id,templateName:item?`${item.name} · ${item.language}`:undefined,parameters:[]})
        }}>
          <option value="">{templates.length?"Choose a template":"No approved templates yet"}</option>
          {templates.map(item=><option key={item.id} value={item.id}>{item.name} · {item.language}</option>)}
        </select>
        {chosen?.content&&<div style={{fontSize:11,color:"#334155",background:"#f8fafc",borderRadius:6,padding:8,marginTop:8,whiteSpace:"pre-wrap"}}>{chosen.content}</div>}
        {Array.from({length:count},(_,index)=><div key={index}>
          <label style={label}>{`Variable {{${index+1}}}`}</label>
          <input value={d.parameters?.[index]||""} placeholder={index===0?"{{name}}":"Value or {{attribute}}"} style={field}
            onChange={event=>{const parameters = [...(d.parameters||[])];parameters[index] = event.target.value;setData({parameters})}}/>
        </div>)}
        <div style={{fontSize:10,color:"#71817e",marginTop:6}}>Templates can be sent even after the 24-hour reply window closes.</div>
      </>
    })()}

    {node.type==="apiRequest"&&<>
      <label style={label}>Method</label>
      <select value={d.method||"POST"} onChange={event=>setData({method:event.target.value as "GET"|"POST"})} style={field}>
        <option value="POST">POST (send JSON)</option><option value="GET">GET</option>
      </select>
      <label style={label}>URL (https only)</label>
      <input value={d.url||""} placeholder="https://api.example.com/leads?phone={{phone}}" onChange={event=>setData({url:event.target.value.trim()})} style={field}/>
      {d.method!=="GET"&&<><label style={label}>JSON body</label>
        <textarea rows={4} value={d.body||""} onChange={event=>setData({body:event.target.value})} style={{...field,resize:"vertical",fontFamily:"monospace"}}/></>}
      <label style={label}>Save response as attribute (optional)</label>
      <input value={d.attribute||""} maxLength={40} placeholder="api_result" style={field}
        onChange={event=>setData({attribute:event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_")})}/>
      <label style={label}>Response field to save (optional)</label>
      <input value={d.responsePath||""} placeholder="data.order.status" onChange={event=>setData({responsePath:event.target.value.trim()})} style={field}/>
      <div style={{fontSize:10,color:"#71817e",marginTop:6}}>Times out after 8 seconds. 2xx responses follow the Success exit, anything else Failed. Private and internal addresses are blocked.</div>
    </>}

    {node.type==="products"&&<>
      <label style={label}>Header (product lists)</label>
      <input value={d.header||""} maxLength={60} onChange={event=>setData({header:event.target.value})} style={field}/>
      <label style={label}>Message</label>
      <textarea value={d.text||""} maxLength={1024} rows={3} onChange={event=>setData({text:event.target.value})} style={{...field,resize:"vertical"}}/>
      <label style={label}>Product SKUs / content IDs (comma separated, up to 30)</label>
      <ListInput value={d.productIds} onChange={productIds=>setData({productIds})} placeholder="Leave empty to send the whole catalog"/>
      <div style={{fontSize:10,color:"#71817e",marginTop:6,lineHeight:1.5}}>One SKU sends a single product card; several send a product list; none sends a “View catalog” button.
        Find SKUs under Commerce → Catalog. Customers add items to their cart and send it to you as an order.</div>
    </>}

    {node.type==="delay"&&(()=>{
      const minutes = Number(d.delayMinutes)||1
      const unit = minutes>=60&&minutes%60===0?"hours":"minutes"
      return <>
        <label style={label}>Wait for</label>
        <div style={{display:"flex",gap:6}}>
          <input type="number" min={1} max={unit==="hours"?23:1380} value={unit==="hours"?minutes/60:minutes} style={{...field,width:90}}
            onChange={event=>setData({delayMinutes:Math.max(1,Number(event.target.value)||1)*(unit==="hours"?60:1)})}/>
          <select value={unit} style={field} onChange={event=>setData({delayMinutes:event.target.value==="hours"?Math.max(1,Math.round(minutes/60))*60:minutes})}>
            <option value="minutes">minutes</option><option value="hours">hours</option></select>
        </div>
        <div style={{fontSize:10,color:"#71817e",marginTop:6,lineHeight:1.5}}>Up to 23 hours, so the next message is still inside WhatsApp&apos;s 24-hour reply window.
          If the customer starts another flow during the wait, the wait is cancelled.</div>
      </>
    })()}

    {node.type==="connectFlow"&&<>
      <label style={label}>Continue in flow</label>
      <select value={d.targetFlowId||""} style={field} onChange={event=>{
        const item = flows.find(flow=>flow.id===event.target.value)
        setData({targetFlowId:item?.id,targetFlowName:item?.name})
      }}>
        <option value="">{flows.length?"Choose a flow":"No other flows yet"}</option>
        {flows.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div style={{fontSize:10,color:"#71817e",marginTop:6}}>The customer continues from that flow&apos;s start. It can be Inactive — useful for shared sub-flows.</div>
    </>}

    {node.type==="handoff"&&<>
      <label style={label}>Note for your team</label>
      <input maxLength={200} value={d.note||""} onChange={event=>setData({note:event.target.value})} style={field}/>
      <div style={{fontSize:10,color:"#71817e",marginTop:6}}>The bot stops and your team gets a notification. Add a Send message step before this to tell the customer someone will reply.</div>
    </>}

    {node.type!=="start"&&<div style={{display:"flex",gap:6,marginTop:16,paddingTop:12,borderTop:"1px solid #eef2f1"}}>
      <button onClick={onDuplicate} style={smallBtn}>Duplicate</button>
      <button onClick={onDelete} style={{...smallBtn,color:"#b91c1c"}}>Delete step</button>
    </div>}
  </div>
}

