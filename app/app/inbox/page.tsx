"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ProductPicker } from "@/components/inbox/ProductPicker"

type Status = "OPEN"|"PENDING"|"RESOLVED"
type ListItem = {
  id:string; status:Status; unreadCount:number; lastMessageAt:string|null; channel?:string; instagramAccount?:{username:string}|null
  contact:{id:string;name:string|null;phone:string}
  assignedUser:{id:string;name:string}|null
  messages:{content:string|null;type:string;direction:string;createdAt:string}[]
}
type Message = {
  id:string; direction:"INBOUND"|"OUTBOUND"|"NOTE"; type:string; content:string|null; status:string|null; createdAt:string; sentAt:string|null
  senderUser:{name:string}|null; media:{filename:string|null;mime:string|null}|null
}
type QuickReply = {id:string;shortcut:string;content:string}
type AdReferral = {sourceType:string;sourceId:string|null;sourceUrl:string|null;headline:string|null;body:string|null;createdAt:string}
type Detail = {
  conversation:{
    id:string; status:Status; assignedUser:{id:string;name:string}|null; channel?:string; instagramAccount?:{username:string}|null
    contact:{id:string;name:string|null;phone:string;email:string|null;tags:unknown;metadata:unknown;optedIn:boolean;source:string|null;createdAt:string}
    phoneNumber:{phoneNumber:string;displayName:string|null}|null
    messages:Message[]
  }
  windowOpen:boolean; windowEndsAt:string|null
  templates:{id:string;name:string;language:string;content:string|null}[]
  quickReplies:QuickReply[]; adReferral:AdReferral|null
}

const STATUS_STYLE:Record<Status,{bg:string;border:string;color:string}> = {
  OPEN:{bg:"#f0fdf4",border:"#bbf7d0",color:"#15803d"},
  PENDING:{bg:"#fffbeb",border:"#fde68a",color:"#b45309"},
  RESOLVED:{bg:"#eff6ff",border:"#bfdbfe",color:"#1d4ed8"},
}
const COLORS = ["#075E54","#1d4ed8","#7c3aed","#d97706","#dc2626","#0891b2"]
const TYPE_LABEL:Record<string,string> = {IMAGE:"📷 Photo",VIDEO:"🎥 Video",AUDIO:"🎤 Voice message",DOCUMENT:"📄 Document",STICKER:"Sticker",
  LOCATION:"📍 Location",REQUEST_WELCOME:"👋 Opened the chat for the first time",CONTACTS:"👤 Contact card",REACTION:"Reaction",UNSUPPORTED:"Unsupported message"}

function initials(name:string|null,phone:string){ return (name||phone).replace(/[^\p{L}\p{N} ]/gu,"").split(" ").filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"#" }
function colorFor(id:string){ let hash=0;for(const char of id)hash=(hash*31+char.charCodeAt(0))|0;return COLORS[Math.abs(hash)%COLORS.length] }
function preview(message?:{content:string|null;type:string;direction:string}){
  if(!message)return "No messages yet"
  if(message.direction==="NOTE")return `📝 Note: ${message.content||""}`
  return `${message.direction==="OUTBOUND"?"You: ":""}${message.content||TYPE_LABEL[message.type]||message.type.toLowerCase()}`
}
function shortTime(value:string|null){
  if(!value)return ""
  const date=new Date(value), now=new Date()
  if(date.toDateString()===now.toDateString())return date.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})
  return date.toLocaleDateString([], {day:"numeric",month:"short"})
}
function ticks(status:string|null){
  switch(status){
    case "READ": return <span style={{color:"#53bdeb"}}>✓✓</span>
    case "DELIVERED": return "✓✓"
    case "SENT": return "✓"
    case "FAILED": return <span style={{color:"#dc2626"}}>⚠ Failed</span>
    default: return "🕓"
  }
}

export default function InboxPage() {
  const [status,setStatus] = useState<Status|"ALL">("OPEN")
  const [mine,setMine] = useState(false)
  const [search,setSearch] = useState("")
  const [query,setQuery] = useState("")
  const [list,setList] = useState<ListItem[]>([])
  const [counts,setCounts] = useState<Record<string,number>>({})
  const [members,setMembers] = useState<{id:string;name:string}[]>([])
  const [selectedId,setSelectedId] = useState<string|null>(null)
  const [detail,setDetail] = useState<Detail|null>(null)
  const [text,setText] = useState("")
  const [templateId,setTemplateId] = useState("")
  const [templateParams,setTemplateParams] = useState<string[]>([])
  const [showTemplates,setShowTemplates] = useState(false)
  const [loadingList,setLoadingList] = useState(true)
  const [sending,setSending] = useState(false)
  const [error,setError] = useState("")
  const [mode,setMode] = useState<"reply"|"note">("reply")
  const [file,setFile] = useState<File|null>(null)
  const [quickOpen,setQuickOpen] = useState(false)
  const [productsOpen,setProductsOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastMessageId = useRef("")

  const loadList = useCallback(async()=>{
    const params = new URLSearchParams({status,q:query,...(mine?{mine:"1"}:{})})
    const response = await fetch(`/api/inbox?${params.toString()}`)
    const body = await response.json()
    if(!response.ok)throw new Error(body.error||"Could not load conversations.")
    setList(body.conversations);setCounts(body.counts||{});setMembers(body.members||[])
  },[status,query,mine])

  const loadDetail = useCallback(async(id:string)=>{
    const response = await fetch(`/api/inbox?conversationId=${encodeURIComponent(id)}`)
    const body = await response.json()
    if(!response.ok)throw new Error(body.error||"Could not load conversation.")
    setDetail(body)
  },[])

  useEffect(()=>{const timer = setTimeout(()=>setQuery(search.trim()),300);return ()=>clearTimeout(timer)},[search])
  useEffect(()=>{ const id = new URLSearchParams(window.location.search).get("c"); if(id){ setStatus("ALL"); setSelectedId(id) } },[])

  // Poll for new messages: the list every 8s, the open chat every 4s.
  useEffect(()=>{
    const run = ()=>loadList().catch(reason=>setError(reason.message)).finally(()=>setLoadingList(false))
    run()
    const timer = setInterval(run,8000)
    return ()=>clearInterval(timer)
  },[loadList])
  useEffect(()=>{
    if(!selectedId)return
    const run = ()=>loadDetail(selectedId).catch(reason=>setError(reason.message))
    run()
    const timer = setInterval(run,4000)
    return ()=>clearInterval(timer)
  },[selectedId,loadDetail])

  useEffect(()=>{
    const last = detail?.conversation.messages.at(-1)?.id||""
    if(last!==lastMessageId.current){lastMessageId.current = last;endRef.current?.scrollIntoView({block:"end"})}
  },[detail])

  function open(id:string){
    setSelectedId(id);setDetail(null);setText("");setShowTemplates(false);setTemplateId("");setError("");setMode("reply");setFile(null);setQuickOpen(false)
    lastMessageId.current = ""
  }

  async function patch(data:{status?:Status;assignedUserId?:string|null}){
    if(!selectedId)return
    const response = await fetch("/api/inbox",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:selectedId,...data})})
    const body = await response.json()
    if(!response.ok){setError(body.error||"Update failed.");return}
    await Promise.all([loadList(),loadDetail(selectedId)]).catch(reason=>setError(reason.message))
  }

  async function send(payload:Record<string,unknown>){
    if(!selectedId)return false
    setSending(true);setError("")
    try{
      const response = await fetch("/api/inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:selectedId,...payload})})
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"Message could not be sent.")
      await loadDetail(selectedId)
      return true
    }catch(reason){setError(reason instanceof Error?reason.message:"Message could not be sent.");return false}
    finally{setSending(false)}
  }

  async function sendText(){
    const value = text.trim()
    if(file)return sendFile()
    if(!value)return
    if(await send(mode==="note"?{note:value}:{text:value}))setText("")
  }

  async function sendFile(){
    if(!selectedId||!file)return
    setSending(true);setError("")
    try{
      const form = new FormData()
      form.append("conversationId",selectedId);form.append("file",file);form.append("caption",text.trim())
      const response = await fetch("/api/inbox",{method:"POST",body:form})
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"File could not be sent.")
      setFile(null);setText("");if(fileRef.current)fileRef.current.value=""
      await loadDetail(selectedId)
    }catch(reason){setError(reason instanceof Error?reason.message:"File could not be sent.")}
    finally{setSending(false)}
  }

  function pickFile(event:React.ChangeEvent<HTMLInputElement>){
    const chosen = event.target.files?.[0]
    if(!chosen)return
    const limits:[RegExp,number,string][] = [[/^image\//,5,"Images"],[/^(video|audio)\//,16,"Videos and audio"],[/./,25,"Documents"]]
    const [,mb,label] = limits.find(([pattern])=>pattern.test(chosen.type))!
    if(chosen.size>mb*1024*1024){setError(`${label} can be up to ${mb} MB on WhatsApp.`);event.target.value="";return}
    setFile(chosen);setMode("reply");setError("")
  }

  // "/shortcut" at the start of the box suggests quick replies.
  const slash = text.startsWith("/")?text.slice(1).toLowerCase():null
  const quickMatches = (detail?.quickReplies||[]).filter(item=>slash===null?quickOpen:item.shortcut.includes(slash)||item.content.toLowerCase().includes(slash)).slice(0,8)
  function useQuickReply(item:QuickReply){
    const name = detail?.conversation.contact.name||"there"
    setText(item.content.replace(/\{\{\s*name\s*\}\}/gi,name));setQuickOpen(false)
  }

  const template = detail?.templates.find(item=>item.id===templateId)
  const templateVars = [...new Set([...(template?.content||"").matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])))].sort((a,b)=>a-b)

  async function sendTemplate(){
    if(!template)return
    if(await send({templateId,parameters:templateVars.map(number=>templateParams[number-1]||"")})){
      setTemplateId("");setTemplateParams([]);setShowTemplates(false)
    }
  }

  const conversation = detail?.conversation
  const contact = conversation?.contact
  const tags = Array.isArray(contact?.tags)?(contact!.tags as unknown[]).filter((tag):tag is string=>typeof tag==="string"):[]
  const metadata = contact?.metadata&&typeof contact.metadata==="object"?contact.metadata as Record<string,unknown>:{}
  const attributes = metadata.attributes&&typeof metadata.attributes==="object"?Object.entries(metadata.attributes as Record<string,unknown>):[]
  const hoursLeft = detail?.windowEndsAt?Math.max(0,Math.round((new Date(detail.windowEndsAt).getTime()-Date.now())/3_600_000)):0

  return (
    <div className={`zk-inbox${selectedId?" has-chat":""}`} style={{display:"flex",height:"calc(100vh - 104px)",minHeight:520,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
      <style>{`@media(max-width:760px){
        .zk-inbox{height:calc(100dvh - 92px) !important;min-height:0 !important;border-radius:8px !important}
        .zk-inbox .zk-inbox-list{width:100% !important;border-right:0 !important}
        .zk-inbox.has-chat .zk-inbox-list{display:none !important}
        .zk-inbox:not(.has-chat) .zk-inbox-chat{display:none !important}
        .zk-inbox .zk-inbox-contact{display:none !important}
        .zk-inbox .zk-inbox-back{display:inline-flex !important}
      }`}</style>
      {/* Conversation list */}
      <div className="zk-inbox-list" style={{width:300,flexShrink:0,borderRight:"1px solid #e2e8f0",display:"flex",flexDirection:"column"}}>
        <div style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>
          <input aria-label="Search conversations" value={search} onChange={event=>setSearch(event.target.value)} placeholder="🔍 Search name or number"
            style={{width:"100%",boxSizing:"border-box",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none"}}/>
          <div style={{display:"flex",gap:5,marginTop:8}}>
            {(["OPEN","PENDING","RESOLVED","ALL"] as const).map(item=>{
              const on = status===item, style = item==="ALL"?{bg:"#f1f5f9",border:"#cbd5e1",color:"#334155"}:STATUS_STYLE[item]
              return <button key={item} onClick={()=>setStatus(item)} style={{flex:1,padding:"5px 2px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",
                background:on?style.bg:"#f8fafc",border:`1px solid ${on?style.border:"#e2e8f0"}`,color:on?style.color:"#64748b"}}>
                {item}{item!=="ALL"&&counts[item]?` ${counts[item]}`:""}</button>
            })}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#64748b"}}>
              <input type="checkbox" checked={mine} onChange={event=>setMine(event.target.checked)}/> Assigned to me
            </label>
            <a href="/app/inbox/settings" title="Quick replies, auto-assignment, business hours" style={{fontSize:11,color:"#075e54",fontWeight:700,textDecoration:"none"}}>⚙ Inbox settings</a>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {loadingList?<div style={{padding:16,fontSize:12,color:"#64748b"}}>Loading conversations…</div>:
            list.length?list.map(item=><button key={item.id} onClick={()=>open(item.id)} style={{display:"flex",gap:10,width:"100%",textAlign:"left",padding:12,
              border:0,borderBottom:"1px solid #f1f5f9",background:selectedId===item.id?"#f0fdf4":"#fff",cursor:"pointer"}}>
              <span style={{width:38,height:38,borderRadius:"50%",background:colorFor(item.contact.id),color:"#fff",flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700}}>{initials(item.contact.name,item.contact.phone)}</span>
              <span style={{flex:1,minWidth:0}}>
                <span style={{display:"flex",justifyContent:"space-between",gap:6}}>
                  <span style={{fontSize:13,fontWeight:item.unreadCount?700:600,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {item.channel==="INSTAGRAM"&&<span title="Instagram" style={{marginRight:4}}>📸</span>}{item.contact.name||(item.channel==="INSTAGRAM"?"Instagram user":`+${item.contact.phone}`)}</span>
                  <span style={{fontSize:10,color:item.unreadCount?"#15803d":"#94a3b8",flexShrink:0}}>{shortTime(item.lastMessageAt)}</span>
                </span>
                <span style={{display:"flex",justifyContent:"space-between",gap:6,marginTop:2}}>
                  <span style={{fontSize:12,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview(item.messages[0])}</span>
                  {item.unreadCount>0&&<span style={{background:"#25D366",color:"#fff",borderRadius:10,minWidth:18,height:18,padding:"0 5px",boxSizing:"border-box",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{item.unreadCount}</span>}
                </span>
                {item.assignedUser&&<span style={{display:"block",fontSize:10,color:"#94a3b8",marginTop:2}}>👤 {item.assignedUser.name}</span>}
              </span>
            </button>):
            <div style={{padding:20,fontSize:12,color:"#64748b",lineHeight:1.6}}>
              {search?"No conversations match your search.":`No ${status==="ALL"?"":status.toLowerCase()+" "}conversations. New WhatsApp messages appear here automatically.`}</div>}
        </div>
      </div>

      {/* Chat */}
      <div className="zk-inbox-chat" style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,background:"#efeae2"}}>
        {!selectedId?<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#64748b",gap:8,padding:20,textAlign:"center"}}>
          <div style={{fontSize:44}}>💬</div>
          <div style={{fontFamily:"Sora,sans-serif",fontSize:16,fontWeight:700,color:"#0f172a"}}>Select a conversation</div>
          <div style={{fontSize:13,maxWidth:340}}>Reply to customers, send templates, assign chats to teammates and mark them resolved. The inbox refreshes automatically.</div>
        </div>:!conversation?<div style={{padding:20,fontSize:12,color:"#64748b"}}>Loading conversation…</div>:<>
          <div style={{background:"#fff",padding:"10px 16px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <button className="zk-inbox-back" onClick={()=>{setSelectedId(null);setDetail(null)}} aria-label="Back to conversations"
              style={{display:"none",border:0,background:"none",fontSize:20,cursor:"pointer",color:"#075e54",padding:0}}>←</button>
            <span style={{width:36,height:36,borderRadius:"50%",background:colorFor(contact!.id),color:"#fff",display:"flex",alignItems:"center",
              justifyContent:"center",fontWeight:700,fontSize:13}}>{initials(contact!.name,contact!.phone)}</span>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>{contact!.name||`+${contact!.phone}`}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{conversation.channel==="INSTAGRAM"
                ?<>📸 Instagram · @{conversation.instagramAccount?.username||"account"}</>
                :<>+{contact!.phone} · via {conversation.phoneNumber?.displayName||conversation.phoneNumber?.phoneNumber}</>}</div>
              {detail.adReferral&&<div title={detail.adReferral.body||""} style={{display:"inline-block",marginTop:3,fontSize:10,fontWeight:700,color:"#1d4ed8",background:"#eff6ff",borderRadius:10,padding:"2px 8px"}}>
                📣 From {detail.adReferral.sourceType==="ad"?"ad":"post"}{detail.adReferral.headline?`: ${detail.adReferral.headline}`:""}</div>}
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <select aria-label="Assign conversation" value={conversation.assignedUser?.id||""} onChange={event=>patch({assignedUserId:event.target.value||null})}
                style={{fontSize:12,border:"1px solid #e2e8f0",borderRadius:6,padding:"5px 8px",background:"#fff"}}>
                <option value="">Unassigned</option>{members.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {(["OPEN","PENDING","RESOLVED"] as const).map(item=>{
                const on = conversation.status===item, style = STATUS_STYLE[item]
                return <button key={item} onClick={()=>patch({status:item})} aria-pressed={on} style={{fontSize:11,fontWeight:700,borderRadius:6,padding:"5px 10px",cursor:"pointer",
                  background:on?style.bg:"#fff",border:`1px solid ${on?style.border:"#e2e8f0"}`,color:on?style.color:"#64748b"}}>{item}</button>
              })}
            </div>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:6}}>
            {conversation.messages.map((message,index)=>{
              const at = message.sentAt||message.createdAt
              const previous = conversation.messages[index-1]
              const newDay = !previous||new Date(previous.sentAt||previous.createdAt).toDateString()!==new Date(at).toDateString()
              const outbound = message.direction==="OUTBOUND"
              const note = message.direction==="NOTE"
              const src = `/api/inbox/media/${message.id}`
              const media = message.media&&(message.type==="IMAGE"||message.type==="STICKER"?<a href={src} target="_blank" rel="noreferrer"><img src={src} alt={message.content||"Photo"} loading="lazy"
                  style={{display:"block",maxWidth:260,maxHeight:260,borderRadius:6,marginBottom:message.content?4:0,background:"#f1f5f9"}}/></a>
                :message.type==="VIDEO"?<video src={src} controls preload="none" style={{display:"block",maxWidth:280,borderRadius:6,marginBottom:4}}/>
                :message.type==="AUDIO"?<audio src={src} controls preload="none" style={{display:"block",maxWidth:260,marginBottom:4}}/>
                :<a href={src} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:8,background:"rgba(0,0,0,.04)",borderRadius:6,padding:"8px 10px",
                  color:"#075e54",fontWeight:700,textDecoration:"none",marginBottom:4}}>📄 {message.media.filename||"Document"}</a>)
              if(note)return <div key={message.id} style={{alignSelf:"flex-end",maxWidth:"72%",background:"#fef9c3",border:"1px dashed #eab308",borderRadius:10,padding:"7px 10px",
                fontSize:13,color:"#422006",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#a16207",marginBottom:2}}>📝 Internal note{message.senderUser?` · ${message.senderUser.name}`:""} · only your team sees this</div>
                {message.content}
                <div style={{fontSize:10,color:"#a16207",textAlign:"right",marginTop:2}}>{new Date(at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</div>
              </div>
              return <div key={message.id} style={{display:"contents"}}>
                {newDay&&<div style={{alignSelf:"center",background:"#fff",color:"#54656f",fontSize:11,borderRadius:6,padding:"3px 10px",margin:"6px 0",boxShadow:"0 1px 1px rgba(0,0,0,.06)"}}>
                  {new Date(at).toLocaleDateString([], {weekday:"short",day:"numeric",month:"short",year:"numeric"})}</div>}
                <div style={{alignSelf:outbound?"flex-end":"flex-start",maxWidth:"72%"}}>
                  <div style={{background:outbound?"#d9fdd3":"#fff",borderRadius:outbound?"10px 10px 2px 10px":"10px 10px 10px 2px",padding:"7px 10px",
                    fontSize:13,color:"#111b21",whiteSpace:"pre-wrap",overflowWrap:"anywhere",boxShadow:"0 1px 1px rgba(0,0,0,.08)"}}>
                    {outbound&&(message.senderUser||message.type==="TEMPLATE")&&<div style={{fontSize:10,fontWeight:700,color:"#075e54",marginBottom:2}}>
                      {message.type==="TEMPLATE"?"📋 Template":""}{message.senderUser?`${message.type==="TEMPLATE"?" · ":""}${message.senderUser.name}`:""}</div>}
                    {media}
                    {message.content||(!media&&<em style={{color:"#54656f"}}>{TYPE_LABEL[message.type]||message.type.toLowerCase()}</em>)}
                    <div style={{fontSize:10,color:"#667781",textAlign:"right",marginTop:2}}>
                      {new Date(at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}{outbound&&<> · {ticks(message.status)}</>}
                    </div>
                  </div>
                </div>
              </div>
            })}
            {!conversation.messages.length&&<div style={{alignSelf:"center",fontSize:12,color:"#54656f"}}>No messages yet.</div>}
            <div ref={endRef}/>
          </div>

          {error&&<div role="alert" style={{background:"#fef2f2",color:"#991b1b",fontSize:12,padding:"8px 16px",borderTop:"1px solid #fecaca"}}>{error}</div>}
          <div style={{background:"#fff",padding:"10px 16px",borderTop:"1px solid #e2e8f0"}}>
            <div role="tablist" style={{display:"flex",gap:4,marginBottom:8}}>
              {([["reply","💬 Reply"],["note","📝 Internal note"]] as const).map(([value,label])=><button key={value} role="tab" aria-selected={mode===value}
                onClick={()=>{setMode(value);setShowTemplates(false);if(value==="note")setFile(null)}}
                style={{border:0,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",
                  background:mode===value?(value==="note"?"#fef9c3":"#dcfce7"):"#f1f5f9",color:mode===value?(value==="note"?"#854d0e":"#166534"):"#64748b"}}>{label}</button>)}
            </div>
            {mode==="reply"&&!detail.windowOpen&&!showTemplates&&<div style={{fontSize:12,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
              {conversation.channel==="INSTAGRAM"?"The 24-hour reply window is closed. Instagram only allows replies within 24 hours of the customer's last message.":
                "The 24-hour reply window is closed. WhatsApp only allows an approved template until the customer replies."}
              {conversation.channel!=="INSTAGRAM"&&<button onClick={()=>setShowTemplates(true)} style={{marginLeft:8,border:0,background:"none",color:"#075e54",fontWeight:700,cursor:"pointer",fontSize:12}}>Send a template →</button>}
            </div>}
            {mode==="reply"&&showTemplates?<div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <select aria-label="Template" value={templateId} onChange={event=>{setTemplateId(event.target.value);setTemplateParams([])}}
                  style={{flex:1,border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                  <option value="">{detail.templates.length?"Choose an approved template":"No approved templates for this number"}</option>
                  {detail.templates.map(item=><option key={item.id} value={item.id}>{item.name} · {item.language}</option>)}
                </select>
                <button onClick={()=>setShowTemplates(false)} style={{border:"1px solid #e2e8f0",borderRadius:8,background:"#fff",padding:"8px 10px",fontSize:12,cursor:"pointer"}}>Cancel</button>
              </div>
              {template&&<>
                {templateVars.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:6,marginBottom:8}}>
                  {templateVars.map(number=><input key={number} aria-label={`Variable ${number}`} placeholder={`{{${number}}}`} value={templateParams[number-1]||""}
                    onChange={event=>setTemplateParams(current=>{const next = [...current];next[number-1] = event.target.value;return next})}
                    style={{border:"1px solid #cbd5e1",borderRadius:6,padding:"7px 9px",fontSize:12}}/>)}
                </div>}
                <div style={{fontSize:12,color:"#334155",background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:8,whiteSpace:"pre-wrap"}}>
                  {(template.content||template.name).replace(/\{\{(\d+)\}\}/g,(match,number)=>templateParams[Number(number)-1]||match)}</div>
                <button onClick={sendTemplate} disabled={sending||templateVars.some(number=>!templateParams[number-1]?.trim())}
                  style={{border:0,borderRadius:8,padding:"9px 16px",background:"#075e54",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  {sending?"Sending…":"Send template"}</button>
              </>}
            </div>:(mode==="note"||detail.windowOpen)&&<div style={{position:"relative"}}>
              {mode==="reply"&&quickMatches.length>0&&(slash!==null||quickOpen)&&<div role="listbox" aria-label="Quick replies" style={{position:"absolute",bottom:"100%",left:0,right:0,marginBottom:6,
                background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(15,23,42,.12)",maxHeight:240,overflowY:"auto",zIndex:5}}>
                {quickMatches.map(item=><button key={item.id} role="option" aria-selected={false} onClick={()=>useQuickReply(item)} style={{display:"block",width:"100%",textAlign:"left",border:0,
                  borderBottom:"1px solid #f1f5f9",background:"#fff",padding:"8px 12px",cursor:"pointer"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#075e54"}}>/{item.shortcut}</span>
                  <span style={{display:"block",fontSize:12,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.content}</span>
                </button>)}
              </div>}
              {mode==="reply"&&productsOpen&&selectedId&&<ProductPicker conversationId={selectedId} onClose={()=>setProductsOpen(false)}
                onSent={()=>{setProductsOpen(false);if(selectedId)loadDetail(selectedId).catch(()=>null)}}/>}
              {file&&<div style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"6px 10px",marginBottom:8,fontSize:12}}>
                📎 <strong style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{file.name}</strong>
                <span style={{color:"#64748b"}}>{(file.size/1024/1024).toFixed(1)} MB · the text below becomes the caption</span>
                <button onClick={()=>{setFile(null);if(fileRef.current)fileRef.current.value=""}} aria-label="Remove file" style={{marginLeft:"auto",border:0,background:"none",cursor:"pointer",color:"#b91c1c"}}>✕</button>
              </div>}
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                {mode==="reply"&&conversation.channel!=="INSTAGRAM"&&<>
                  <input ref={fileRef} type="file" hidden onChange={pickFile}
                    accept="image/jpeg,image/png,video/mp4,video/3gpp,audio/aac,audio/mpeg,audio/mp4,audio/ogg,audio/amr,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"/>
                  <button onClick={()=>fileRef.current?.click()} aria-label="Attach a file" title="Attach photo, video, audio or document"
                    style={{border:"1px solid #e2e8f0",background:"#fff",borderRadius:10,padding:"9px 11px",fontSize:15,cursor:"pointer"}}>📎</button>
                </>}
                <textarea aria-label={mode==="note"?"Internal note":"Message"} rows={1} value={text} onChange={event=>setText(event.target.value)}
                  placeholder={mode==="note"?"Write a note for your team (not sent to the customer)…":file?"Add a caption (optional)…":"Type a message, or / for quick replies… (Enter to send)"}
                  onKeyDown={event=>{
                    if(event.key==="Escape"){setQuickOpen(false);if(slash!==null)setText("")}
                    if(event.key==="Enter"&&!event.shiftKey){event.preventDefault()
                      if(mode==="reply"&&slash!==null&&quickMatches.length){useQuickReply(quickMatches[0]);return}
                      sendText()}
                  }}
                  style={{flex:1,border:`1.5px solid ${mode==="note"?"#eab308":"#e2e8f0"}`,borderRadius:12,padding:"10px 14px",fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",
                    maxHeight:120,minHeight:42,background:mode==="note"?"#fefce8":"#fff"}}/>
                <button onClick={sendText} disabled={sending||(!text.trim()&&!file)} aria-label={mode==="note"?"Save note":"Send"} style={{background:mode==="note"?"#ca8a04":"#25D366",border:0,borderRadius:12,
                  padding:"10px 18px",color:"#fff",fontSize:mode==="note"?12:16,fontWeight:700,cursor:"pointer",opacity:sending||(!text.trim()&&!file)?.5:1}}>{sending?"…":mode==="note"?"Save note":"➤"}</button>
              </div>
              {mode==="reply"&&<div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:6,fontSize:11,color:"#64748b",flexWrap:"wrap"}}>
                <span style={{display:"flex",gap:6,visibility:conversation.channel==="INSTAGRAM"?"hidden":"visible"}}>
                  <button onClick={()=>setShowTemplates(true)} style={{border:"1px solid #e2e8f0",borderRadius:6,background:"#f8fafc",padding:"3px 9px",fontSize:11,color:"#475569",cursor:"pointer"}}>📋 Template</button>
                  <button onClick={()=>setProductsOpen(value=>!value)} style={{border:"1px solid #e2e8f0",borderRadius:6,background:"#f8fafc",padding:"3px 9px",fontSize:11,color:"#475569",cursor:"pointer"}}>🛍️ Products</button>
                  <button onClick={()=>setQuickOpen(value=>!value)} style={{border:"1px solid #e2e8f0",borderRadius:6,background:"#f8fafc",padding:"3px 9px",fontSize:11,color:"#475569",cursor:"pointer"}}>
                    ⚡ Quick replies{detail.quickReplies.length?` (${detail.quickReplies.length})`:""}</button>
                </span>
                <span>Reply window open · closes in ~{hoursLeft}h</span>
              </div>}
              {mode==="reply"&&quickOpen&&!detail.quickReplies.length&&<div style={{fontSize:11,color:"#64748b",marginTop:6}}>
                No quick replies yet. <a href="/app/inbox/settings" style={{color:"#075e54",fontWeight:700}}>Create some →</a></div>}
            </div>}
          </div>
        </>}
      </div>

      {/* Contact details */}
      {conversation&&<aside className="zk-inbox-contact" style={{width:250,flexShrink:0,borderLeft:"1px solid #e2e8f0",padding:16,overflowY:"auto",fontSize:12,color:"#334155"}}>
        <div style={{fontFamily:"Sora,sans-serif",fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:10}}>Contact</div>
        {[["Name",contact!.name||"—"],conversation.channel==="INSTAGRAM"?["Instagram","Direct message"]:["WhatsApp",`+${contact!.phone}`],["Email",contact!.email||"—"],["Source",contact!.source||"Manual"],
          ["Since",new Date(contact!.createdAt).toLocaleDateString()]].map(([label,value])=>
          <div key={label} style={{marginBottom:8}}><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em"}}>{label}</div>
            <div style={{overflowWrap:"anywhere"}}>{value}</div></div>)}
        <div style={{marginBottom:8}}><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em"}}>Marketing consent</div>
          <div style={{color:contact!.optedIn?"#15803d":"#b45309"}}>{contact!.optedIn?"Opted in":"Not opted in"}</div></div>
        <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em",margin:"12px 0 5px"}}>Tags</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{tags.length?tags.map(tag=><span key={tag} style={{background:"#eef2ff",color:"#4338ca",borderRadius:10,padding:"2px 8px",fontSize:10}}>{tag}</span>):<span style={{color:"#94a3b8"}}>No tags</span>}</div>
        {attributes.length>0&&<>
          <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em",margin:"12px 0 5px"}}>Collected by chatbot</div>
          {attributes.map(([key,value])=><div key={key} style={{marginBottom:4}}><strong>{key}:</strong> {String(value)}</div>)}
        </>}
        {detail.adReferral&&<>
          <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em",margin:"12px 0 5px"}}>Came from</div>
          <div style={{background:"#eff6ff",borderRadius:8,padding:8}}>
            <div style={{fontWeight:700,color:"#1d4ed8"}}>{detail.adReferral.sourceType==="ad"?"📣 Click-to-WhatsApp ad":"📌 Facebook/Instagram post"}</div>
            {detail.adReferral.headline&&<div style={{marginTop:3}}>{detail.adReferral.headline}</div>}
            {detail.adReferral.sourceId&&<div style={{color:"#64748b",marginTop:3}}>ID {detail.adReferral.sourceId}</div>}
            {detail.adReferral.sourceUrl&&<a href={detail.adReferral.sourceUrl} target="_blank" rel="noreferrer" style={{color:"#1d4ed8"}}>View {detail.adReferral.sourceType==="ad"?"ad":"post"} ↗</a>}
          </div>
        </>}
        <a href={`/app/contacts?q=${encodeURIComponent(contact!.phone)}`} style={{display:"inline-block",marginTop:14,color:"#075e54",fontWeight:700,textDecoration:"none"}}>Open in Contacts →</a>
      </aside>}
    </div>
  )
}
