"use client"
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadApi } from '@/lib/api'
import { toast } from 'sonner'

const STAGES   = ['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST']
const CATS     = ['JOB_ENQUIRY','SERVICE_REQUEST','BILLING','SUPPORT','PRODUCT_ENQUIRY','GENERAL']
const S_CLR: any = { NEW:'badge-blue', CONTACTED:'badge-yellow', QUALIFIED:'badge-green', PROPOSAL:'badge-purple', NEGOTIATION:'badge-purple', WON:'badge-green', LOST:'badge-slate' }
const C_CLR: any = { JOB_ENQUIRY:'badge-blue', SERVICE_REQUEST:'badge-green', BILLING:'badge-yellow', SUPPORT:'badge-red', PRODUCT_ENQUIRY:'badge-purple', GENERAL:'badge-slate' }

export default function LeadsPage() {
  const qc  = useQueryClient()
  const [stage, setStage]   = useState('')
  const [cat, setCat]       = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['leads', stage, cat, search, page],
    queryFn:  () => leadApi.list({ stage, category: cat, search, page, pageSize: 20 }).then(r => r.data.data),
  })
  const { data: stats } = useQuery({ queryKey:['lead-stats'], queryFn:()=>leadApi.stats().then(r=>r.data.data) })

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: any) => leadApi.update(id, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey:['leads'] }); toast.success('Lead updated') },
  })

  const leads = data?.leads || []

  return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{data?.total || 0} total · {stats?.today || 0} today</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        {[['New','NEW',stats?.byStage],['Contacted','CONTACTED',stats?.byStage],['Won','WON',stats?.byStage],['Lost','LOST',stats?.byStage]].map(([l,s,bs]:any) => (
          <div key={s} className="stat-card">
            <div className="stat-label">{l}</div>
            <div className="stat-value">{(bs||[]).find((b:any)=>b.stage===s)?._count||0}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input className="form-input max-w-xs" placeholder="Search name or phone…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
        <select className="form-select w-auto" value={stage} onChange={e=>{setStage(e.target.value);setPage(1)}}>
          <option value="">All stages</option>{STAGES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select className="form-select w-auto" value={cat} onChange={e=>{setCat(e.target.value);setPage(1)}}>
          <option value="">All categories</option>{CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Phone</th><th>Category</th><th>Stage</th><th>Priority</th><th>SMS</th><th>Message</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>
            {isLoading ? Array(5).fill(0).map((_,i)=><tr key={i}>{Array(9).fill(0).map((_,j)=><td key={j}><div className="skeleton h-4 w-full"/></td>)}</tr>)
            : leads.length===0 ? <tr><td colSpan={9} className="text-center py-12 text-slate-400"><div className="text-3xl mb-2">🎯</div><div className="text-sm font-medium">No leads yet</div><div className="text-xs mt-1">Leads are created automatically from WhatsApp messages</div></td></tr>
            : leads.map((l:any)=>(
              <tr key={l.id}>
                <td className="font-medium text-slate-900">{l.name||'—'}</td>
                <td className="font-mono text-xs">{l.phone}</td>
                <td><span className={`badge ${C_CLR[l.category]||'badge-slate'}`}>{l.category?.replace('_',' ')}</span></td>
                <td>
                  <select value={l.stage} onChange={e=>updateMut.mutate({id:l.id,stage:e.target.value})}
                    className={`badge border-0 cursor-pointer text-xs ${S_CLR[l.stage]||'badge-slate'}`}>
                    {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td><span className={`badge ${l.priority==='high'?'badge-red':l.priority==='medium'?'badge-yellow':'badge-slate'}`}>{l.priority}</span></td>
                <td>{l.smsSent?'✓':'—'}</td>
                <td className="max-w-[160px]"><div className="text-xs text-slate-500 truncate">{l.message||'—'}</div></td>
                <td className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td>
                <td>
                  <select onChange={e=>updateMut.mutate({id:l.id,agentId:e.target.value})} className="text-xs border border-slate-200 rounded px-1.5 py-0.5">
                    <option value="">Assign…</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Page {page} of {data.totalPages}</span>
            <div className="flex gap-2">
              <button onClick={()=>setPage(p=>p-1)} disabled={page===1} className="btn-outline text-xs disabled:opacity-40">← Prev</button>
              <button onClick={()=>setPage(p=>p+1)} disabled={page===data.totalPages} className="btn-outline text-xs disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
