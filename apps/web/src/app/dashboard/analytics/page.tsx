"use client"
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/lib/api'

export default function AnalyticsPage() {
  const [range, setRange] = useState('7d')
  const { data, isLoading } = useQuery({ queryKey:['analytics',range], queryFn:()=>analyticsApi.overview(range).then(r=>r.data.data) })
  const { data: campData }  = useQuery({ queryKey:['analytics-camps'],  queryFn:()=>analyticsApi.campaigns().then(r=>r.data.data) })

  const stats = data || {}
  const trend = stats.trend || []
  const camps = Array.isArray(campData) ? campData : []
  const maxV  = Math.max(...trend.map((t:any)=>(t.sent||0)+(t.received||0)),1)

  return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-bold text-slate-900">Analytics</h1><p className="text-sm text-slate-500">Message trends and performance</p></div>
        <div className="flex gap-1">
          {['7d','30d','90d'].map(r=><button key={r} onClick={()=>setRange(r)} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${range===r?'bg-green-50 border-green-400 text-green-700':'border-slate-200 text-slate-600'}`}>{r}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[{l:'Sent',v:(stats.messagesSent||0).toLocaleString(),i:'📤',c:'text-green-600'},{l:'Received',v:(stats.messagesReceived||0).toLocaleString(),i:'📥',c:'text-blue-600'},{l:'New Leads',v:(stats.newLeads||0).toLocaleString(),i:'🎯',c:'text-purple-600'},{l:'Active Convs',v:(stats.activeConversations||0).toLocaleString(),i:'💬',c:'text-orange-600'}].map(s=>(
          <div key={s.l} className="stat-card"><div className="flex items-center justify-between mb-1"><span className="stat-label">{s.l}</span><span className="text-xl">{s.i}</span></div><div className={`stat-value ${s.c}`}>{s.v}</div></div>
        ))}
      </div>
      <div className="card mb-5">
        <div className="card-header"><h3 className="font-semibold text-sm">Message Volume</h3><span className="text-xs text-slate-400">Last {range}</span></div>
        <div className="card-body">
          {isLoading ? <div className="skeleton h-32 w-full rounded"/> : trend.length===0 ? <div className="text-center py-8 text-slate-400 text-sm">No data yet</div> : (
            <div className="flex items-end gap-1.5 h-32">
              {trend.map((t:any,i:number)=>{
                const sH = Math.max(Math.round(((t.sent||0)/maxV)*100),2)
                const rH = Math.max(Math.round(((t.received||0)/maxV)*100),2)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full rounded-sm" style={{height:`${sH}px`,background:'#00C853'}} title={`Sent: ${t.sent}`}/>
                    <div className="w-full rounded-sm opacity-50" style={{height:`${rH}px`,background:'#3b82f6'}} title={`Received: ${t.received}`}/>
                    <span className="text-[8px] text-slate-400 mt-0.5">{(t.date||'').slice(5)}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded" style={{background:'#00C853'}}/><span className="text-xs text-slate-500">Sent</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded opacity-50" style={{background:'#3b82f6'}}/><span className="text-xs text-slate-500">Received</span></div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3 className="font-semibold text-sm">Campaign Performance</h3></div>
        {camps.length===0 ? <div className="card-body text-center py-8 text-slate-400 text-sm">No completed campaigns</div> : (
          <table className="data-table">
            <thead><tr><th>Campaign</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Delivery %</th><th>Read %</th></tr></thead>
            <tbody>{camps.map((c:any,i:number)=>{
              const dp=c.sentCount>0?Math.round((c.deliveredCount/c.sentCount)*100):0
              const rp=c.deliveredCount>0?Math.round((c.readCount/c.deliveredCount)*100):0
              return <tr key={i}><td className="font-medium">{c.name}</td><td className="num">{c.sentCount||0}</td><td className="num">{c.deliveredCount||0}</td><td className="num">{c.readCount||0}</td>
                <td><div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{width:`${dp}%`}}/></div><span className="text-xs">{dp}%</span></div></td>
                <td><div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{width:`${rp}%`}}/></div><span className="text-xs">{rp}%</span></div></td>
              </tr>
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
