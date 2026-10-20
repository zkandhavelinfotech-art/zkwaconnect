"use client"
import { Suspense, useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { FlowBuilder } from "@/components/flows/FlowBuilder"
import { FLOW_PRESETS } from "@/lib/flows/presets"
import { starterFlow, type FlowGraph } from "@/lib/flows/types"

type Workflow = { id:string; name:string; status:string; flow:FlowGraph|null }

export default function FlowBuilderPage() {
  return <Suspense fallback={<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading flow builder…</div>}><FlowBuilderScreen/></Suspense>
}

function FlowBuilderScreen() {
  const { id } = useParams<{id:string}>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isNew = id==="new"
  const [workflow,setWorkflow] = useState<Workflow|null>(null)
  const [error,setError] = useState("")
  const [notice,setNotice] = useState("")
  const [saving,setSaving] = useState(false)
  const [toggling,setToggling] = useState(false)

  useEffect(()=>{
    if(isNew){
      const preset = FLOW_PRESETS.find(item=>item.id===searchParams.get("preset"))
      setWorkflow({id:"",name:preset?.name||"New chatbot flow",status:"DRAFT",
        flow:preset?JSON.parse(JSON.stringify(preset.flow)):starterFlow()})
      return
    }
    let active = true
    fetch("/api/workflows").then(async response=>{
      const data = await response.json()
      if(!response.ok)throw new Error(data.error||"Could not load flow.")
      const found = (data.workflows as Workflow[]).find(item=>item.id===id)
      if(!found)throw new Error("Flow not found.")
      if(!found.flow)throw new Error("This is a quick keyword reply, not a flow. Edit it from the Flows page.")
      if(active)setWorkflow(found)
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load flow.")})
    return ()=>{active=false}
  },[id,isNew,searchParams])

  async function save(name:string,flow:FlowGraph){
    setSaving(true);setError("");setNotice("")
    try{
      const response = await fetch("/api/workflows",{method:isNew?"POST":"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(isNew?{name,flow}:{id,name,flow})})
      const data = await response.json()
      if(!response.ok)throw new Error(data.error||"Could not save flow.")
      setNotice(data.message||"Flow saved.")
      if(isNew)router.replace(`/app/automation/flows/${data.workflow.id}`)
      else setWorkflow(current=>current&&{...current,name,flow})
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not save flow.")}
    finally{setSaving(false)}
  }

  async function toggleActive(enable:boolean){
    if(!workflow?.id)return
    setToggling(true);setError("");setNotice("")
    try{
      const response = await fetch("/api/workflows",{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:workflow.id,action:enable?"enable":"pause"})})
      const data = await response.json()
      if(!response.ok)throw new Error(data.error||"Could not change the flow status.")
      setWorkflow(current=>current&&{...current,status:data.workflow.status})
      setNotice(enable?"Flow is Active — customers can trigger it now.":"Flow is Inactive.")
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not change the flow status.")}
    finally{setToggling(false)}
  }

  return <div>
    {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:10,fontSize:13}}>{error}</div>}
    {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:10,fontSize:13}}>{notice}</div>}
    {workflow?.flow?<FlowBuilder key={workflow.id||"new"} initialName={workflow.name} initialFlow={workflow.flow}
      status={isNew?undefined:workflow.status} saving={saving} onSave={save}
      workflowId={isNew?undefined:workflow.id} onToggleActive={isNew?undefined:toggleActive} toggling={toggling}/>:
      !error&&<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading flow builder…</div>}
  </div>
}
