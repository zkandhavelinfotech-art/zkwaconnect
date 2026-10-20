"use client"
import { useEffect,useMemo,useState } from "react"
import { TEMPLATE_INDUSTRIES,TEMPLATE_LIBRARY,type LibraryButton,type LibraryTemplate } from "@/lib/templates/library"

type Waba={id:string;wabaId:string;name:string}
type Template={id:string;name:string;language:string;category:string;status:string;content:string|null;rejectionReason:string|null;updatedAt:string;wabaId:string}
type Tab="library"|"create"|"mine"
const fieldStyle:React.CSSProperties={width:"100%",boxSizing:"border-box",minHeight:40,padding:"8px 10px",
  border:"1px solid #cbd5d3",borderRadius:6,fontSize:13,color:"#183633",background:"#fff"}
const labelStyle:React.CSSProperties={display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}
const LANGUAGES=[["en","English"],["en_US","English (US)"],["en_GB","English (UK)"],["hi","Hindi"],["ta","Tamil"],["te","Telugu"],
  ["kn","Kannada"],["ml","Malayalam"],["mr","Marathi"],["bn","Bengali"],["gu","Gujarati"],["pa","Punjabi"]]

function variableNumbers(text:string){
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])))].sort((a,b)=>a-b)
}

type HeaderFormat="IMAGE"|"VIDEO"|"DOCUMENT"
type Upload={dataUrl:string;name:string}
type CardDraft={media:Upload|null;body:string}
const MEDIA_LIMITS:Record<HeaderFormat,{accept:string;max:number;label:string}>={
  IMAGE:{accept:"image/jpeg,image/png",max:5*1024*1024,label:"JPG or PNG, up to 5 MB"},
  VIDEO:{accept:"video/mp4,video/3gpp",max:16*1024*1024,label:"MP4, up to 16 MB"},
  DOCUMENT:{accept:"application/pdf",max:20*1024*1024,label:"PDF, up to 20 MB"},
}

function MediaHeader({format,media}:{format:HeaderFormat;media:Upload|null}){
  if(!media)return <div style={{height:120,borderRadius:6,background:"#e9edef",display:"grid",placeItems:"center",fontSize:30,color:"#8696a0",marginBottom:6}}>
    {format==="IMAGE"?"🖼️":format==="VIDEO"?"🎬":"📄"}</div>
  if(format==="IMAGE")return <img src={media.dataUrl} alt="" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:6,marginBottom:6,display:"block"}}/>
  if(format==="VIDEO")return <video src={media.dataUrl} muted style={{width:"100%",maxHeight:180,borderRadius:6,marginBottom:6,display:"block",background:"#000"}}/>
  return <div style={{display:"flex",alignItems:"center",gap:8,background:"#f0f2f5",borderRadius:6,padding:10,marginBottom:6,fontSize:12}}>📄 {media.name}</div>
}

function WhatsAppPreview({header,body,footer,buttons,examples,mediaFormat,media,cards,cardButtons}:{header?:string;body:string;footer?:string;buttons?:LibraryButton[];examples?:string[]
  mediaFormat?:HeaderFormat;media?:Upload|null;cards?:CardDraft[];cardButtons?:LibraryButton[]}){
  const filled=body.replace(/\{\{(\d+)\}\}/g,(match,number)=>examples?.[Number(number)-1]||match)
  return <div style={{background:"#efeae2",borderRadius:8,padding:12}}>
    <div style={{background:"#fff",borderRadius:8,padding:"8px 10px",maxWidth:300,boxShadow:"0 1px 1px rgba(0,0,0,.08)"}}>
      {mediaFormat&&!cards&&<MediaHeader format={mediaFormat} media={media||null}/>}
      {header&&<div style={{fontWeight:700,fontSize:13,color:"#111b21",marginBottom:4}}>{header}</div>}
      <div style={{fontSize:12,color:"#111b21",whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.45}}>{filled||"Your message appears here"}</div>
      {footer&&<div style={{fontSize:11,color:"#667781",marginTop:5}}>{footer}</div>}
      <div style={{fontSize:10,color:"#667781",textAlign:"right",marginTop:2}}>10:24</div>
    </div>
    {buttons?.map((button,index)=><div key={index} style={{maxWidth:300,background:"#fff",borderRadius:8,marginTop:3,padding:"7px",
      textAlign:"center",fontSize:12,color:"#027eb5",boxShadow:"0 1px 1px rgba(0,0,0,.08)"}}>
      {button.type==="URL"?"↗ ":button.type==="PHONE_NUMBER"?"📞 ":"↩ "}{button.text||"Button"}</div>)}
    {cards&&<div style={{display:"flex",gap:8,overflowX:"auto",marginTop:6,paddingBottom:4}}>
      {cards.map((card,index)=><div key={index} style={{flex:"0 0 190px",background:"#fff",borderRadius:8,padding:8,boxShadow:"0 1px 1px rgba(0,0,0,.08)"}}>
        <MediaHeader format={mediaFormat||"IMAGE"} media={card.media}/>
        <div style={{fontSize:12,color:"#111b21",minHeight:32,whiteSpace:"pre-wrap"}}>{card.body||`Card ${index+1} text`}</div>
        {cardButtons?.map((button,buttonIndex)=><div key={buttonIndex} style={{borderTop:"1px solid #e9edef",marginTop:6,paddingTop:6,textAlign:"center",fontSize:12,color:"#027eb5"}}>
          {button.type==="URL"?"↗ ":"↩ "}{button.text||"Button"}</div>)}
      </div>)}
    </div>}
  </div>
}

function readUpload(file:File|undefined,format:HeaderFormat):Promise<Upload>{
  return new Promise((resolve,reject)=>{
    if(!file)return reject(new Error("No file chosen."))
    const limit=MEDIA_LIMITS[format]
    if(!limit.accept.split(",").includes(file.type))return reject(new Error(`Use ${limit.label}.`))
    if(file.size>limit.max)return reject(new Error(`File is too large — ${limit.label}.`))
    const reader=new FileReader()
    reader.onload=()=>resolve({dataUrl:String(reader.result),name:file.name})
    reader.onerror=()=>reject(new Error("Couldn't read the file."))
    reader.readAsDataURL(file)
  })
}

export default function TemplatesPage() {
  const [tab,setTab]=useState<Tab>("library")
  const [templates,setTemplates]=useState<Template[]>([])
  const [wabas,setWabas]=useState<Waba[]>([])
  const [wabaId,setWabaId]=useState("")
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [refresh,setRefresh]=useState(0)
  const [lastSynced,setLastSynced]=useState<Date|null>(null)
  // library filters
  const [search,setSearch]=useState("")
  const [industry,setIndustry]=useState("All")
  const [libraryCategory,setLibraryCategory]=useState("All")
  // create form
  const [name,setName]=useState("")
  const [language,setLanguage]=useState("en")
  const [category,setCategory]=useState<"MARKETING"|"UTILITY"|"AUTHENTICATION">("UTILITY")
  const [header,setHeader]=useState("")
  const [body,setBody]=useState("")
  const [footer,setFooter]=useState("")
  const [buttons,setButtons]=useState<LibraryButton[]>([])
  const [examples,setExamples]=useState<string[]>([])
  const [templateType,setTemplateType]=useState<"TEXT"|"MEDIA"|"CAROUSEL">("TEXT")
  const [headerFormat,setHeaderFormat]=useState<HeaderFormat>("IMAGE")
  const [media,setMedia]=useState<Upload|null>(null)
  const [cards,setCards]=useState<CardDraft[]>([{media:null,body:""},{media:null,body:""}])
  const [cardButtons,setCardButtons]=useState<LibraryButton[]>([{type:"QUICK_REPLY",text:"Learn more"}])
  const [statusFilter,setStatusFilter]=useState("ALL")

  useEffect(()=>{
    let active=true
    setLoading(true)
    fetch("/api/templates").then(async response=>{
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||"Could not load templates.")
      if(active){setTemplates(data.templates||[]);setWabas(data.wabas||[]);setWabaId(current=>current||data.wabas?.[0]?.id||"")}
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load templates.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[refresh])

  const library=useMemo(()=>{
    const query=search.trim().toLowerCase()
    return TEMPLATE_LIBRARY.filter(template=>(industry==="All"||template.industry===industry)&&
      (libraryCategory==="All"||template.category===libraryCategory)&&
      (!query||`${template.title} ${template.body} ${template.industry}`.toLowerCase().includes(query)))
  },[search,industry,libraryCategory])

  const numbers=variableNumbers(body)

  function applyLibraryTemplate(template:LibraryTemplate){
    setTemplateType("TEXT");setMedia(null)
    setName(template.name);setCategory(template.category);setHeader(template.header||"");setBody(template.body)
    setFooter(template.footer||"");setButtons(template.buttons||[]);setExamples(template.examples)
    setTab("create");setNotice("");setError("")
    window.scrollTo({top:0,behavior:"smooth"})
  }

  async function post(payload:Record<string,unknown>){
    setBusy(true);setError("");setNotice("")
    try{
      const response=await fetch("/api/templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wabaId,...payload})})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||"Template request failed.")
      setRefresh(value=>value+1)
      return result
    }catch(reason){setError(reason instanceof Error?reason.message:"Template request failed.");return null}
    finally{setBusy(false)}
  }

  async function submit(event:React.FormEvent){
    event.preventDefault()
    if(templateType==="MEDIA"&&!media){setError(`Upload the header ${headerFormat.toLowerCase()}.`);return}
    if(templateType==="CAROUSEL"&&cards.some(card=>!card.media||!card.body.trim())){setError("Every card needs an image or video and some text.");return}
    const carousel=templateType==="CAROUSEL"&&category!=="AUTHENTICATION"
    const result=await post({action:"create",name,language,category:carousel?"MARKETING":category,body,
      templateType:category==="AUTHENTICATION"?"TEXT":templateType,headerFormat,
      header:templateType==="TEXT"&&header?header:undefined,footer:!carousel&&footer?footer:undefined,
      buttons:category==="AUTHENTICATION"||carousel?[]:buttons,examples:numbers.map(number=>examples[number-1]||""),
      ...(templateType==="MEDIA"&&media?{media}:{}),
      ...(carousel?{cards:cards.map(card=>({media:card.media,body:card.body.trim(),buttons:cardButtons}))}:{})})
    if(result){
      setNotice(`${result.message} Approval usually takes a few minutes to 24 hours.`)
      setName("");setHeader("");setBody("");setFooter("");setButtons([]);setExamples([]);setMedia(null)
      setCards([{media:null,body:""},{media:null,body:""}]);setTab("mine")
    }
  }

  // Meta reviews templates asynchronously: refresh statuses quietly on open and every minute while any are pending.
  const pendingCount=templates.filter(template=>["PENDING","IN_APPEAL","PENDING_DELETION"].includes(template.status)).length
  async function silentSync(){
    if(!wabaId)return
    try{
      const response=await fetch("/api/templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wabaId,action:"sync"})})
      if(response.ok){setLastSynced(new Date());setRefresh(value=>value+1)}
    }catch{/* the next interval retries */}
  }
  useEffect(()=>{if(wabaId)silentSync()},[wabaId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!wabaId||!pendingCount)return
    const timer=setInterval(silentSync,60_000)
    return ()=>clearInterval(timer)
  },[wabaId,pendingCount]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sync(){
    const result=await post({action:"sync"})
    if(result){setNotice(`${result.count} template(s) synced from Meta.`);setLastSynced(new Date())}
  }

  async function remove(template:Template){
    if(!window.confirm(`Delete “${template.name}” from Meta? All languages of this template will be deleted and the name can't be reused for 30 days.`))return
    const result=await post({action:"delete",name:template.name,wabaId:template.wabaId})
    if(result)setNotice(result.message)
  }

  function setButton(index:number,patch:Partial<LibraryButton>){
    setButtons(current=>current.map((button,itemIndex)=>itemIndex===index?{...button,...patch} as LibraryButton:button))
  }

  const tabButton=(id:Tab,label:string)=><button onClick={()=>setTab(id)} style={{border:0,borderBottom:`2px solid ${tab===id?"#075e54":"transparent"}`,
    background:"none",padding:"10px 4px",marginRight:18,fontSize:13,fontWeight:tab===id?700:500,color:tab===id?"#075e54":"#64748b",cursor:"pointer"}}>{label}</button>
  const chip=(active:boolean)=>({border:`1px solid ${active?"#075e54":"#d7e2df"}`,background:active?"#075e54":"#fff",color:active?"#fff":"#365b57",
    borderRadius:16,padding:"5px 11px",fontSize:11,fontWeight:600,cursor:"pointer"}) as React.CSSProperties
  const visible=templates.filter(template=>statusFilter==="ALL"||template.status===statusFilter)

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap",marginBottom:6}}>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>WhatsApp templates</h1>
          <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Welcome to ZKWAConnect&apos;s WhatsApp Template Message Library. Pick a ready-made template, customise it and submit it to Meta in one click.</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <select aria-label="WhatsApp Business Account" value={wabaId} onChange={event=>setWabaId(event.target.value)} style={{...fieldStyle,width:200}}>
            <option value="">Select WABA</option>{wabas.map(waba=><option key={waba.id} value={waba.id}>{waba.name}</option>)}
          </select>
          <button onClick={sync} disabled={busy||!wabaId} style={{border:0,borderRadius:6,padding:"9px 12px",whiteSpace:"nowrap",
            background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{busy?"Working…":"Sync from Meta"}</button>
        </div>
      </div>
      {!loading&&wabas.length===0&&<div style={{fontSize:12,color:"#8a5b00",marginTop:6}}>Connect Meta and select a WABA to submit templates. You can still browse the library.</div>}

      <div style={{borderBottom:"1px solid #e2e8f0",margin:"10px 0 16px"}}>
        {tabButton("library",`Template library (${TEMPLATE_LIBRARY.length})`)}{tabButton("create","Create template")}{tabButton("mine",`My templates (${templates.length})`)}
      </div>

      {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
      {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}

      {tab==="library"&&<>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
          <input aria-label="Search templates" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search templates"
            style={{...fieldStyle,width:"min(100%,300px)"}}/>
          <select aria-label="Category" value={libraryCategory} onChange={event=>setLibraryCategory(event.target.value)} style={{...fieldStyle,width:170}}>
            <option value="All">All categories</option><option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option>
          </select>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {["All",...TEMPLATE_INDUSTRIES].map(item=><button key={item} onClick={()=>setIndustry(item)} style={chip(industry===item)}>{item}</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,300px),1fr))",gap:14}}>
          {library.map(template=><div key={template.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:14,display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:8}}>
              <div style={{fontFamily:"Sora,sans-serif",fontSize:14,fontWeight:700,color:"#183633"}}>{template.title}</div>
              <span style={{fontSize:10,fontWeight:700,borderRadius:10,padding:"3px 8px",height:"fit-content",whiteSpace:"nowrap",
                background:template.category==="MARKETING"?"#ede9fe":"#e0f2fe",color:template.category==="MARKETING"?"#6d28d9":"#0369a1"}}>{template.category}</span>
            </div>
            <div style={{fontSize:11,color:"#71817e",marginBottom:8}}>{template.industry}</div>
            <div style={{flex:1}}><WhatsAppPreview {...template}/></div>
            <button onClick={()=>applyLibraryTemplate(template)} style={{marginTop:10,border:0,borderRadius:6,padding:"9px 12px",
              background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Use this template</button>
          </div>)}
        </div>
        {!library.length&&<div style={{padding:22,fontSize:12,color:"#71817e"}}>No templates match your filters.</div>}
      </>}

      {tab==="create"&&<section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,380px),1fr))",gap:16,alignItems:"start"}}>
        <form onSubmit={submit} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:12}}>
            <label><span style={labelStyle}>Template name</span>
              <input required pattern="[a-z0-9_]+" minLength={2} maxLength={512} value={name}
                onChange={event=>setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_"))} placeholder="order_update" style={fieldStyle}/></label>
            <label><span style={labelStyle}>Language</span>
              <select value={language} onChange={event=>setLanguage(event.target.value)} style={fieldStyle}>
                {LANGUAGES.map(([code,label])=><option key={code} value={code}>{label} ({code})</option>)}</select></label>
            <label><span style={labelStyle}>Category</span>
              <select value={category} disabled={templateType==="CAROUSEL"} onChange={event=>setCategory(event.target.value as typeof category)} style={fieldStyle}>
                <option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Authentication (OTP)</option>
              </select></label>
          </div>
          {category==="AUTHENTICATION"?<div style={{marginTop:14,fontSize:12,color:"#526763",lineHeight:1.6,background:"#f7faf9",borderRadius:6,padding:12}}>
            Meta uses a fixed format for OTP templates: “<em>123456 is your verification code. For your security, do not share this code.</em>”
            with a Copy code button and a 10-minute expiry note. Just pick a name and language.
          </div>:<>
            <span style={{...labelStyle,marginTop:14}}>Template type</span>
            <div role="radiogroup" aria-label="Template type" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {([["TEXT","📝","Text","Text header and message"],["MEDIA","🖼️","Media","Image, video or document"],["CAROUSEL","🎠","Carousel","Gallery of 2–10 cards"]] as const).map(([value,icon,title,hint])=>{
                const on=templateType===value
                return <button type="button" role="radio" aria-checked={on} key={value} onClick={()=>{setTemplateType(value);if(value==="CAROUSEL"){setCategory("MARKETING");if(headerFormat==="DOCUMENT")setHeaderFormat("IMAGE")}}}
                  style={{textAlign:"left",padding:"10px 12px",borderRadius:8,cursor:"pointer",border:`${on?2:1}px solid ${on?"#075e54":"#e2e8f0"}`,background:on?"#f0fdf4":"#fff"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#183633"}}>{icon} {title}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{hint}</div></button>
              })}
            </div>
            {templateType!=="TEXT"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:12,marginTop:12}}>
              <label><span style={labelStyle}>{templateType==="CAROUSEL"?"Card media type":"Header media type"}</span>
                <select value={headerFormat} onChange={event=>{setHeaderFormat(event.target.value as HeaderFormat);setMedia(null);setCards(current=>current.map(card=>({...card,media:null})))}} style={fieldStyle}>
                  <option value="IMAGE">Image</option><option value="VIDEO">Video</option>{templateType==="MEDIA"&&<option value="DOCUMENT">Document (PDF)</option>}
                </select></label>
              {templateType==="MEDIA"&&<label><span style={labelStyle}>Upload {headerFormat.toLowerCase()}</span>
                <input type="file" accept={MEDIA_LIMITS[headerFormat].accept} style={{...fieldStyle,padding:6}}
                  onChange={event=>readUpload(event.target.files?.[0],headerFormat).then(upload=>{setMedia(upload);setError("")}).catch(reason=>setError(reason.message))}/>
                <span style={{display:"block",fontSize:10,color:"#71817e",marginTop:4}}>{media?`✓ ${media.name}`:MEDIA_LIMITS[headerFormat].label}</span></label>}
            </div>}
            {templateType==="CAROUSEL"&&<div style={{fontSize:11,color:"#71817e",marginTop:8,lineHeight:1.5}}>
              Carousel templates are Marketing templates: a main message, then 2–10 swipeable cards. Each card has its own {headerFormat==="VIDEO"?"video":"image"} and text, and every card shares the same buttons.</div>}
            {templateType==="TEXT"&&<label style={{display:"block",marginTop:12}}><span style={labelStyle}>Header (optional)</span>
              <input maxLength={60} value={header} onChange={event=>setHeader(event.target.value)} placeholder="Order confirmed ✅" style={fieldStyle}/></label>}
            <label style={{display:"block",marginTop:12}}><span style={labelStyle}>Message body</span>
              <textarea required maxLength={1024} rows={5} value={body} onChange={event=>setBody(event.target.value)}
                placeholder="Hi {{1}}, your order {{2}} is ready for pickup." style={{...fieldStyle,minHeight:110,resize:"vertical"}}/></label>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#71817e",marginTop:4}}>
              <span>Use {"{{1}}"}, {"{{2}}"}… for variables. Don&apos;t start or end the message with a variable.</span>
              <button type="button" onClick={()=>setBody(current=>`${current}{{${numbers.length+1}}}`)}
                style={{border:0,background:"none",color:"#075e54",fontWeight:700,fontSize:11,cursor:"pointer"}}>+ Add variable</button>
            </div>
            {numbers.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,140px),1fr))",gap:8,marginTop:10}}>
              {numbers.map(number=><label key={number}><span style={labelStyle}>Sample for {`{{${number}}}`}</span>
                <input required value={examples[number-1]||""} style={fieldStyle}
                  onChange={event=>setExamples(current=>{const next=[...current];next[number-1]=event.target.value;return next})}/></label>)}
            </div>}
            {templateType==="CAROUSEL"?<div style={{marginTop:14}}>
              <span style={labelStyle}>Cards ({cards.length}/10)</span>
              {cards.map((card,index)=><div key={index} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:10,marginBottom:8,background:"#fafcfb"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <strong style={{fontSize:12,color:"#183633"}}>Card {index+1}</strong>
                  {cards.length>2&&<button type="button" onClick={()=>setCards(current=>current.filter((_,cardIndex)=>cardIndex!==index))}
                    style={{border:0,background:"none",color:"#b91c1c",fontSize:11,cursor:"pointer"}}>Remove</button>}
                </div>
                <input type="file" accept={MEDIA_LIMITS[headerFormat].accept} aria-label={`Card ${index+1} media`} style={{...fieldStyle,padding:6}}
                  onChange={event=>readUpload(event.target.files?.[0],headerFormat).then(upload=>{setCards(current=>current.map((item,cardIndex)=>cardIndex===index?{...item,media:upload}:item));setError("")})
                    .catch(reason=>setError(reason.message))}/>
                <span style={{display:"block",fontSize:10,color:"#71817e",margin:"3px 0 6px"}}>{card.media?`✓ ${card.media.name}`:MEDIA_LIMITS[headerFormat].label}</span>
                <textarea rows={2} maxLength={160} value={card.body} placeholder="Short card text (up to 160 characters)" aria-label={`Card ${index+1} text`}
                  onChange={event=>setCards(current=>current.map((item,cardIndex)=>cardIndex===index?{...item,body:event.target.value}:item))} style={{...fieldStyle,resize:"vertical"}}/>
              </div>)}
              {cards.length<10&&<button type="button" onClick={()=>setCards(current=>[...current,{media:null,body:""}])}
                style={{border:"1px dashed #9fb5b0",borderRadius:6,background:"#fff",padding:"7px 11px",fontSize:11,color:"#365b57",cursor:"pointer"}}>+ Add card</button>}
              <span style={{...labelStyle,marginTop:12}}>Card buttons (same on every card, 1–2)</span>
              {cardButtons.map((button,index)=><div key={index} style={{display:"grid",gridTemplateColumns:"120px 1fr 1fr auto",gap:6,marginBottom:6}}>
                <select aria-label="Card button type" value={button.type} style={fieldStyle}
                  onChange={event=>setCardButtons(current=>current.map((item,itemIndex)=>itemIndex!==index?item:event.target.value==="URL"?{type:"URL",text:item.text,url:"https://"}:{type:"QUICK_REPLY",text:item.text}))}>
                  <option value="QUICK_REPLY">Quick reply</option><option value="URL">Visit website</option></select>
                <input aria-label="Card button text" maxLength={25} value={button.text} placeholder="Button text" style={fieldStyle}
                  onChange={event=>setCardButtons(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,text:event.target.value} as LibraryButton:item))}/>
                {button.type==="URL"?<input aria-label="Card button URL" value={button.url} style={fieldStyle}
                  onChange={event=>setCardButtons(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,url:event.target.value} as LibraryButton:item))}/>:<span/>}
                {cardButtons.length>1?<button type="button" aria-label="Remove card button" onClick={()=>setCardButtons(current=>current.filter((_,itemIndex)=>itemIndex!==index))}
                  style={{border:"1px solid #e2e8f0",borderRadius:6,background:"#fff",color:"#b91c1c",cursor:"pointer",padding:"0 10px"}}>✕</button>:<span/>}
              </div>)}
              {cardButtons.length<2&&<button type="button" onClick={()=>setCardButtons(current=>[...current,{type:"QUICK_REPLY",text:""}])}
                style={{border:"1px dashed #9fb5b0",borderRadius:6,background:"#fff",padding:"7px 11px",fontSize:11,color:"#365b57",cursor:"pointer"}}>+ Add card button</button>}
            </div>:<>
            <label style={{display:"block",marginTop:12}}><span style={labelStyle}>Footer (optional)</span>
              <input maxLength={60} value={footer} onChange={event=>setFooter(event.target.value)} placeholder="Reply STOP to opt out" style={fieldStyle}/></label>
            <div style={{marginTop:12}}>
              <span style={labelStyle}>Buttons (optional)</span>
              {buttons.map((button,index)=><div key={index} style={{display:"grid",gridTemplateColumns:"130px 1fr 1fr auto",gap:6,marginBottom:6}}>
                <select aria-label="Button type" value={button.type} style={fieldStyle}
                  onChange={event=>setButtons(current=>current.map((item,itemIndex)=>itemIndex!==index?item:
                    event.target.value==="URL"?{type:"URL",text:item.text,url:"https://"}:
                    event.target.value==="PHONE_NUMBER"?{type:"PHONE_NUMBER",text:item.text,phone_number:"+91"}:{type:"QUICK_REPLY",text:item.text}))}>
                  <option value="QUICK_REPLY">Quick reply</option><option value="URL">Visit website</option><option value="PHONE_NUMBER">Call phone</option>
                </select>
                <input aria-label="Button text" maxLength={25} value={button.text} placeholder="Button text" onChange={event=>setButton(index,{text:event.target.value})} style={fieldStyle}/>
                {button.type==="URL"?<span style={{display:"grid",gap:4}}><input aria-label="URL" value={button.url} onChange={event=>setButton(index,{url:event.target.value})} style={fieldStyle}/>
                  <label style={{fontSize:11,color:"#475569",display:"flex",gap:5,alignItems:"center"}} title="The button opens a short link on your domain that counts clicks, then goes to this URL.">
                    <input type="checkbox" checked={Boolean(button.track)} onChange={event=>setButton(index,{track:event.target.checked})}/> Track clicks</label></span>:
                  button.type==="PHONE_NUMBER"?<input aria-label="Phone number" value={button.phone_number} placeholder="+919876543210"
                    onChange={event=>setButton(index,{phone_number:event.target.value})} style={fieldStyle}/>:<span/>}
                <button type="button" aria-label="Remove button" onClick={()=>setButtons(current=>current.filter((_,itemIndex)=>itemIndex!==index))}
                  style={{border:"1px solid #e2e8f0",borderRadius:6,background:"#fff",color:"#b91c1c",cursor:"pointer",padding:"0 10px"}}>✕</button>
              </div>)}
              {buttons.length<10&&<button type="button" onClick={()=>setButtons(current=>[...current,{type:"QUICK_REPLY",text:""}])}
                style={{border:"1px dashed #9fb5b0",borderRadius:6,background:"#fff",padding:"7px 11px",fontSize:11,color:"#365b57",cursor:"pointer"}}>+ Add button</button>}
            </div></>}
          </>}
          <button type="submit" disabled={busy||!wabaId} style={{marginTop:16,border:0,borderRadius:6,padding:"10px 14px",
            background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",opacity:!wabaId?.6:1}}>{busy?"Submitting…":"Submit to Meta for approval"}</button>
          {!wabaId&&<div style={{fontSize:11,color:"#8a5b00",marginTop:6}}>Select a WhatsApp Business Account above first.</div>}
        </form>
        <aside style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:16,position:"sticky",top:72}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:"#71817e",marginBottom:10}}>Preview</div>
          {category==="AUTHENTICATION"?<WhatsAppPreview body={"123456 is your verification code. For your security, do not share this code."}
            footer="This code expires in 10 minutes." buttons={[{type:"QUICK_REPLY",text:"Copy code"}]}/>:
            templateType==="CAROUSEL"?<WhatsAppPreview body={body} examples={examples} mediaFormat={headerFormat} cards={cards} cardButtons={cardButtons}/>:
            <WhatsAppPreview header={templateType==="TEXT"?header:undefined} body={body} footer={footer} buttons={buttons} examples={examples}
              mediaFormat={templateType==="MEDIA"?headerFormat:undefined} media={media}/>}
          <div style={{fontSize:11,color:"#71817e",marginTop:12,lineHeight:1.6}}>
            <strong>Tips for faster approval:</strong> keep marketing and utility content separate, give realistic sample values, and avoid
            asking for sensitive data like card numbers or passwords.
          </div>
        </aside>
      </section>}

      {tab==="mine"&&wabaId&&<div style={{fontSize:12,color:"#64748b",marginBottom:8}}>
        {lastSynced?`Synced with Meta at ${lastSynced.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`:"Syncing with Meta…"}
        {pendingCount>0&&` · ${pendingCount} awaiting Meta review — checking every minute. Review usually takes a few minutes, sometimes up to 24 hours.`}
      </div>}
      {tab==="mine"&&<section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #e8efee",display:"flex",gap:6,flexWrap:"wrap"}}>
          {["ALL","APPROVED","PENDING","REJECTED","PAUSED"].map(status=><button key={status} onClick={()=>setStatusFilter(status)} style={chip(statusFilter===status)}>
            {status==="ALL"?"All":status.charAt(0)+status.slice(1).toLowerCase()} ({status==="ALL"?templates.length:templates.filter(template=>template.status===status).length})</button>)}
        </div>
        {loading?<div style={{padding:20,fontSize:12,color:"#647b77"}}>Loading templates…</div>:visible.length?
          <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:760,borderCollapse:"collapse",textAlign:"left",fontSize:12}}>
            <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Name","Category","Language","Status","Message preview",""].map(label=><th key={label} style={{padding:11,fontWeight:600}}>{label}</th>)}</tr></thead>
            <tbody>{visible.map(template=><tr key={template.id} style={{borderTop:"1px solid #edf1f0"}}>
              <td style={{padding:11,fontWeight:700,color:"#183633"}}>{template.name}</td><td style={{padding:11}}>{template.category}</td>
              <td style={{padding:11}}>{template.language}</td><td style={{padding:11,fontWeight:600,color:template.status==="APPROVED"?"#168253":template.status==="REJECTED"?"#a83226":"#9a6700"}}>{template.status}</td>
              <td style={{padding:11,maxWidth:380}}>{template.content||"Synced template"}{template.rejectionReason&&template.rejectionReason!=="NONE"&&<div style={{color:"#a83226",marginTop:4}}>{template.rejectionReason}</div>}</td>
              <td style={{padding:11}}><button disabled={busy} onClick={()=>remove(template)} style={{border:"1px solid #e2e8f0",borderRadius:4,padding:"6px 8px",
                background:"#fff",color:"#8b2c22",fontSize:10,cursor:"pointer"}}>Delete</button></td>
            </tr>)}</tbody>
          </table></div>:<div style={{padding:22,fontSize:12,color:"#71817e"}}>No templates here yet. Pick one from the library or sync from Meta.</div>}
      </section>}
    </div>
  )
}
