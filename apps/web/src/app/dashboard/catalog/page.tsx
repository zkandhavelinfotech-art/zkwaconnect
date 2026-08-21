"use client"
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productApi } from '@/lib/api'
import { toast } from 'sonner'

const EMPTY_FORM = { name:'', description:'', price:'', currency:'INR', imageUrl:'', sku:'', stock:'' }

export default function CatalogPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId]   = useState<string|null>(null)
  const [form, setForm]       = useState({ ...EMPTY_FORM })
  const F = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const { data, isLoading } = useQuery({ queryKey:['products'], queryFn:()=>productApi.list().then(r=>r.data.data) })

  const saveMut = useMutation({
    mutationFn: (d: any) => editId ? productApi.update(editId, d) : productApi.create(d),
    onSuccess: () => { qc.invalidateQueries({queryKey:['products']}); setShowAdd(false); setEditId(null); setForm({...EMPTY_FORM}); toast.success(editId?'Updated':'Product added') },
    onError: (e: any) => toast.error(e?.response?.data?.error||'Failed'),
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: any) => productApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({queryKey:['products']}),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => productApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:['products']}); toast.success('Deleted') },
  })

  const products = Array.isArray(data) ? data : []

  function openEdit(p: any) {
    setEditId(p.id)
    setForm({ name:p.name, description:p.description||'', price:p.price, currency:p.currency, imageUrl:p.imageUrl||'', sku:p.sku||'', stock:p.stock||'' })
    setShowAdd(true)
  }

  return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Product Catalog</h1>
          <p className="text-sm text-slate-500">{products.length} products</p>
        </div>
        <button onClick={()=>{setEditId(null);setForm({...EMPTY_FORM});setShowAdd(true)}} className="btn-brand">+ Add Product</button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_,i)=><div key={i} className="card overflow-hidden"><div className="skeleton h-40 w-full"/><div className="p-4 space-y-2"><div className="skeleton h-4 w-3/4"/><div className="skeleton h-3 w-1/2"/></div></div>)}</div>
      ) : products.length===0 ? (
        <div className="card card-body text-center py-16">
          <div className="text-4xl mb-3">🛍️</div>
          <div className="font-medium text-slate-700 mb-1">No products yet</div>
          <div className="text-sm text-slate-400 mb-4">Add products to send via WhatsApp Commerce</div>
          <button onClick={()=>setShowAdd(true)} className="btn-brand mx-auto">Add First Product</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {products.map((p:any)=>(
            <div key={p.id} className={`card overflow-hidden ${!p.isActive?'opacity-60':''}`}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover"/>
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-5xl">🛍️</div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-semibold text-slate-900">{p.name}</div>
                  <span className={`badge ${p.isActive?'badge-green':'badge-slate'} flex-shrink-0`}>{p.isActive?'Active':'Inactive'}</span>
                </div>
                {p.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{p.description}</p>}
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900">₹{Number(p.price).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
                  {p.sku && <div className="text-xs text-slate-400">SKU: {p.sku}</div>}
                </div>
                {p.stock!==null && <div className="text-xs text-slate-400 mt-1">Stock: {p.stock}</div>}
                <div className="flex gap-2 mt-3">
                  <button onClick={()=>openEdit(p)} className="flex-1 btn-outline text-xs py-1.5">Edit</button>
                  <button onClick={()=>toggleMut.mutate({id:p.id,isActive:!p.isActive})} className="flex-1 btn-outline text-xs py-1.5">{p.isActive?'Deactivate':'Activate'}</button>
                  <button onClick={()=>{if(confirm('Delete?'))deleteMut.mutate(p.id)}} className="text-xs text-red-500 hover:underline px-1">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-[480px] p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-900">{editId?'Edit Product':'Add Product'}</h3>
              <button onClick={()=>setShowAdd(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="form-label">Product Name *</label><input className="form-input" placeholder="Air Conditioner Service" value={form.name} onChange={F('name')} /></div>
              <div><label className="form-label">Description</label><textarea className="form-input" rows={2} placeholder="Brief description…" value={form.description} onChange={F('description')} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Price (₹) *</label><input className="form-input" type="number" placeholder="999" value={form.price} onChange={F('price')} /></div>
                <div><label className="form-label">Currency</label><select className="form-select" value={form.currency} onChange={F('currency')}><option value="INR">INR ₹</option><option value="USD">USD $</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">SKU</label><input className="form-input" placeholder="AC-SVC-001" value={form.sku} onChange={F('sku')} /></div>
                <div><label className="form-label">Stock</label><input className="form-input" type="number" placeholder="100" value={form.stock} onChange={F('stock')} /></div>
              </div>
              <div><label className="form-label">Image URL</label><input className="form-input" placeholder="https://…" value={form.imageUrl} onChange={F('imageUrl')} /></div>
              {form.imageUrl && <img src={form.imageUrl} alt="preview" className="w-full h-32 object-cover rounded-lg" onError={e=>{(e.target as any).style.display='none'}} />}
              <div className="flex gap-3 pt-2">
                <button onClick={()=>setShowAdd(false)} className="flex-1 btn-outline">Cancel</button>
                <button onClick={()=>saveMut.mutate({...form,price:Number(form.price),stock:form.stock?Number(form.stock):null})}
                  disabled={!form.name||!form.price||saveMut.isPending} className="flex-1 btn-brand justify-center">
                  {saveMut.isPending?'Saving…':editId?'Save Changes':'Add Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
