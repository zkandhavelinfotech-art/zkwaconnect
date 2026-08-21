"use client"
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { messageApi } from '@/lib/api'
import { toast } from 'sonner'

export default function InboxPage() {
  const qc = useQueryClient()
  const [conv, setConv]   = useState<any>(null)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('')
  const [msg, setMsg]     = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: cData, isLoading } = useQuery({
    queryKey: ['conversations', search, statusF],
    queryFn: () => messageApi.conversations({ search, status: statusF, pageSize: 30 }).then(r => r.data.data),
    refetchInterval: 8000,
  })
  const { data: msgs } = useQuery({
    queryKey: ['messages', conv?.id],
    queryFn: () => messageApi.history(conv.id).then(r => r.data.data),
    enabled: !!conv?.id, refetchInterval: 4000,
  })
  const sendMut = useMutation({
    mutationFn: (text: string) => messageApi.send({ conversationId: conv.id, content: { text }, type: 'TEXT' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messages', conv?.id] }); setMsg('') },
    onError: () => toast.error('Send failed'),
  })
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const convs = cData?.conversations || []
  const messages = Array.isArray(msgs) ? msgs : []
  const SC: any = { OPEN:'badge-blue', PENDING:'badge-yellow', RESOLVED:'badge-green', ARCHIVED:'badge-slate' }
  const av = (n: string) => `hsl(${(n||'?').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360},55%,50%)`
  const ago = (ts: string) => { const d=Math.floor((Date.now()-new Date(ts).getTime())/1000); if(d<3600)return`${Math.floor(d/60)}m`; if(d<86400)return`${Math.floor(d/3600)}h`; return new Date(ts).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) }

  return (
    <div style={{display:'flex',height:'calc(100vh - 0px)',overflow:'hidden'}}>
      {/* List */}
      <div style={{width:300,flexShrink:0}} className="bg-white border-r border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 flex-1 text-sm">Inbox</h2>
            <span className="badge badge-blue">{cData?.total||0}</span>
          </div>
          <input className="form-input text-xs" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div className="flex gap-1 flex-wrap">
            {['','OPEN','PENDING','RESOLVED'].map(s=>(
              <button key={s} onClick={()=>setStatusF(s)} className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${statusF===s?'bg-green-50 border-green-400 text-green-700':'border-slate-200 text-slate-500'}`}>{s||'All'}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? Array(5).fill(0).map((_,i)=><div key={i} className="p-3 border-b border-slate-50"><div className="skeleton h-4 w-3/4 mb-1"/><div className="skeleton h-3 w-1/2"/></div>)
          : convs.length===0 ? <div className="text-center py-12 text-slate-400"><div className="text-3xl mb-2">💬</div><div className="text-sm">No conversations</div></div>
          : convs.map((c:any)=>(
            <div key={c.id} onClick={()=>setConv(c)} className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${conv?.id===c.id?'bg-green-50 border-l-2 border-l-green-500':''}`}>
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{background:av(c.contact?.name||c.contact?.phone||'?')}}>
                  {(c.contact?.name||c.contact?.phone||'?').substring(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium text-slate-900 truncate">{c.contact?.name||c.contact?.phone}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{c.lastMessageAt?ago(c.lastMessageAt):''}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 truncate">{c.messages?.[0]?.content?.text||'…'}</span>
                    {c.unreadCount>0&&<span className="bg-green-500 text-white text-[9px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{c.unreadCount}</span>}
                  </div>
                  <span className={`badge text-[9px] mt-0.5 ${SC[c.status]||'badge-slate'}`}>{c.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Chat */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {!conv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <div className="text-5xl mb-3">💬</div><div className="font-medium text-slate-600">Select a conversation</div>
          </div>
        ) : (<>
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{background:av(conv.contact?.name||'?')}}>
              {(conv.contact?.name||conv.contact?.phone||'?').substring(0,2).toUpperCase()}
            </div>
            <div><div className="font-semibold text-slate-900 text-sm">{conv.contact?.name||conv.contact?.phone}</div><div className="text-xs text-slate-400 font-mono">{conv.contact?.phone}</div></div>
            <div className="ml-auto">
              <select defaultValue={conv.status} onChange={e=>messageApi.setStatus(conv.id,e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">
                <option>OPEN</option><option>PENDING</option><option>RESOLVED</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.map((m:any)=>(
              <div key={m.id} className={`flex ${m.direction==='OUTBOUND'?'justify-end':'justify-start'}`}>
                <div className={m.direction==='OUTBOUND'?'chat-bubble-out':'chat-bubble-in'}>
                  <div>{m.content?.text||`[${m.type}]`}</div>
                  <div className={`text-[9px] mt-0.5 ${m.direction==='OUTBOUND'?'text-green-100':'text-slate-400'}`}>
                    {new Date(m.timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
                    {m.direction==='OUTBOUND'&&<span className="ml-1">{m.status==='READ'?'✓✓':m.status==='DELIVERED'?'✓✓':'✓'}</span>}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
          <div className="bg-white border-t border-slate-200 p-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 max-h-28" rows={1}
                placeholder="Type a message… (Enter to send)" value={msg} onChange={e=>setMsg(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(msg.trim())sendMut.mutate(msg.trim())}}}/>
              <button onClick={()=>{if(msg.trim())sendMut.mutate(msg.trim())}} disabled={!msg.trim()||sendMut.isPending}
                className="btn-brand px-4 py-2 rounded-xl disabled:opacity-40">
                {sendMut.isPending?'…':'↑'}
              </button>
            </div>
          </div>
        </>)}
      </div>
    </div>
  )
}
