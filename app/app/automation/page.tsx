"use client"
import { useEffect,useState } from "react"
import Link from "next/link"
import { FLOW_PRESETS } from "@/lib/flows/presets"
import { IceBreakers } from "@/components/flows/IceBreakers"
import type { FlowGraph } from "@/lib/flows/types"

type Workflow={id:string;name:string;triggerType:string;triggerValue:string;replyText:string;handoffToHuman:boolean;status:string;priority:number;createdAt:string;updatedAt:string;flow:FlowGraph|null}
const fieldStyle:React.CSSProperties={width:"100%",boxSizing:"border-box",minHeight:40,padding:"8px 10px",
  border:"1px solid #cbd5d3",borderRadius:6,fontSize:13,color:"#183633",background:"#fff"}
const actionStyle:React.CSSProperties={border:"1px solid #e2e8f0",borderRadius:4,padding:"6px 8px",background:"#fff",color:"#365b57",
  fontSize:10,fontWeight:700,cursor:"pointer",marginRight:6,textDecoration:"none",display:"inline-block"}

export default function AutomationPage() {
  const [workflows,setWorkflows]=useState<Workflow[]>([])
  const [name,setName]=useState("")
  const [triggerType,setTriggerType]=useState<"KEYWORD"|"ANY_MESSAGE">("KEYWORD")
  const [triggerValue,setTriggerValue]=useState("")
  const [replyText,setReplyText]=useState("")
  const [handoff,setHandoff]=useState(false)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [workingId,setWorkingId]=useState("")
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{
    let active=true
    setLoading(true)
    fetch("/api/workflows").then(async response=>{
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not load workflows.")
      if(active)setWorkflows(data.workflows||[])
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load workflows.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[refresh])

  const flows=workflows.filter(workflow=>workflow.flow)
  const rules=workflows.filter(workflow=>!workflow.flow)

  async function createWorkflow(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");setNotice("")
    try{
      const response=await fetch("/api/workflows",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,triggerType,triggerValue:triggerType==="KEYWORD"?triggerValue:"",replyText,handoffToHuman:handoff})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not save workflow.")
      setNotice(data.message);setName("");setTriggerValue("");setReplyText("");setHandoff(false);setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save workflow.")}
    finally{setBusy(false)}
  }

  async function updateWorkflow(id:string,action:"enable"|"pause"|"delete"|"duplicate"){
    if(action==="delete"&&!window.confirm("Delete this automation? This cannot be undone."))return
    setWorkingId(id);setError("");setNotice("")
    try{
      const response=await fetch("/api/workflows",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not update workflow.")
      setNotice(action==="delete"?"Deleted.":action==="duplicate"?"Copy created (paused).":`${action==="enable"?"Enabled":"Paused"}.`)
      setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not update workflow.")}
    finally{setWorkingId("")}
  }

  function triggerLabel(workflow:Workflow){
    return workflow.triggerType==="ANY_MESSAGE"?"Any message":`“${workflow.triggerValue}”`
  }

  function statusButtons(workflow:Workflow){
    return <>
      <button disabled={workingId===workflow.id} onClick={()=>updateWorkflow(workflow.id,workflow.status==="ACTIVE"?"pause":"enable")}
        style={{...actionStyle,border:0,background:workflow.status==="ACTIVE"?"#edf3f1":"#075e54",color:workflow.status==="ACTIVE"?"#365b57":"#fff"}}>
        {workflow.status==="ACTIVE"?"Pause":"Enable"}</button>
      <button disabled={workingId===workflow.id} onClick={()=>updateWorkflow(workflow.id,"duplicate")} style={actionStyle}>Duplicate</button>
      <button disabled={workingId===workflow.id} onClick={()=>updateWorkflow(workflow.id,"delete")} style={{...actionStyle,color:"#8b2c22"}}>Delete</button>
    </>
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Chatbot flows</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Build no-code WhatsApp chatbots with a drag-and-drop flow builder. Qualify leads, answer FAQs and route to your team 24×7.</p>
        </div>
        <Link href="/app/automation/flows/new" style={{background:"#075e54",color:"#fff",textDecoration:"none",borderRadius:6,padding:"10px 14px",fontSize:12,fontWeight:700}}>
          + Create flow</Link>
      </div>

      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      <IceBreakers />

      <section style={{marginBottom:18}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"#71817e",marginBottom:8}}>Start from a ready-made flow</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:12}}>
          {FLOW_PRESETS.map(preset=><Link key={preset.id} href={`/app/automation/flows/new?preset=${preset.id}`}
            style={{display:"block",textDecoration:"none",background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:16}}>
            <div style={{fontSize:20}}>{preset.icon}</div>
            <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:"#183633",marginTop:6}}>{preset.name}</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:4,lineHeight:1.5}}>{preset.description}</div>
            <div style={{fontSize:11,color:"#075e54",fontWeight:700,marginTop:8}}>Use this flow →</div>
          </Link>)}
        </div>
      </section>

      <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden",marginBottom:18}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e8efee"}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#183633"}}>Your flows</h2>
        </div>
        {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading flows…</div>:flows.length?
          <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:720,borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
            <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Flow","Trigger","Steps","State","Updated","Actions"].map(label=><th key={label} style={{padding:11,fontWeight:600}}>{label}</th>)}</tr></thead>
            <tbody>{flows.map(workflow=><tr key={workflow.id} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:11,fontWeight:700}}><Link href={`/app/automation/flows/${workflow.id}`} style={{color:"#183633"}}>{workflow.name}</Link></td>
              <td style={{padding:11,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{triggerLabel(workflow)}</td>
              <td style={{padding:11}}>{workflow.flow!.nodes.length}</td>
              <td style={{padding:11,color:workflow.status==="ACTIVE"?"#168253":"#9a6700"}}>{workflow.status}</td>
              <td style={{padding:11,color:"#647b77"}}>{new Date(workflow.updatedAt).toLocaleDateString()}</td>
              <td style={{padding:11,whiteSpace:"nowrap"}}>
                <Link href={`/app/automation/flows/${workflow.id}`} style={actionStyle}>Edit</Link>{statusButtons(workflow)}
              </td>
            </tr>)}</tbody>
          </table></div>:<div style={{padding:22,fontSize:12,color:"#71817e"}}>No flows yet. Create one or start from a ready-made flow above.</div>}
      </section>

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:16,alignItems:"start"}}>
        <form onSubmit={createWorkflow} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20}}>
          <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 4px",color:"#183633"}}>Quick keyword reply</h2>
          <p style={{fontSize:11,color:"#71817e",margin:"0 0 14px"}}>A one-step auto-reply. Use a flow for buttons, questions and branching.</p>
          <label style={{display:"block",marginBottom:12}}><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Name</span>
            <input required minLength={2} maxLength={80} value={name} onChange={event=>setName(event.target.value)} style={fieldStyle}/></label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:12}}>
            <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>When</span>
              <select value={triggerType} onChange={event=>setTriggerType(event.target.value as "KEYWORD"|"ANY_MESSAGE")} style={fieldStyle}>
                <option value="KEYWORD">Message contains keyword</option><option value="ANY_MESSAGE">Any inbound text message</option>
              </select></label>
            {triggerType==="KEYWORD"&&<label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Keyword</span>
              <input required minLength={2} maxLength={100} value={triggerValue} onChange={event=>setTriggerValue(event.target.value)} placeholder="pricing" style={fieldStyle}/></label>}
          </div>
          <label style={{display:"block",marginTop:12}}><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Then reply</span>
            <textarea required maxLength={1000} rows={3} value={replyText} onChange={event=>setReplyText(event.target.value)}
              placeholder="Hi {{name}}, here is our current pricing…" style={{...fieldStyle,minHeight:80,resize:"vertical"}}/></label>
          <div style={{display:"flex",alignItems:"center",gap:9,marginTop:12}}>
            <input id="handoff" type="checkbox" checked={handoff} onChange={event=>setHandoff(event.target.checked)}/>
            <label htmlFor="handoff" style={{fontSize:12,color:"#526763"}}>Flag conversation for human follow-up</label>
          </div>
          <button type="submit" disabled={busy} style={{marginTop:14,border:0,borderRadius:6,padding:"10px 14px",
            background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{busy?"Saving…":"Save paused reply"}</button>
        </form>

        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid #e8efee"}}>
            <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#183633"}}>Keyword replies</h2>
          </div>
          {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading…</div>:rules.length?
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
              <tbody>{rules.map(workflow=><tr key={workflow.id} style={{borderTop:"1px solid #edf1f0"}}>
                <td style={{padding:11}}><div style={{fontWeight:700,color:"#183633"}}>{workflow.name}</div>
                  <div style={{fontSize:11,color:"#71817e",marginTop:2}}>{triggerLabel(workflow)} → {workflow.replyText.slice(0,60)}{workflow.replyText.length>60?"…":""}</div></td>
                <td style={{padding:11,color:workflow.status==="ACTIVE"?"#168253":"#9a6700"}}>{workflow.status}</td>
                <td style={{padding:11,whiteSpace:"nowrap"}}>{statusButtons(workflow)}</td>
              </tr>)}</tbody>
            </table></div>:<div style={{padding:22,fontSize:12,color:"#71817e"}}>No keyword replies yet.</div>}
        </div>
      </section>
    </div>
  )
}
