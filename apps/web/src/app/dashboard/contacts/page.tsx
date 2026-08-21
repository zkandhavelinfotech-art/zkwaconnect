"use client"
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactApi } from '@/lib/api'
import { toast } from 'sonner'

export default function ContactsPage() {
  const qc = useQueryClient()
  const [page, setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]   = useState({ name:'', phone:'', email:'', labels:'' })
  const F = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', page, search],
    queryFn: () => contactApi.list({ page, pageSize: 20, search }).then(r => r.data.data),
  })
  const createMut = useMutation({
    mutationFn: (d: any) => contactApi.create(d),
    onSuccess: () => { qc.invalidateQueries({queryKey:['contacts']}); setShowAdd(false); setForm({name:'',phone:'',email:'',labels:''}); toast.success('Contact added') },
    onError: (e: any) => toast.error(e?.response?.data?.error||'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => contactApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:['contacts']}); toast.success('Deleted') },
  })

  const contacts = data?.contacts || []

  return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-bold text-slate-900">Contacts</h1><p className="text-sm text-slate-500">{data?.total||0} contacts</p></div>
        <div className="flex gap-2">
          <button className="btn-outline text-sm">📤 Import CSV</button>
          <button onClick={()=>setShowAdd(true)} className="btn-brand">+ Add Contact</button>
        </div>
      </div>
      <div className="mb-4">
        <input className="form-input max-w-xs" placeholder="🔍 Search name, phone, email…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
      </div>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Labels</th><th>Opted In</th><th>Source</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {isLoading ? Array(5).fill(0).map((_,i)=><tr key={i}>{Array(8).fill(0).map((_,j)=><td key={j}><div className="skeleton h-4 w-full"/></td>)}</tr>)
            : contacts.length===0 ? <tr><td colSpan={8} className="text-center py-12 text-slate-400"><div className="text-3xl mb-2">👥</div><div className="text-sm">No contacts yet</div></td></tr>
            : contacts.map((c:any)=>(
              <tr key={c.id}>
                <td className="font-medium text-slate-900">{c.name||'—'}</td>
                <td className="font-mono text-xs">{c.phone}</td>
                <td className="text-xs text-slate-500">{c.email||'—'}</td>
                <td><div className="flex flex-wrap gap-1">{(c.labels||[]).map((l:string)=><span key={l} className="badge badge-blue text-[10px]">{l}</span>)}</div></td>
                <td><span className={c.optedIn?'text-green-600 text-xs font-medium':'text-red-400 text-xs'}>{c.optedIn?'✓ Yes':'✗ No'}</span></td>
                <td className="text-xs text-slate-500 capitalize">{c.source||'—'}</td>
                <td className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
                <td><button onClick={()=>{if(confirm('Delete?'))deleteMut.mutate(c.id)}} className="text-xs text-red-500 hover:underline">Delete</button></td>
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
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowAdd(false)}>
          <div className="bg-white rounded-xl w-96 p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="font-semibold">Add Contact</h3><button onClick={()=>setShowAdd(false)} className="text-slate-400 text-xl">×</button></div>
            <div className="space-y-3">
              <div><label className="form-label">Phone * (with country code)</label><input className="form-input" placeholder="+919876543210" value={form.phone} onChange={F('phone')}/></div>
              <div><label className="form-label">Name</label><input className="form-input" placeholder="Priya Sharma" value={form.name} onChange={F('name')}/></div>
              <div><label className="form-label">Email</label><input className="form-input" type="email" placeholder="priya@example.com" value={form.email} onChange={F('email')}/></div>
              <div><label className="form-label">Labels (comma separated)</label><input className="form-input" placeholder="customer, vip" value={form.labels} onChange={F('labels')}/></div>
              <div className="flex gap-3 pt-2">
                <button onClick={()=>setShowAdd(false)} className="flex-1 btn-outline">Cancel</button>
                <button onClick={()=>createMut.mutate({...form,labels:form.labels.split(',').map((l:string)=>l.trim()).filter(Boolean)})}
                  disabled={!form.phone||createMut.isPending} className="flex-1 btn-brand justify-center">
                  {createMut.isPending?'Adding…':'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
