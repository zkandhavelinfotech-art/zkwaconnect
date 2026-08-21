"use client"
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templateApi } from '@/lib/api'
import { toast } from 'sonner'

const S_CLR: any = { APPROVED:'badge-green', PENDING:'badge-yellow', REJECTED:'badge-red', PAUSED:'badge-slate' }
const CAT_ICON: any = { MARKETING:'📣', UTILITY:'🔧', AUTHENTICATION:'🔐' }

export default function TemplatesPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name:'', category:'UTILITY', language:'en', bodyText:'', footerText:'' })
  const F = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const { data, isLoading } = useQuery({ queryKey:['templates'], queryFn:()=>templateApi.list().then(r=>r.data.data) })
  const createMut = useMutation({
    mutationFn: (d: any) => templateApi.create({ ...d, components: [{ type:'BODY', text:d.bodyText }] }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['templates']}); setShowAdd(false); toast.success('Template created') },
    onError: (e: any) => toast.error(e?.response?.data?.error||'Failed'),
  })
  const submitMut = useMutation({
    mutationFn: (id: string) => templateApi.submit(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:['templates']}); toast.success('Submitted to Meta') },
    onError: (e: any) => toast.error(e?.response?.data?.error||'Submit failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => templateApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:['templates']}); toast.success('Deleted') },
  })

  const templates = Array.isArray(data) ? data : []

  return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Templates</h1>
          <p className="text-sm text-slate-500">{templates.length} total · {templates.filter((t:any)=>t.status==='APPROVED').length} approved</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="btn-brand">+ New Template</button>
      </div>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Category</th><th>Language</th><th>Status</th><th>Body Preview</th><th>Used</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? Array(4).fill(0).map((_,i)=><tr key={i}>{Array(7).fill(0).map((_,j)=><td key={j}><div className="skeleton h-4 w-full"/></td>)}</tr>)
            : templates.length===0 ? <tr><td colSpan={7} className="text-center py-12 text-slate-400"><div className="text-3xl mb-2">📋</div><div className="text-sm font-medium">No templates yet</div></td></tr>
            : templates.map((t:any)=>(
              <tr key={t.id}>
                <td className="font-mono text-xs font-medium">{t.name}</td>
                <td><span className="text-sm">{CAT_ICON[t.category]} {t.category}</span></td>
                <td className="text-xs">{t.language}</td>
                <td><span className={`badge ${S_CLR[t.status]||'badge-slate'}`}>{t.status}</span></td>
                <td><div className="text-xs text-slate-500 max-w-[200px] truncate">{t.bodyText||'—'}</div></td>
                <td className="num">{t.usageCount||0}</td>
                <td>
                  <div className="flex gap-2">
                    {t.status==='PENDING'&&<button onClick={()=>submitMut.mutate(t.id)} className="text-xs text-blue-600 font-medium hover:underline">Submit to Meta</button>}
                    {t.status!=='APPROVED'&&<button onClick={()=>{if(confirm('Delete?'))deleteMut.mutate(t.id)}} className="text-xs text-red-500 hover:underline">Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowAdd(false)}>
          <div className="bg-white rounded-xl w-[480px] p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="font-semibold">New Template</h3><button onClick={()=>setShowAdd(false)} className="text-xl text-slate-400">×</button></div>
            <div className="space-y-3">
              <div><label className="form-label">Name * (lowercase, underscores)</label><input className="form-input font-mono" placeholder="order_confirmation" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_')}))}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Category</label>
                  <select className="form-select" value={form.category} onChange={F('category')}>
                    <option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option><option value="AUTHENTICATION">Authentication</option>
                  </select></div>
                <div><label className="form-label">Language</label>
                  <select className="form-select" value={form.language} onChange={F('language')}>
                    <option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option>
                  </select></div>
              </div>
              <div><label className="form-label">Body Text * (use {`{{1}}`} for variables)</label><textarea className="form-input" rows={4} placeholder="Hi {{1}}, your order #{{2}} confirmed!" value={form.bodyText} onChange={F('bodyText')}/></div>
              <div><label className="form-label">Footer (optional)</label><input className="form-input" placeholder="Reply STOP to opt out" value={form.footerText} onChange={F('footerText')}/></div>
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs text-green-700">Created as PENDING. Use Submit to Meta to send for approval (1–5 min).</div>
              <div className="flex gap-3 pt-2">
                <button onClick={()=>setShowAdd(false)} className="flex-1 btn-outline">Cancel</button>
                <button onClick={()=>createMut.mutate(form)} disabled={!form.name||!form.bodyText||createMut.isPending} className="flex-1 btn-brand justify-center">{createMut.isPending?'Creating…':'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
