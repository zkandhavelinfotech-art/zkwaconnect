"use client"
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, templateApi, wabaApi, contactApi } from '@/lib/api'
import api from '@/lib/api'
import { toast } from 'sonner'

const S_CLR: Record<string,string> = {
  DRAFT:'badge-slate', SCHEDULED:'badge-blue', RUNNING:'badge-blue',
  PAUSED:'badge-yellow', COMPLETED:'badge-green', CANCELLED:'badge-red', FAILED:'badge-red',
}

export default function CampaignsPage() {
  const qc      = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [showAdd,   setShowAdd]   = useState(false)
  const [audienceType, setAudType] = useState<'all'|'labels'|'contacts'|'csv'>('all')
  const [csvPhones, setCsvPhones] = useState<string[]>([])
  const [csvUploading, setCsvUploading] = useState(false)
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [form, setForm] = useState({
    name: '', templateId: '', wabaAccountId: '', scheduledAt: '',
  })
  const F = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn:  () => campaignApi.list().then(r => r.data.data),
    refetchInterval: 15000,
  })
  const { data: tplData }   = useQuery({ queryKey:['templates','APPROVED'], queryFn:()=>templateApi.list({status:'APPROVED'}).then(r=>r.data.data) })
  const { data: wabaData }  = useQuery({ queryKey:['waba'],      queryFn:()=>wabaApi.list().then(r=>r.data.data) })
  const { data: labelData } = useQuery({
    queryKey: ['contact-labels'],
    queryFn:  () => api.get('/contacts?pageSize=500').then(r => {
      const contacts = r.data.data?.contacts || []
      const all: string[] = []
      contacts.forEach((c: any) => (c.labels || []).forEach((l: string) => { if (!all.includes(l)) all.push(l) }))
      return all.sort()
    }),
  })

  const createMut = useMutation({
    mutationFn: (d: any) => campaignApi.create(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey:['campaigns'] }); setShowAdd(false); resetForm(); toast.success('Campaign created') },
    onError:    (e: any) => toast.error(e?.response?.data?.error || 'Failed'),
  })
  const launchMut = useMutation({ mutationFn: (id: string) => campaignApi.launch(id),  onSuccess: () => { qc.invalidateQueries({queryKey:['campaigns']}); toast.success('🚀 Campaign launched!') } })
  const pauseMut  = useMutation({ mutationFn: (id: string) => campaignApi.pause(id),   onSuccess: () => { qc.invalidateQueries({queryKey:['campaigns']}); toast.success('Paused') } })
  const cancelMut = useMutation({ mutationFn: (id: string) => campaignApi.cancel(id),  onSuccess: () => { qc.invalidateQueries({queryKey:['campaigns']}); toast.success('Cancelled') } })

  function resetForm() {
    setForm({ name:'', templateId:'', wabaAccountId:'', scheduledAt:'' })
    setAudType('all'); setCsvPhones([]); setSelectedLabels([])
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/campaigns/upload-csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const { phones, total, invalid } = res.data.data
      setCsvPhones(phones)
      toast.success(`${total} contacts loaded from CSV${invalid?.length ? `, ${invalid.length} invalid skipped` : ''}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'CSV upload failed')
    } finally { setCsvUploading(false) }
  }

  function toggleLabel(l: string) {
    setSelectedLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  function handleCreate() {
    const payload: any = {
      ...form,
      audienceType,
      audienceLabels:   audienceType === 'labels'   ? selectedLabels : [],
      audienceContacts: audienceType === 'csv'       ? csvPhones : [],
    }
    createMut.mutate(payload)
  }

  const campaigns  = data?.campaigns || []
  const templates  = Array.isArray(tplData) ? tplData : []
  const wabaList   = Array.isArray(wabaData) ? wabaData : []
  const allLabels  = Array.isArray(labelData) ? labelData : []
  const running    = campaigns.filter((c: any) => c.status === 'RUNNING').length
  const completed  = campaigns.filter((c: any) => c.status === 'COMPLETED').length

  return (
    <div className="page-inner">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500">{campaigns.length} total · {running} running · {completed} completed</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-brand">+ New Campaign</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { l:'Total', v: campaigns.length, c:'text-slate-700' },
          { l:'Running', v: running, c:'text-blue-600' },
          { l:'Completed', v: completed, c:'text-green-600' },
          { l:'Messages sent', v: campaigns.reduce((s: number, c: any) => s + (c.sentCount||0), 0).toLocaleString(), c:'text-purple-600' },
        ].map(s => (
          <div key={s.l} className="stat-card">
            <div className="stat-label">{s.l}</div>
            <div className={`stat-value ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Status</th><th>Template</th>
              <th>Total</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th>
              <th>Delivery%</th><th>Read%</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <tr key={i}>{Array(11).fill(0).map((_, j) => <td key={j}><div className="skeleton h-4 w-full" /></td>)}</tr>
              ))
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-slate-400">
                  <div className="text-3xl mb-2">📣</div>
                  <div className="text-sm font-medium">No campaigns yet</div>
                  <div className="text-xs mt-1">Create a campaign to send bulk WhatsApp messages to your contacts</div>
                </td>
              </tr>
            ) : campaigns.map((c: any) => {
              const delPct = c.sentCount > 0 ? Math.round((c.deliveredCount / c.sentCount) * 100) : 0
              const readPct = c.deliveredCount > 0 ? Math.round((c.readCount / c.deliveredCount) * 100) : 0
              return (
                <tr key={c.id}>
                  <td className="font-medium text-slate-900 max-w-[140px] truncate">{c.name}</td>
                  <td><span className={`badge ${S_CLR[c.status] || 'badge-slate'}`}>{c.status}</span></td>
                  <td className="font-mono text-xs text-slate-500 max-w-[120px] truncate">{c.template?.name || '—'}</td>
                  <td className="num">{c.totalCount || 0}</td>
                  <td className="num">{c.sentCount || 0}</td>
                  <td className="num">{c.deliveredCount || 0}</td>
                  <td className="num">{c.readCount || 0}</td>
                  <td className="num text-red-500">{c.failedCount || 0}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{width:`${delPct}%`}}/>
                      </div>
                      <span className="text-xs">{delPct}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{width:`${readPct}%`}}/>
                      </div>
                      <span className="text-xs">{readPct}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1.5 items-center">
                      {c.status === 'DRAFT'  && <button onClick={() => launchMut.mutate(c.id)} className="text-xs text-green-600 font-medium hover:underline">Launch</button>}
                      {c.status === 'RUNNING'&& <button onClick={() => pauseMut.mutate(c.id)}  className="text-xs text-yellow-600 font-medium hover:underline">Pause</button>}
                      {c.status === 'PAUSED' && <button onClick={() => launchMut.mutate(c.id)} className="text-xs text-green-600 font-medium hover:underline">Resume</button>}
                      {['DRAFT','PAUSED','SCHEDULED'].includes(c.status) && (
                        <button onClick={() => { if (confirm('Cancel campaign?')) cancelMut.mutate(c.id) }} className="text-xs text-red-400 hover:underline">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-[560px] max-h-[90vh] overflow-y-auto p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-900 text-base">New Campaign</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              {/* Basic info */}
              <div><label className="form-label">Campaign Name *</label>
                <input className="form-input" placeholder="Diwali Sale 2025" value={form.name} onChange={F('name')} /></div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Approved Template *</label>
                  <select className="form-select" value={form.templateId} onChange={F('templateId')}>
                    <option value="">Select template</option>
                    {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                  </select></div>
                <div><label className="form-label">WABA Account *</label>
                  <select className="form-select" value={form.wabaAccountId} onChange={F('wabaAccountId')}>
                    <option value="">Select WABA</option>
                    {wabaList.map((w: any) => <option key={w.id} value={w.id}>{w.displayName || w.phoneNumber}</option>)}
                  </select></div>
              </div>

              <div><label className="form-label">Schedule (optional — leave blank to send immediately)</label>
                <input className="form-input" type="datetime-local" value={form.scheduledAt} onChange={F('scheduledAt')} /></div>

              {/* Audience section */}
              <div>
                <label className="form-label">Audience</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(['all','labels','csv'] as const).map(t => (
                    <button key={t} onClick={() => { setAudType(t); setCsvPhones([]); setSelectedLabels([]) }}
                      className={`text-xs py-2 px-3 rounded-lg border font-medium transition-all text-center ${audienceType === t ? 'bg-green-50 border-green-400 text-green-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {t === 'all' ? '👥 All contacts' : t === 'labels' ? '🏷️ By label' : '📄 CSV upload'}
                    </button>
                  ))}
                </div>

                {/* All opted-in */}
                {audienceType === 'all' && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs text-green-700">
                    Will send to all opted-in contacts in your account.
                  </div>
                )}

                {/* Label filter */}
                {audienceType === 'labels' && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Select one or more labels to target:</p>
                    {allLabels.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No labels found. Add labels to your contacts first.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                        {allLabels.map((l: string) => (
                          <button key={l} onClick={() => toggleLabel(l)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${selectedLabels.includes(l) ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedLabels.length > 0 && (
                      <p className="text-xs text-green-600 mt-2 font-medium">Selected: {selectedLabels.join(', ')}</p>
                    )}
                  </div>
                )}

                {/* CSV upload */}
                {audienceType === 'csv' && (
                  <div>
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center hover:border-green-300 transition-colors cursor-pointer"
                      onClick={() => fileRef.current?.click()}>
                      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVUpload} />
                      {csvUploading ? (
                        <div className="text-sm text-slate-500">Uploading…</div>
                      ) : csvPhones.length > 0 ? (
                        <div>
                          <div className="text-2xl mb-1">✅</div>
                          <div className="text-sm font-medium text-green-700">{csvPhones.length} contacts loaded</div>
                          <div className="text-xs text-slate-400 mt-1">Click to replace</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-2xl mb-1">📄</div>
                          <div className="text-sm font-medium text-slate-700">Drop CSV or click to upload</div>
                          <div className="text-xs text-slate-400 mt-1">CSV must have a "phone" column with country code (+91…)</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Warning */}
              {templates.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-xs text-yellow-700">
                  ⚠️ No approved templates found. Create and submit a template to Meta first.
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAdd(false); resetForm() }} className="flex-1 btn-outline">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={
                    !form.name || !form.templateId || !form.wabaAccountId ||
                    (audienceType === 'labels' && selectedLabels.length === 0) ||
                    (audienceType === 'csv'    && csvPhones.length === 0) ||
                    createMut.isPending
                  }
                  className="flex-1 btn-brand justify-center">
                  {createMut.isPending ? 'Creating…' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
