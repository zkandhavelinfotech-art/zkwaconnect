"use client"
import { useParams } from "next/navigation"
import { useEffect,useState } from "react"

type Field={key:string;label:string;type:"TEXT"|"EMAIL"|"PHONE"|"LONG_TEXT"|"SELECT"|"WHATSAPP_CONSENT";required:boolean;options:string[]}
type FormData={name:string;title:string;description:string|null;organization:{name:string};fields:Field[]}

export default function PublicFormPage(){
  const params=useParams<{slug:string}>()
  const slug=params.slug
  const [form,setForm]=useState<FormData|null>(null)
  const [values,setValues]=useState<Record<string,string|boolean>>({})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [submitted,setSubmitted]=useState(false)

  useEffect(()=>{
    let active=true
    fetch(`/api/public/forms/${encodeURIComponent(slug)}`).then(async response=>{
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Form not found.")
      if(active){setForm(data);setValues(Object.fromEntries((data.fields as Field[]).map(field=>[field.key,false])))}
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Form not found.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[slug])

  async function submit(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("")
    try{
      const response=await fetch(`/api/public/forms/${encodeURIComponent(slug)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not submit form.")
      setSubmitted(true)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not submit form.")}
    finally{setBusy(false)}
  }

  const fieldStyle:React.CSSProperties={width:"100%",boxSizing:"border-box",minHeight:42,padding:"9px 11px",
    border:"1px solid #cbd5d3",borderRadius:6,fontSize:14,color:"#183633",background:"#fff"}

  if(loading)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f2f6f5",fontFamily:"DM Sans,sans-serif"}}>Loading form…</main>
  if(error&&!form)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20,background:"#f2f6f5",fontFamily:"DM Sans,sans-serif"}}>{error}</main>
  if(submitted)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20,background:"#f2f6f5",fontFamily:"DM Sans,sans-serif"}}>
    <section style={{width:"min(100%,480px)",background:"#fff",border:"1px solid #e0e9e8",borderRadius:10,padding:28,textAlign:"center"}}>
      <div style={{fontFamily:"Sora,sans-serif",fontSize:21,fontWeight:700,color:"#075e54"}}>Response received</div>
      <p style={{fontSize:13,color:"#647b77",marginBottom:0}}>Thank you for contacting {form?.organization.name}.</p>
    </section>
  </main>

  return <main style={{minHeight:"100vh",padding:"42px 18px",background:"#f2f6f5",fontFamily:"DM Sans,sans-serif",color:"#183633"}}>
    <form onSubmit={submit} style={{width:"min(100%,560px)",margin:"0 auto",background:"#fff",border:"1px solid #e0e9e8",borderRadius:10,overflow:"hidden"}}>
      <header style={{padding:"24px 26px",background:"#075e54",color:"#fff"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"rgba(255,255,255,.7)"}}>{form?.organization.name}</div>
        <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,margin:"8px 0 0"}}>{form?.title}</h1>
        {form?.description&&<p style={{fontSize:13,lineHeight:1.5,color:"rgba(255,255,255,.78)",margin:"7px 0 0"}}>{form.description}</p>}
      </header>
      <div style={{padding:24,display:"grid",gap:15}}>
        {error&&<div role="alert" style={{padding:10,background:"#fff1f0",color:"#9f2d22",borderRadius:5,fontSize:12}}>{error}</div>}
        {form?.fields.map(field=>field.type==="WHATSAPP_CONSENT"?
          <label key={field.key} style={{display:"flex",alignItems:"flex-start",gap:9,fontSize:12,lineHeight:1.5,color:"#526763"}}>
            <input type="checkbox" required={field.required} checked={Boolean(values[field.key])} onChange={event=>setValues(current=>({...current,[field.key]:event.target.checked}))}/>
            <span>{field.label}</span>
          </label>:
          <label key={field.key} style={{display:"block"}}>
            <span style={{display:"block",fontSize:12,fontWeight:700,color:"#526763",marginBottom:6}}>{field.label}{field.required?" *":""}</span>
            {field.type==="LONG_TEXT"?<textarea required={field.required} value={String(values[field.key]||"")} onChange={event=>setValues(current=>({...current,[field.key]:event.target.value}))} rows={4} style={{...fieldStyle,resize:"vertical"}}/>:
              field.type==="SELECT"?<select required={field.required} value={String(values[field.key]||"")} onChange={event=>setValues(current=>({...current,[field.key]:event.target.value}))} style={fieldStyle}>
                <option value="">Select an option</option>{field.options.map(option=><option key={option}>{option}</option>)}
              </select>:<input required={field.required} type={field.type==="EMAIL"?"email":field.type==="PHONE"?"tel":"text"}
                value={String(values[field.key]||"")} onChange={event=>setValues(current=>({...current,[field.key]:event.target.value}))} style={fieldStyle}/>}
          </label>)}
        <button type="submit" disabled={busy} style={{border:0,borderRadius:6,minHeight:44,background:"#0e8b71",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          {busy?"Submitting…":"Submit"}
        </button>
      </div>
    </form>
  </main>
}