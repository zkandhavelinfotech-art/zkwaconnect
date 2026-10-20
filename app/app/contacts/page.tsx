"use client"
import { useEffect, useMemo, useState } from "react"

type Contact = { id:string; name:string|null; phone:string; email:string|null; source:string|null; tags:unknown; metadata:unknown; optedIn:boolean; createdAt:string }
type TagCount = { tag:string; count:number }
type ImportRow = { phone:string; name:string; email:string; tags:string[] }

const fieldStyle:React.CSSProperties = {minHeight:38,boxSizing:"border-box",border:"1px solid #cbd5d3",borderRadius:6,padding:"7px 10px",fontSize:12,background:"#fff",color:"#183633"}
const labelStyle:React.CSSProperties = {display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:5}
const primary:React.CSSProperties = {border:0,borderRadius:6,padding:"9px 13px",background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}
const secondary:React.CSSProperties = {border:"1px solid #cbd5d3",borderRadius:6,padding:"8px 12px",background:"#fff",color:"#183633",fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"none"}
const SOURCES:[string,string][] = [["ALL","All sources"],["MANUAL","Added manually"],["CSV_IMPORT","CSV import"],["META_LEAD_FORM","Meta Lead Form"],
  ["HOSTED_FORM","Hosted form"],["WHATSAPP_INBOUND","WhatsApp inbound"]]

function tagsOf(contact:Contact){ return Array.isArray(contact.tags)?contact.tags.filter((tag):tag is string=>typeof tag==="string"):[] }
function attributesOf(contact:Contact){
  const metadata = contact.metadata&&typeof contact.metadata==="object"?contact.metadata as Record<string,unknown>:{}
  const attributes = metadata.attributes&&typeof metadata.attributes==="object"?metadata.attributes as Record<string,unknown>:{}
  return Object.entries(attributes).filter(([key])=>key!=="name"&&key!=="email").map(([key,value])=>`${key}: ${String(value)}`)
}

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF).
function parseCsv(text:string){
  const rows:string[][] = []
  let row:string[] = [], cell = "", quoted = false
  for(let i=0;i<text.length;i++){
    const char = text[i]
    if(quoted){
      if(char==='"'&&text[i+1]==='"'){cell+='"';i++}
      else if(char==='"')quoted=false
      else cell+=char
    }else if(char==='"')quoted=true
    else if(char===","){row.push(cell);cell=""}
    else if(char==="\n"||char==="\r"){
      if(char==="\r"&&text[i+1]==="\n")i++
      row.push(cell);cell="";if(row.some(value=>value.trim()))rows.push(row);row=[]
    }else cell+=char
  }
  row.push(cell);if(row.some(value=>value.trim()))rows.push(row)
  return rows
}

function toImportRows(text:string):ImportRow[]{
  const rows = parseCsv(text.replace(/^﻿/,""))
  if(!rows.length)return []
  const header = rows[0].map(cell=>cell.trim().toLowerCase())
  const find = (...names:string[])=>header.findIndex(cell=>names.some(name=>cell===name||cell.includes(name)))
  let phoneIndex = find("phone","mobile","whatsapp","number","contact")
  const hasHeader = phoneIndex>=0
  if(!hasHeader)phoneIndex = 0
  const nameIndex = hasHeader?find("name"):1
  const emailIndex = hasHeader?find("email","e-mail"):2
  const tagsIndex = hasHeader?find("tag","label"):-1
  return rows.slice(hasHeader?1:0).map(row=>({
    phone:(row[phoneIndex]||"").trim(),
    name:nameIndex>=0?(row[nameIndex]||"").trim().slice(0,120):"",
    email:emailIndex>=0?(row[emailIndex]||"").trim().slice(0,200):"",
    tags:tagsIndex>=0?(row[tagsIndex]||"").split(/[|;]/).map(tag=>tag.trim().slice(0,40)).filter(Boolean).slice(0,20):[],
  })).filter(row=>row.phone)
}

export default function ContactsPage() {
  const [contacts,setContacts] = useState<Contact[]>([])
  const [tags,setTags] = useState<TagCount[]>([])
  const [total,setTotal] = useState(0)
  const [optedInTotal,setOptedInTotal] = useState(0)
  const [pages,setPages] = useState(1)
  const [page,setPage] = useState(1)
  const [search,setSearch] = useState("")
  const [query,setQuery] = useState("")
  const [consent,setConsent] = useState("ALL")
  const [source,setSource] = useState("ALL")
  const [tag,setTag] = useState("")
  const [added,setAdded] = useState("0")
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [bulkTag,setBulkTag] = useState("")
  const [panel,setPanel] = useState<""|"add"|"import">("")
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState("")
  const [notice,setNotice] = useState("")
  const [refresh,setRefresh] = useState(0)
  const [segment,setSegment] = useState<{id:string;name:string}|null>(null)
  // add form
  const [phone,setPhone] = useState("")
  const [name,setName] = useState("")
  const [email,setEmail] = useState("")
  const [newTags,setNewTags] = useState("")
  const [optIn,setOptIn] = useState(false)
  // import
  const [importRows,setImportRows] = useState<ImportRow[]>([])
  const [importTags,setImportTags] = useState("")
  const [importConsent,setImportConsent] = useState(false)
  const [countryCode,setCountryCode] = useState("91")

  useEffect(()=>{
    const search = new URLSearchParams(window.location.search)
    const initial = search.get("q")
    if(initial){setSearch(initial);setQuery(initial)}
    const segmentId = search.get("segment")
    if(segmentId)fetch("/api/segments").then(response=>response.json()).then(body=>{
      const found = (body.segments||[]).find((item:{id:string})=>item.id===segmentId)
      if(found)setSegment({id:found.id,name:found.name})
    }).catch(()=>null)
  },[])
  useEffect(()=>{const timer = setTimeout(()=>setQuery(search),300);return ()=>clearTimeout(timer)},[search])
  useEffect(()=>{setPage(1);setSelected(new Set())},[query,consent,source,tag,added,segment])

  const params = useMemo(()=>new URLSearchParams({q:query,consent,source,tag,added,...(segment?{segment:segment.id}:{})}),[query,consent,source,tag,added,segment])

  useEffect(()=>{
    let active = true
    setLoading(true)
    fetch(`/api/contacts?${params.toString()}&page=${page}`)
      .then(async response=>{
        const body = await response.json()
        if(!response.ok)throw new Error(body.error||"Could not load contacts.")
        if(active){setContacts(body.contacts||[]);setTotal(body.total||0);setPages(body.pages||1);setTags(body.tags||[]);setOptedInTotal(body.optedInTotal||0)}
      })
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load contacts.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[params,page,refresh])

  async function call(method:"POST"|"PATCH",payload:unknown){
    setBusy(true);setError("");setNotice("")
    try{
      const response = await fetch("/api/contacts",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"Request failed.")
      setNotice(body.message);setRefresh(value=>value+1)
      return true
    }catch(reason){setError(reason instanceof Error?reason.message:"Request failed.");return false}
    finally{setBusy(false)}
  }

  async function addContact(event:React.FormEvent){
    event.preventDefault()
    const ok = await call("POST",{action:"create",optedIn:optIn,countryCode,contact:{phone,name,email,
      tags:newTags.split(",").map(item=>item.trim()).filter(Boolean)}})
    if(ok){setPhone("");setName("");setEmail("");setNewTags("");setOptIn(false);setPanel("")}
  }

  async function importContacts(){
    const ok = await call("POST",{action:"import",optedIn:importConsent,countryCode,contacts:importRows,
      tags:importTags.split(",").map(item=>item.trim()).filter(Boolean)})
    if(ok){setImportRows([]);setImportTags("");setImportConsent(false);setPanel("")}
  }

  async function bulk(action:"addTag"|"removeTag"|"optIn"|"optOut"|"delete"){
    if(action==="delete"&&!window.confirm(`Delete ${selected.size} contact(s)? Contacts with chat history are kept.`))return
    if((action==="addTag"||action==="removeTag")&&!bulkTag.trim()){setError("Type a tag first.");return}
    const ok = await call("PATCH",{ids:[...selected],action,tag:bulkTag.trim()||undefined})
    if(ok){setSelected(new Set());if(action==="addTag")setBulkTag("")}
  }

  async function readFile(file:File){
    if(file.size>5_000_000){setError("CSV must be 5 MB or smaller.");return}
    const rows = toImportRows(await file.text())
    if(!rows.length)setError("No rows with a phone number were found in that file.")
    else if(rows.length>5000)setError("Import up to 5,000 contacts at a time. Split the file and try again.")
    else{setError("");setImportRows(rows)}
  }

  const filtersActive = query||consent!=="ALL"||source!=="ALL"||tag||added!=="0"||segment
  const allSelected = contacts.length>0&&contacts.every(contact=>selected.has(contact.id))

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:18}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Contacts</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>{total.toLocaleString()} {filtersActive?"matching":"total"} · {optedInTotal.toLocaleString()} opted in to WhatsApp</p>
          {segment&&<div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,background:"#eef2ff",color:"#3730a3",borderRadius:14,padding:"4px 10px",fontSize:12,fontWeight:700}}>
            🎯 Segment: {segment.name}
            <button aria-label="Clear segment" onClick={()=>{setSegment(null);window.history.replaceState(null,"","/app/contacts")}} style={{border:0,background:"none",cursor:"pointer",color:"#3730a3"}}>✕</button></div>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <a href="/app/contacts/segments" style={secondary}>🎯 Segments</a>
          <a href={`/api/contacts?${params.toString()}&format=csv`} style={secondary}>⬇ Export CSV</a>
          <button onClick={()=>setPanel(panel==="import"?"":"import")} style={secondary}>⬆ Import CSV</button>
          <button onClick={()=>setPanel(panel==="add"?"":"add")} style={primary}>+ Add contact</button>
        </div>
      </div>

      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:12,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:12,fontSize:13}}>{notice}</div>}

      {panel==="add"&&<form onSubmit={addContact} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:18,marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:10}}>
          <label><span style={labelStyle}>WhatsApp number</span><input required value={phone} onChange={event=>setPhone(event.target.value)} placeholder="98765 43210" style={{...fieldStyle,width:"100%"}}/></label>
          <label><span style={labelStyle}>Name</span><input value={name} maxLength={120} onChange={event=>setName(event.target.value)} style={{...fieldStyle,width:"100%"}}/></label>
          <label><span style={labelStyle}>Email</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} style={{...fieldStyle,width:"100%"}}/></label>
          <label><span style={labelStyle}>Tags (comma separated)</span><input value={newTags} onChange={event=>setNewTags(event.target.value)} placeholder="customer, vip" style={{...fieldStyle,width:"100%"}}/></label>
          <label><span style={labelStyle}>Default country code</span><input value={countryCode} onChange={event=>setCountryCode(event.target.value.replace(/\D/g,"").slice(0,4))} style={{...fieldStyle,width:"100%"}}/></label>
        </div>
        <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,color:"#526763",marginTop:12}}>
          <input type="checkbox" checked={optIn} onChange={event=>setOptIn(event.target.checked)}/>
          This person has agreed to receive WhatsApp messages from my business (required for campaigns).
        </label>
        <div style={{display:"flex",gap:8,marginTop:12}}><button type="submit" disabled={busy} style={primary}>{busy?"Saving…":"Save contact"}</button>
          <button type="button" onClick={()=>setPanel("")} style={secondary}>Cancel</button></div>
      </form>}

      {panel==="import"&&<div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:18,marginBottom:14}}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 6px",color:"#183633"}}>Import contacts from CSV</h2>
        <p style={{fontSize:12,color:"#64748b",margin:"0 0 12px"}}>Columns are detected from the header row: <code>phone</code> (required), <code>name</code>, <code>email</code>, <code>tags</code> (separate multiple tags with |). Up to 5,000 rows. Existing numbers are updated, not duplicated.</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <label><span style={labelStyle}>CSV file</span><input type="file" accept=".csv,text/csv" onChange={event=>{const file = event.target.files?.[0];if(file)readFile(file)}} style={{fontSize:12}}/></label>
          <label><span style={labelStyle}>Add tags to all rows</span><input value={importTags} onChange={event=>setImportTags(event.target.value)} placeholder="diwali-2026" style={fieldStyle}/></label>
          <label><span style={labelStyle}>Country code for 10-digit numbers</span><input value={countryCode} onChange={event=>setCountryCode(event.target.value.replace(/\D/g,"").slice(0,4))} style={{...fieldStyle,width:90}}/></label>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent("phone,name,email,tags\n919876543210,Priya Sharma,priya@example.com,customer|vip\n")}`}
            download="contacts-sample.csv" style={{fontSize:12,color:"#075e54",fontWeight:700,paddingBottom:10}}>Download sample CSV</a>
        </div>
        {importRows.length>0&&<>
          <div style={{fontSize:12,color:"#183633",margin:"14px 0 6px",fontWeight:700}}>{importRows.length.toLocaleString()} row(s) ready · preview</div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,textAlign:"left"}}>
            <thead style={{color:"#647b77"}}><tr>{["Phone","Name","Email","Tags"].map(label=><th key={label} style={{padding:6}}>{label}</th>)}</tr></thead>
            <tbody>{importRows.slice(0,5).map((row,index)=><tr key={index} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:6}}>{row.phone}</td><td style={{padding:6}}>{row.name||"—"}</td><td style={{padding:6}}>{row.email||"—"}</td><td style={{padding:6}}>{row.tags.join(", ")||"—"}</td></tr>)}</tbody>
          </table></div>
          <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,color:"#526763",marginTop:12}}>
            <input type="checkbox" checked={importConsent} onChange={event=>setImportConsent(event.target.checked)}/>
            Everyone in this file has opted in to receive WhatsApp messages from my business. Leave unchecked to import them as not opted in.
          </label>
          <button onClick={importContacts} disabled={busy} style={{...primary,marginTop:12}}>{busy?"Importing…":`Import ${importRows.length.toLocaleString()} contacts`}</button>
        </>}
      </div>}

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
        <div style={{padding:14,borderBottom:"1px solid #e8efee",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input aria-label="Search contacts" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search name, email, phone"
            style={{...fieldStyle,width:"min(100%,280px)"}}/>
          <select aria-label="Tag filter" value={tag} onChange={event=>setTag(event.target.value)} style={fieldStyle}>
            <option value="">All tags</option><option value="__untagged">Untagged</option>
            {tags.map(item=><option key={item.tag} value={item.tag}>{item.tag} ({item.count})</option>)}
          </select>
          <select aria-label="WhatsApp consent filter" value={consent} onChange={event=>setConsent(event.target.value)} style={fieldStyle}>
            <option value="ALL">Any consent</option><option value="OPTED_IN">Opted in</option><option value="NOT_OPTED_IN">Not opted in</option>
          </select>
          <select aria-label="Contact source filter" value={source} onChange={event=>setSource(event.target.value)} style={fieldStyle}>
            {SOURCES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Date added filter" value={added} onChange={event=>setAdded(event.target.value)} style={fieldStyle}>
            <option value="0">Added any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option>
          </select>
          {filtersActive&&<button onClick={()=>{setSearch("");setQuery("");setConsent("ALL");setSource("ALL");setTag("");setAdded("0")}}
            style={{border:0,background:"none",color:"#075e54",fontSize:12,fontWeight:700,cursor:"pointer"}}>Clear filters</button>}
        </div>
        {tags.length>0&&<div style={{padding:"8px 14px",borderBottom:"1px solid #e8efee",display:"flex",gap:6,flexWrap:"wrap"}}>
          {tags.slice(0,15).map(item=><button key={item.tag} onClick={()=>setTag(tag===item.tag?"":item.tag)} style={{border:`1px solid ${tag===item.tag?"#075e54":"#d7e2df"}`,
            background:tag===item.tag?"#075e54":"#f7faf9",color:tag===item.tag?"#fff":"#365b57",borderRadius:14,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>
            🏷️ {item.tag} · {item.count}</button>)}
        </div>}
        {selected.size>0&&<div style={{padding:"10px 14px",background:"#f0fdf4",borderBottom:"1px solid #bbf7d0",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <strong style={{fontSize:12,color:"#166534"}}>{selected.size} selected</strong>
          <input aria-label="Tag for selected contacts" list="known-tags" value={bulkTag} onChange={event=>setBulkTag(event.target.value)} placeholder="Tag" style={{...fieldStyle,width:140}}/>
          <datalist id="known-tags">{tags.map(item=><option key={item.tag} value={item.tag}/>)}</datalist>
          <button disabled={busy} onClick={()=>bulk("addTag")} style={secondary}>Add tag</button>
          <button disabled={busy} onClick={()=>bulk("removeTag")} style={secondary}>Remove tag</button>
          <button disabled={busy} onClick={()=>bulk("optIn")} style={secondary}>Mark opted in</button>
          <button disabled={busy} onClick={()=>bulk("optOut")} style={secondary}>Mark opted out</button>
          <button disabled={busy} onClick={()=>bulk("delete")} style={{...secondary,color:"#b91c1c"}}>Delete</button>
        </div>}
        {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading contacts…</div>:contacts.length?
          <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:860,borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
            <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>
              <th style={{width:36,padding:"11px 13px"}}><input type="checkbox" aria-label="Select all on this page" checked={allSelected}
                onChange={()=>setSelected(current=>{const next = new Set(current);contacts.forEach(contact=>allSelected?next.delete(contact.id):next.add(contact.id));return next})}/></th>
              {["Name","Phone","Email","Tags","Source","WhatsApp consent","Added"].map(label=><th key={label} style={{padding:"11px 13px",fontWeight:600}}>{label}</th>)}
            </tr></thead>
            <tbody>{contacts.map(contact=>{
              const attributes = attributesOf(contact)
              return <tr key={contact.id} style={{borderTop:"1px solid #edf1f0",background:selected.has(contact.id)?"#f7fdf9":undefined}}>
                <td style={{padding:13}}><input type="checkbox" aria-label={`Select ${contact.name||contact.phone}`} checked={selected.has(contact.id)}
                  onChange={()=>setSelected(current=>{const next = new Set(current);if(next.has(contact.id))next.delete(contact.id);else next.add(contact.id);return next})}/></td>
                <td style={{padding:13,fontWeight:700,color:"#183633"}}>{contact.name||"—"}
                  {attributes.length>0&&<div title={attributes.join("\n")} style={{fontSize:10,fontWeight:400,color:"#71817e",marginTop:3,maxWidth:200,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{attributes.join(" · ")}</div>}</td>
                <td style={{padding:13}}>+{contact.phone}</td>
                <td style={{padding:13}}>{contact.email||"—"}</td>
                <td style={{padding:13}}><div style={{display:"flex",gap:4,flexWrap:"wrap",maxWidth:220}}>
                  {tagsOf(contact).map(item=><span key={item} style={{background:"#eef2ff",color:"#4338ca",borderRadius:10,padding:"2px 7px",fontSize:10}}>{item}</span>)}
                  {!tagsOf(contact).length&&<span style={{color:"#94a3b8"}}>—</span>}</div></td>
                <td style={{padding:13}}>{SOURCES.find(([value])=>value===(contact.source||"MANUAL"))?.[1]||contact.source}</td>
                <td style={{padding:13,color:contact.optedIn?"#168253":"#a86b06"}}>{contact.optedIn?"Opted in":"Not opted in"}</td>
                <td style={{padding:13,color:"#647b77"}}>{new Date(contact.createdAt).toLocaleDateString()}</td>
              </tr>})}</tbody>
          </table></div>:!error?<div style={{padding:24,fontSize:13,color:"#71817e"}}>
            {filtersActive?"No contacts match these filters.":"No contacts yet. Add one, import a CSV, or capture leads from Forms and Meta Lead Ads."}</div>:null}
        {pages>1&&<div style={{padding:12,borderTop:"1px solid #e8efee",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:"#647b77"}}>
          <span>Page {page} of {pages}</span>
          <div style={{display:"flex",gap:6}}>
            <button disabled={page<=1} onClick={()=>setPage(value=>value-1)} style={secondary}>← Previous</button>
            <button disabled={page>=pages} onClick={()=>setPage(value=>value+1)} style={secondary}>Next →</button>
          </div>
        </div>}
      </div>
    </div>
  )
}
