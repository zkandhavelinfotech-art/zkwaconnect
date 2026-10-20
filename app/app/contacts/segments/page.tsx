"use client"
import { useEffect, useState } from "react"

type Rule = { key:string; op:"equals"|"contains"|"exists"|"missing"; value:string }
type Filters = { tagsAny:string[]; tagsAll:string[]; tagsNone:string[]; consent:"ALL"|"OPTED_IN"|"NOT_OPTED_IN"; sources:string[]
  addedWithinDays:number|null; messagedWithinDays:number|null; attributes:Rule[]
  campaign:{id:string;status:"received"|"delivered"|"read"|"not_read"|"replied"|"clicked"|"not_clicked"|"failed"}|null }
type Segment = { id:string; name:string; filters:Filters; description:string; count:number; optedIn:number; updatedAt:string }

const EMPTY:Filters = { tagsAny:[], tagsAll:[], tagsNone:[], consent:"ALL", sources:[], addedWithinDays:null, messagedWithinDays:null, attributes:[], campaign:null }
const card:React.CSSProperties = {background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20,marginBottom:18}
const input:React.CSSProperties = {boxSizing:"border-box",border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 10px",fontSize:13,color:"#183633",background:"#fff"}
const label:React.CSSProperties = {display:"block",fontSize:11,fontWeight:700,color:"#526763",margin:"12px 0 6px"}
const primary:React.CSSProperties = {border:0,borderRadius:6,padding:"9px 14px",background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"none"}
const ghost:React.CSSProperties = {...primary,background:"#fff",color:"#075e54",border:"1px solid #cbd5d3"}
const CAMPAIGN_STATUS:[Filters["campaign"] extends infer T ? T extends {status:infer S} ? S : never : never,string][] = [
  ["received","received"],["delivered","got it delivered"],["read","read"],["not_read","received but didn't read"],["replied","replied to"],["clicked","clicked a link in"],["not_clicked","received but didn't click"],["failed","failed to receive"]]

function Tags({ value, onChange, options, placeholder }:{ value:string[]; onChange:(next:string[])=>void; options:string[]; placeholder:string }){
  const [text,setText] = useState("")
  const add = (tag:string)=>{ const clean = tag.trim().slice(0,40); if(clean&&!value.includes(clean))onChange([...value,clean]); setText("") }
  return <div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:value.length?6:0}}>{value.map(tag=><span key={tag} style={{background:"#eef2ff",color:"#4338ca",borderRadius:12,padding:"3px 9px",fontSize:11}}>
      {tag} <button type="button" aria-label={`Remove ${tag}`} onClick={()=>onChange(value.filter(item=>item!==tag))} style={{border:0,background:"none",cursor:"pointer",color:"#4338ca"}}>✕</button></span>)}</div>
    <input list="segment-tags" value={text} placeholder={placeholder} onChange={event=>setText(event.target.value)}
      onKeyDown={event=>{if(event.key==="Enter"||event.key===","){event.preventDefault();add(text)}}} onBlur={()=>text&&add(text)} style={{...input,width:"100%"}}/>
    <datalist id="segment-tags">{options.map(option=><option key={option} value={option}/>)}</datalist>
  </div>
}

export default function SegmentsPage() {
  const [segments,setSegments] = useState<Segment[]>([])
  const [campaigns,setCampaigns] = useState<{id:string;name:string}[]>([])
  const [attributeKeys,setAttributeKeys] = useState<string[]>([])
  const [sources,setSources] = useState<string[]>([])
  const [tags,setTags] = useState<string[]>([])
  const [editing,setEditing] = useState<{id?:string;name:string;filters:Filters}|null>(null)
  const [preview,setPreview] = useState<{count:number;optedIn:number;sample:{name:string|null;phone:string}[]}|null>(null)
  const [error,setError] = useState("")
  const [notice,setNotice] = useState("")

  async function load(){
    const [a,b] = await Promise.all([fetch("/api/segments"),fetch("/api/contacts?page=1")])
    const [body,contacts] = await Promise.all([a.json(),b.json()])
    if(!a.ok)throw new Error(body.error||"Could not load segments.")
    setSegments(body.segments);setCampaigns(body.campaigns);setAttributeKeys(body.attributeKeys);setSources(body.sources)
    setTags((contacts.tags||[]).map((item:{tag:string})=>item.tag))
  }
  useEffect(()=>{
    load().catch(reason=>setError(reason.message))
    if(new URLSearchParams(window.location.search).has("new"))setEditing({name:"",filters:EMPTY})
  },[])

  // Live count while editing.
  useEffect(()=>{
    if(!editing)return
    const timer = setTimeout(()=>{
      fetch("/api/segments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({preview:true,filters:editing.filters})})
        .then(async response=>{const body = await response.json(); if(response.ok)setPreview(body); else setPreview(null)}).catch(()=>setPreview(null))
    },350)
    return ()=>clearTimeout(timer)
  },[editing])

  const f = editing?.filters
  const setF = (patch:Partial<Filters>)=>setEditing(current=>current&&{...current,filters:{...current.filters,...patch}})

  async function save(event:React.FormEvent){
    event.preventDefault()
    if(!editing)return
    setError("");setNotice("")
    const response = await fetch("/api/segments",{method:editing.id?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing)})
    const body = await response.json()
    if(!response.ok){setError(body.error||"Could not save.");return}
    setNotice(body.message);setEditing(null);setPreview(null);await load()
  }
  async function remove(segment:Segment){
    if(!window.confirm(`Delete segment “${segment.name}”? Contacts are not deleted.`))return
    const response = await fetch(`/api/segments?id=${segment.id}`,{method:"DELETE"})
    const body = await response.json()
    if(!response.ok){setError(body.error);return}
    setNotice(body.message);await load()
  }

  return (
    <div style={{maxWidth:980}}>
      <a href="/app/contacts" style={{fontSize:12,color:"#075e54",fontWeight:700,textDecoration:"none"}}>← Contacts</a>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",margin:"8px 0 18px"}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Segments</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Saved groups of contacts that update automatically. Use them to filter Contacts, export, or as a broadcast audience.</p>
        </div>
        {!editing&&<button onClick={()=>{setEditing({name:"",filters:EMPTY});setPreview(null)}} style={{...primary,fontSize:13,padding:"10px 16px"}}>+ New segment</button>}
      </div>
      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      {editing&&f&&<form onSubmit={save} style={card}>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(220px,1fr)",gap:24}} className="zk-seg-grid">
          <div>
            <label style={{...label,marginTop:0}}>Segment name</label>
            <input required minLength={2} maxLength={60} value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})} placeholder="e.g. Chennai leads who didn't read Diwali offer" style={{...input,width:"100%"}}/>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:12}}>
              <div><label style={label}>Has any of these tags</label><Tags value={f.tagsAny} onChange={tagsAny=>setF({tagsAny})} options={tags} placeholder="Type a tag, Enter"/></div>
              <div><label style={label}>Has all of these tags</label><Tags value={f.tagsAll} onChange={tagsAll=>setF({tagsAll})} options={tags} placeholder="Type a tag, Enter"/></div>
              <div><label style={label}>Doesn&apos;t have these tags</label><Tags value={f.tagsNone} onChange={tagsNone=>setF({tagsNone})} options={tags} placeholder="Type a tag, Enter"/></div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:12}}>
              <div><label style={label}>WhatsApp consent</label>
                <select value={f.consent} onChange={event=>setF({consent:event.target.value as Filters["consent"]})} style={{...input,width:"100%"}}>
                  <option value="ALL">Any</option><option value="OPTED_IN">Opted in</option><option value="NOT_OPTED_IN">Not opted in</option></select></div>
              <div><label style={label}>Added in the last … days</label>
                <input type="number" min={1} max={3650} value={f.addedWithinDays??""} placeholder="any time" onChange={event=>setF({addedWithinDays:event.target.value?Number(event.target.value):null})} style={{...input,width:"100%"}}/></div>
              <div><label style={label}>Messaged you in the last … days</label>
                <input type="number" min={1} max={3650} value={f.messagedWithinDays??""} placeholder="any time" onChange={event=>setF({messagedWithinDays:event.target.value?Number(event.target.value):null})} style={{...input,width:"100%"}}/></div>
            </div>

            {sources.length>0&&<><label style={label}>Source (any of)</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{sources.map(source=>{const on = f.sources.includes(source)
                return <button type="button" key={source} onClick={()=>setF({sources:on?f.sources.filter(item=>item!==source):[...f.sources,source]})}
                  style={{border:`1px solid ${on?"#075e54":"#d7e2df"}`,background:on?"#075e54":"#fff",color:on?"#fff":"#365b57",borderRadius:14,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>
                  {on?"✓ ":""}{source.toLowerCase().replace(/_/g," ")}</button>})}</div></>}

            <label style={label}>Custom fields</label>
            {f.attributes.map((rule,index)=><div key={index} style={{display:"grid",gridTemplateColumns:"1fr 130px 1fr auto",gap:6,marginBottom:6}}>
              <input list="segment-fields" value={rule.key} placeholder="field, e.g. city" onChange={event=>setF({attributes:f.attributes.map((item,i)=>i===index?{...item,key:event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"")}:item)})} style={input}/>
              <select value={rule.op} onChange={event=>setF({attributes:f.attributes.map((item,i)=>i===index?{...item,op:event.target.value as Rule["op"]}:item)})} style={input}>
                <option value="equals">is</option><option value="contains">contains</option><option value="exists">is set</option><option value="missing">is empty</option></select>
              {rule.op==="equals"||rule.op==="contains"?<input value={rule.value} placeholder="value (case-sensitive)" onChange={event=>setF({attributes:f.attributes.map((item,i)=>i===index?{...item,value:event.target.value}:item)})} style={input}/>:<span/>}
              <button type="button" aria-label="Remove rule" onClick={()=>setF({attributes:f.attributes.filter((_,i)=>i!==index)})} style={{border:0,background:"none",color:"#b91c1c",cursor:"pointer"}}>✕</button>
            </div>)}
            <datalist id="segment-fields">{attributeKeys.map(key=><option key={key} value={key}/>)}</datalist>
            {f.attributes.length<10&&<button type="button" onClick={()=>setF({attributes:[...f.attributes,{key:attributeKeys[0]||"",op:"equals",value:""}]})} style={{...ghost,padding:"5px 10px",fontSize:11}}>+ Add field rule</button>}

            <label style={label}>Broadcast engagement (retarget)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",fontSize:13,color:"#334155"}}>
              Contacts who
              <select value={f.campaign?.status||""} onChange={event=>setF({campaign:event.target.value?{id:f.campaign?.id||campaigns[0]?.id||"",status:event.target.value as NonNullable<Filters["campaign"]>["status"]}:null})} style={input}>
                <option value="">— any (no broadcast rule) —</option>{CAMPAIGN_STATUS.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>
              {f.campaign&&<select value={f.campaign.id} onChange={event=>setF({campaign:{...f.campaign!,id:event.target.value}})} style={input}>
                {!campaigns.length&&<option value="">No sent broadcasts yet</option>}{campaigns.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            </div>
          </div>

          <aside style={{background:"#f7faf9",borderRadius:8,padding:16,alignSelf:"start",position:"sticky",top:80}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>Matching contacts</div>
            <div style={{fontFamily:"Sora,sans-serif",fontSize:30,fontWeight:800,color:"#075e54",margin:"4px 0"}}>{preview?preview.count.toLocaleString("en-IN"):"…"}</div>
            {preview&&<div style={{fontSize:12,color:"#64748b"}}>{preview.optedIn.toLocaleString("en-IN")} opted in (broadcasts only go to these)</div>}
            {preview?.sample.length?<ul style={{fontSize:12,color:"#334155",paddingLeft:16,margin:"10px 0 0"}}>{preview.sample.map(item=><li key={item.phone}>{item.name||`+${item.phone}`}</li>)}</ul>:null}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button type="submit" style={primary}>{editing.id?"Update segment":"Save segment"}</button>
              <button type="button" onClick={()=>{setEditing(null);setPreview(null)}} style={{...ghost,color:"#64748b"}}>Cancel</button>
            </div>
          </aside>
        </div>
      </form>}

      <section style={{...card,padding:0,overflow:"hidden"}}>
        {segments.length?<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
          <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Segment","Contacts","Opted in",""].map(text=><th key={text} style={{padding:11,fontWeight:600}}>{text}</th>)}</tr></thead>
          <tbody>{segments.map(segment=><tr key={segment.id} style={{borderTop:"1px solid #edf1f0",verticalAlign:"top"}}>
            <td style={{padding:11}}><div style={{fontWeight:700,color:"#183633"}}>{segment.name}</div><div style={{color:"#71817e",marginTop:3}}>{segment.description}</div></td>
            <td style={{padding:11,fontWeight:700}}>{segment.count.toLocaleString("en-IN")}</td><td style={{padding:11}}>{segment.optedIn.toLocaleString("en-IN")}</td>
            <td style={{padding:11}}><div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
              <a href={`/app/contacts?segment=${segment.id}`} style={{...ghost,padding:"5px 9px",fontSize:11}}>View</a>
              <a href={`/api/contacts?segment=${segment.id}&format=csv`} style={{...ghost,padding:"5px 9px",fontSize:11}}>⬇ Export</a>
              <a href={`/app/campaigns?segment=${segment.id}`} style={{...primary,padding:"5px 9px",fontSize:11}}>📣 Broadcast</a>
              <button onClick={()=>{setEditing({id:segment.id,name:segment.name,filters:segment.filters});setPreview(null);window.scrollTo({top:0,behavior:"smooth"})}} style={{...ghost,padding:"5px 9px",fontSize:11}}>Edit</button>
              <button onClick={()=>remove(segment)} style={{...ghost,padding:"5px 9px",fontSize:11,color:"#b91c1c"}}>Delete</button>
            </div></td>
          </tr>)}</tbody></table>:<p style={{padding:20,fontSize:12,color:"#71817e",margin:0}}>No segments yet. Create one to reuse a group of contacts.</p>}
      </section>
      <style>{`@media (max-width: 800px){ .zk-seg-grid{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  )
}
