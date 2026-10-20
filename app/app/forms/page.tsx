"use client"
import { useEffect,useState } from "react"

type Field={key:string;label:string;type:"TEXT"|"EMAIL"|"PHONE"|"LONG_TEXT"|"SELECT"|"WHATSAPP_CONSENT";required:boolean;options:string[]}
type FormRecord={id:string;slug:string;name:string;title:string;description:string|null;status:string;metaFlowId:string|null;
  waba:{name:string}|null;_count:{submissions:number};submissions:{id:string;values:Record<string,unknown>;whatsappConsent:boolean;submittedAt:string}[]}
type Waba={id:string;name:string;wabaId:string}
const baseField:Field={key:"",label:"",type:"TEXT",required:false,options:[]}
const inputStyle:React.CSSProperties={width:"100%",boxSizing:"border-box",minHeight:40,padding:"8px 10px",
  border:"1px solid #cbd5d3",borderRadius:6,fontSize:13,color:"#183633",background:"#fff"}

export default function FormsPage(){
  const [forms,setForms]=useState<FormRecord[]>([])
  const [wabas,setWabas]=useState<Waba[]>([])
  const [name,setName]=useState("")
  const [title,setTitle]=useState("")
  const [description,setDescription]=useState("")
  const [wabaId,setWabaId]=useState("")
  const [fields,setFields]=useState<Field[]>([
    {key:"full_name",label:"Full name",type:"TEXT",required:true,options:[]},
    {key:"phone",label:"Phone number",type:"PHONE",required:true,options:[]},
    {key:"whatsapp_consent",label:"I agree to receive WhatsApp messages",type:"WHATSAPP_CONSENT",required:false,options:[]},
  ])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [workingId,setWorkingId]=useState("")
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{
    let active=true
    fetch("/api/forms").then(async response=>{
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not load forms.")
      if(active){setForms(data.forms||[]);setWabas(data.wabas||[])}
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load forms.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[refresh])

  function updateField(index:number,patch:Partial<Field>){setFields(current=>current.map((field,i)=>i===index?{...field,...patch}:field))}

  async function createForm(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");setNotice("")
    try{
      const response=await fetch("/api/forms",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,title,description,wabaId:wabaId||undefined,fields})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not create form.")
      setNotice(`Form published: ${window.location.origin}${data.publicUrl}`)
      setName("");setTitle("");setDescription("");setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not create form.")}
    finally{setBusy(false)}
  }

  async function flowAction(formId:string,action:"create_meta_flow"|"publish_meta_flow"){
    setWorkingId(formId);setError("");setNotice("")
    try{
      const response=await fetch("/api/forms",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({formId,action})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Meta Flow action failed.")
      setNotice(data.message);setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Meta Flow action failed.")}
    finally{setWorkingId("")}
  }

  return <div>
    <div style={{marginBottom:20}}>
      <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>WhatsApp Forms</h1>
      <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Build hosted forms or create native WhatsApp Flows. No AI required.</p>
    </div>
    {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
    {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13,overflowWrap:"anywhere"}}>{notice}</div>}

    <form onSubmit={createForm} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20,marginBottom:18}}>
      <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 14px",color:"#183633"}}>Create a hosted form</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:11}}>
        <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:5}}>Internal name</span><input required value={name} onChange={event=>setName(event.target.value)} style={inputStyle}/></label>
        <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:5}}>Form title</span><input required value={title} onChange={event=>setTitle(event.target.value)} style={inputStyle}/></label>
        <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:5}}>Native Flow WABA (optional)</span>
          <select value={wabaId} onChange={event=>setWabaId(event.target.value)} style={inputStyle}><option value="">Hosted only</option>{wabas.map(waba=><option key={waba.id} value={waba.id}>{waba.name}</option>)}</select></label>
      </div>
      <label style={{display:"block",marginTop:11}}><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:5}}>Description</span>
        <input value={description} maxLength={300} onChange={event=>setDescription(event.target.value)} style={inputStyle}/></label>

      <h3 style={{fontSize:12,color:"#526763",margin:"18px 0 8px"}}>Fields</h3>
      <div style={{display:"grid",gap:8}}>{fields.map((field,index)=><div key={index} style={{display:"grid",
        gridTemplateColumns:"minmax(120px,1fr) minmax(120px,1.2fr) minmax(130px,1fr) auto auto",gap:8,alignItems:"center"}}>
        <input aria-label="Field key" required pattern="[a-z][a-z0-9_]{1,39}" placeholder="field_key" value={field.key}
          onChange={event=>updateField(index,{key:event.target.value})} style={inputStyle}/>
        <input aria-label="Field label" required placeholder="Field label" value={field.label}
          onChange={event=>updateField(index,{label:event.target.value})} style={inputStyle}/>
        <select aria-label="Field type" value={field.type} onChange={event=>updateField(index,{type:event.target.value as Field["type"]})} style={inputStyle}>
          <option value="TEXT">Short text</option><option value="LONG_TEXT">Long text</option><option value="EMAIL">Email</option>
          <option value="PHONE">Phone</option><option value="SELECT">Dropdown</option><option value="WHATSAPP_CONSENT">WhatsApp consent</option>
        </select>
        {field.type!=="WHATSAPP_CONSENT"?<label style={{fontSize:10,color:"#526763",whiteSpace:"nowrap"}}><input type="checkbox" checked={field.required} onChange={event=>updateField(index,{required:event.target.checked})}/> Required</label>:<span/>}
        <button type="button" aria-label="Remove field" onClick={()=>setFields(current=>current.filter((_,i)=>i!==index))}
          style={{border:"1px solid #e2e8f0",borderRadius:5,padding:"7px 9px",background:"#fff",color:"#8b2c22",cursor:"pointer"}}>Remove</button>
        {field.type==="SELECT"&&<input aria-label="Dropdown options" placeholder="Options, comma separated" value={field.options.join(", ")}
          onChange={event=>updateField(index,{options:event.target.value.split(",").map(option=>option.trim()).filter(Boolean)})}
          style={{...inputStyle,gridColumn:"1 / -2"}}/>}
      </div>)}</div>
      <button type="button" onClick={()=>setFields(current=>[...current,{...baseField,key:`field_${current.length+1}`,label:"New field"}])}
        style={{marginTop:10,border:"1px solid #cbd5d3",borderRadius:5,padding:"8px 11px",background:"#fff",color:"#365b57",fontSize:11,fontWeight:700,cursor:"pointer"}}>Add field</button>
      <div><button type="submit" disabled={busy||fields.length===0} style={{marginTop:12,border:0,borderRadius:6,padding:"9px 13px",
        background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{busy?"Creating…":"Publish hosted form"}</button></div>
    </form>

    <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid #e8efee"}}><h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#183633"}}>Forms and submissions</h2></div>
      {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading forms…</div>:forms.length?
        <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:760,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Form","Status","WABA","Submissions","Share","Native Flow"].map(label=><th key={label} style={{padding:11,fontWeight:600}}>{label}</th>)}</tr></thead>
          <tbody>{forms.map(form=><tr key={form.id} style={{borderTop:"1px solid #edf1f0"}}>
            <td style={{padding:11,fontWeight:700,color:"#183633"}}>{form.title}<div style={{fontSize:10,color:"#71817e",marginTop:3}}>{form.name}</div></td>
            <td style={{padding:11}}>{form.status}</td><td style={{padding:11}}>{form.waba?.name||"Hosted"}</td>
            <td style={{padding:11}}>{form._count.submissions}</td>
            <td style={{padding:11}}><a href={`/forms/${form.slug}`} target="_blank" rel="noreferrer" style={{color:"#087763",fontWeight:700}}>Open form</a></td>
            <td style={{padding:11,whiteSpace:"nowrap"}}>{form.metaFlowId? <button disabled={workingId===form.id||form.status==="PUBLISHED"} onClick={()=>flowAction(form.id,"publish_meta_flow")}
              style={{border:0,borderRadius:4,padding:"7px 9px",background:"#0e8b71",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>{form.status==="PUBLISHED"?"Published":"Publish Flow"}</button>
              :form.waba?<button disabled={workingId===form.id} onClick={()=>flowAction(form.id,"create_meta_flow")}
                style={{border:"1px solid #cbd5d3",borderRadius:4,padding:"6px 8px",background:"#fff",color:"#365b57",fontSize:10,cursor:"pointer"}}>Create Meta Flow</button>:"Connect WABA"}</td>
          </tr>)}</tbody>
        </table></div>:<div style={{padding:22,fontSize:12,color:"#71817e"}}>No forms yet.</div>}
    </section>
  </div>
}