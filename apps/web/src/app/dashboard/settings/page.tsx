'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { wabaApi } from '@/lib/api'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { toast }            from 'sonner'
import { LogoLockup }    from '@/components/Logo'

const TABS = [['waba','📱 WABA'],['team','👥 Team'],['smtp','📧 SMTP'],['apikeys','🗝️ API Keys'],['webhook','📡 Webhook'],['company','🏢 Company']]

export default function SettingsPage() {
  const qc = useQueryClient()
  const { tenant } = useAuthStore()
  const [tab, setTab] = useState('waba')
  return (
    <div className="page-inner">
      <h1 className="text-xl font-bold text-slate-900 mb-5">Settings</h1>
      <div className="flex gap-0 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-all ${tab===id?'border-green-500 text-green-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
        ))}
      </div>
      {tab==='waba'    && <WabaTab qc={qc} />}
      {tab==='team'    && <TeamTab qc={qc} />}
      {tab==='smtp'    && <SmtpTab qc={qc} />}
      {tab==='apikeys' && <ApiKeysTab qc={qc} />}
      {tab==='webhook' && <WebhookTab />}
      {tab==='company' && <CompanyTab tenant={tenant} />}
    </div>
  )
}

function WabaTab({qc}:any) {
  const [showAdd,setShowAdd]=useState(false)
  const [form,setForm]=useState({phoneId:'',wabaId:'',accessToken:'',appSecret:'',nickname:'',apiVersion:'v20.0'})
  const {data:wabas}=useQuery({queryKey:['waba'],queryFn:()=>wabaApi.list().then(r=>r.data.data)})
  const connectMut=useMutation({mutationFn:(d:any)=>wabaApi.connect(d),onSuccess:()=>{qc.invalidateQueries({queryKey:['waba']});setShowAdd(false);toast.success('Connected')},onError:(e:any)=>toast.error(e?.response?.data?.error||'Failed')})
  const activateMut=useMutation({mutationFn:(id:string)=>wabaApi.activate(id),onSuccess:()=>{qc.invalidateQueries({queryKey:['waba']});toast.success('Set active')}})
  const removeMut=useMutation({mutationFn:(id:string)=>wabaApi.remove(id),onSuccess:()=>{qc.invalidateQueries({queryKey:['waba']});toast.success('Removed')}})
  const wabaList=Array.isArray(wabas)?wabas:[]
  return (<div>
    <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-slate-900">WABA Accounts</h2><button onClick={()=>setShowAdd(true)} className="btn-brand">+ Connect WABA</button></div>
    <div className="space-y-3">
      {wabaList.length===0?(<div className="card card-body text-center py-10 text-slate-400"><div className="text-3xl mb-2">📱</div><div className="text-sm">No WABA accounts connected</div></div>):wabaList.map((w:any)=>(
        <div key={w.id} className={`card p-4 flex items-center gap-4 ${w.isActive?'border-green-300 bg-green-50':''}`}>
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">WA</div>
          <div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium text-slate-900">{w.displayName||w.phoneNumber}</span>{w.isActive&&<span className="badge badge-green">Active</span>}</div><div className="text-xs text-slate-500 font-mono">{w.phoneNumber} · {w.apiVersion}</div></div>
          <div className="flex gap-2">{!w.isActive&&<button onClick={()=>activateMut.mutate(w.id)} className="btn-outline text-xs">Set Active</button>}<button onClick={()=>{if(confirm('Remove?'))removeMut.mutate(w.id)}} className="text-xs text-red-500">Remove</button></div>
        </div>
      ))}
    </div>
    {showAdd&&(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowAdd(false)}>
      <div className="bg-white rounded-xl w-[480px] p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="font-semibold">Connect WABA</h3><button onClick={()=>setShowAdd(false)} className="text-xl text-slate-400">×</button></div>
        <div className="space-y-3">
          <div><label className="form-label">Phone Number ID *</label><input className="form-input font-mono" placeholder="1234567890123" value={form.phoneId} onChange={e=>setForm(f=>({...f,phoneId:e.target.value}))}/></div>
          <div><label className="form-label">WABA ID *</label><input className="form-input font-mono" placeholder="1234567890" value={form.wabaId} onChange={e=>setForm(f=>({...f,wabaId:e.target.value}))}/></div>
          <div><label className="form-label">Access Token *</label><input className="form-input font-mono text-xs" placeholder="EAAxxxxx…" value={form.accessToken} onChange={e=>setForm(f=>({...f,accessToken:e.target.value}))}/></div>
          <div><label className="form-label">App Secret</label><input className="form-input font-mono" value={form.appSecret} onChange={e=>setForm(f=>({...f,appSecret:e.target.value}))}/></div>
          <div className="flex gap-3 pt-2"><button onClick={()=>setShowAdd(false)} className="flex-1 btn-outline">Cancel</button><button onClick={()=>connectMut.mutate(form)} disabled={!form.phoneId||!form.wabaId||!form.accessToken} className="flex-1 btn-brand justify-center">{connectMut.isPending?'Connecting…':'Connect'}</button></div>
        </div>
      </div>
    </div>)}
  </div>)
}

function TeamTab({qc}:any) {
  const [showInvite,setShowInvite]=useState(false)
  const [form,setForm]=useState({email:'',name:'',role:'AGENT'})
  const {data}=useQuery({queryKey:['team-users'],queryFn:()=>api.get('/tenant/users').then(r=>r.data.data).catch(()=>[])})
  const inviteMut=useMutation({mutationFn:(d:any)=>api.post('/tenant/users',d),onSuccess:()=>{qc.invalidateQueries({queryKey:['team-users']});setShowInvite(false);setForm({email:'',name:'',role:'AGENT'});toast.success('User invited')},onError:(e:any)=>toast.error(e?.response?.data?.error||'Failed')})
  const deactivateMut=useMutation({mutationFn:(id:string)=>api.patch(`/tenant/users/${id}`,{isActive:false}),onSuccess:()=>{qc.invalidateQueries({queryKey:['team-users']});toast.success('Deactivated')}})
  const users=Array.isArray(data)?data:[]
  const RC:any={OWNER:'badge-purple',ADMIN:'badge-red',MANAGER:'badge-blue',AGENT:'badge-green',VIEWER:'badge-slate'}
  return (<div>
    <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-slate-900">Team Members</h2><button onClick={()=>setShowInvite(true)} className="btn-brand">+ Invite User</button></div>
    <div className="card overflow-hidden"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Action</th></tr></thead><tbody>
      {users.length===0?(<tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">No team members yet</td></tr>):users.map((u:any)=>(
        <tr key={u.id}><td className="font-medium">{u.name}</td><td className="text-sm text-slate-500">{u.email}</td><td><span className={`badge ${RC[u.role]||'badge-slate'}`}>{u.role}</span></td><td><span className={u.isActive?'text-green-600 text-xs font-medium':'text-red-400 text-xs'}>{u.isActive?'Active':'Inactive'}</span></td><td className="text-xs text-slate-400">{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString('en-IN'):'Never'}</td><td>{u.isActive&&u.role!=='OWNER'&&<button onClick={()=>{if(confirm('Deactivate?'))deactivateMut.mutate(u.id)}} className="text-xs text-red-500">Deactivate</button>}</td></tr>
      ))}
    </tbody></table></div>
    {showInvite&&(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowInvite(false)}>
      <div className="bg-white rounded-xl w-96 p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="font-semibold">Invite Team Member</h3><button onClick={()=>setShowInvite(false)} className="text-xl text-slate-400">×</button></div>
        <div className="space-y-3">
          <div><label className="form-label">Email *</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
          <div><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div><label className="form-label">Role</label><select className="form-select" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}><option value="AGENT">Agent</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option><option value="VIEWER">Viewer</option></select></div>
          <div className="flex gap-3 pt-2"><button onClick={()=>setShowInvite(false)} className="flex-1 btn-outline">Cancel</button><button onClick={()=>inviteMut.mutate(form)} disabled={!form.email||!form.name} className="flex-1 btn-brand justify-center">{inviteMut.isPending?'…':'Invite'}</button></div>
        </div>
      </div>
    </div>)}
  </div>)
}

function SmtpTab({qc}:any) {
  const {data:cfg}=useQuery({queryKey:['smtp'],queryFn:()=>api.get('/tenant/smtp').then(r=>r.data.data).catch(()=>null)})
  const [form,setForm]=useState({host:'',port:'587',username:'',password:'',fromEmail:'',fromName:'',useTls:true})
  const [testing,setTesting]=useState(false)
  const saveMut=useMutation({mutationFn:(d:any)=>api.post('/tenant/smtp',d),onSuccess:()=>{qc.invalidateQueries({queryKey:['smtp']});toast.success('Saved')},onError:(e:any)=>toast.error(e?.response?.data?.error||'Failed')})
  const test=async()=>{setTesting(true);try{await api.post('/tenant/smtp/test');toast.success('SMTP OK')}catch(e:any){toast.error(e?.response?.data?.error||'Failed')}finally{setTesting(false)}}
  return (<div className="max-w-lg">
    <h2 className="font-semibold text-slate-900 mb-4">SMTP Configuration</h2>
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3"><div className="col-span-2"><label className="form-label">Host *</label><input className="form-input" placeholder="smtp.gmail.com" defaultValue={cfg?.host||''} onChange={e=>setForm(f=>({...f,host:e.target.value}))}/></div><div><label className="form-label">Port</label><input className="form-input" type="number" defaultValue={cfg?.port||587} onChange={e=>setForm(f=>({...f,port:e.target.value}))}/></div></div>
      <div><label className="form-label">Username *</label><input className="form-input" defaultValue={cfg?.username||''} onChange={e=>setForm(f=>({...f,username:e.target.value}))}/></div>
      <div><label className="form-label">Password *</label><input className="form-input" type="password" placeholder="App password" onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></div>
      <div><label className="form-label">From Email *</label><input className="form-input" defaultValue={cfg?.fromEmail||''} onChange={e=>setForm(f=>({...f,fromEmail:e.target.value}))}/></div>
      <div><label className="form-label">From Name</label><input className="form-input" defaultValue={cfg?.fromName||''} onChange={e=>setForm(f=>({...f,fromName:e.target.value}))}/></div>
      <div className="flex gap-3 pt-2"><button onClick={()=>saveMut.mutate(form)} className="btn-brand">{saveMut.isPending?'Saving…':'Save'}</button>{cfg?.host&&<button onClick={test} disabled={testing} className="btn-outline">{testing?'Testing…':'Test'}</button>}</div>
    </div>
  </div>)
}

function ApiKeysTab({qc}:any) {
  const [showAdd,setShowAdd]=useState(false)
  const [newKey,setNewKey]=useState<string|null>(null)
  const [name,setName]=useState('')
  const {data}=useQuery({queryKey:['api-keys'],queryFn:()=>api.get('/api-keys').then(r=>r.data.data).catch(()=>[])})
  const createMut=useMutation({mutationFn:(d:any)=>api.post('/api-keys',d),onSuccess:(r:any)=>{qc.invalidateQueries({queryKey:['api-keys']});setShowAdd(false);setNewKey(r.data.data.key);setName('')},onError:(e:any)=>toast.error(e?.response?.data?.error||'Failed')})
  const deleteMut=useMutation({mutationFn:(id:string)=>api.delete(`/api-keys/${id}`),onSuccess:()=>{qc.invalidateQueries({queryKey:['api-keys']});toast.success('Deleted')}})
  const keys=Array.isArray(data)?data:[]
  return (<div>
    <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-slate-900">API Keys</h2><button onClick={()=>setShowAdd(true)} className="btn-brand">+ Generate Key</button></div>
    {newKey&&(<div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4"><div className="font-medium text-green-800 mb-2">Save this key — it won't be shown again</div><div className="font-mono text-sm bg-white border border-green-200 rounded px-3 py-2 break-all select-all">{newKey}</div><button onClick={()=>setNewKey(null)} className="text-xs text-green-600 mt-2">I've saved it ✓</button></div>)}
    <div className="card overflow-hidden"><table className="data-table"><thead><tr><th>Name</th><th>Prefix</th><th>Status</th><th>Last Used</th><th>Action</th></tr></thead><tbody>
      {keys.length===0?(<tr><td colSpan={5} className="text-center py-8 text-slate-400 text-sm">No API keys</td></tr>):keys.map((k:any)=>(
        <tr key={k.id}><td className="font-medium">{k.name}</td><td className="font-mono text-xs text-slate-500">{k.keyPrefix}…</td><td><span className={`badge ${k.isActive?'badge-green':'badge-slate'}`}>{k.isActive?'Active':'Inactive'}</span></td><td className="text-xs text-slate-400">{k.lastUsedAt?new Date(k.lastUsedAt).toLocaleDateString('en-IN'):'Never'}</td><td><button onClick={()=>{if(confirm('Delete?'))deleteMut.mutate(k.id)}} className="text-xs text-red-500">Delete</button></td></tr>
      ))}
    </tbody></table></div>
    {showAdd&&(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowAdd(false)}>
      <div className="bg-white rounded-xl w-96 p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="font-semibold">Generate API Key</h3><button onClick={()=>setShowAdd(false)} className="text-xl text-slate-400">×</button></div>
        <div className="space-y-3"><div><label className="form-label">Name *</label><input className="form-input" placeholder="My Integration" value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="flex gap-3 pt-2"><button onClick={()=>setShowAdd(false)} className="flex-1 btn-outline">Cancel</button><button onClick={()=>createMut.mutate({name})} disabled={!name} className="flex-1 btn-brand justify-center">{createMut.isPending?'…':'Generate'}</button></div></div>
      </div>
    </div>)}
  </div>)
}

function WebhookTab() {
  return (<div className="max-w-lg"><h2 className="font-semibold text-slate-900 mb-4">Webhook Configuration</h2>
    <div className="card card-body mb-4"><div className="text-xs text-slate-400 mb-1 font-medium uppercase">Webhook URL</div><div className="font-mono text-sm bg-slate-50 rounded px-3 py-2 break-all select-all">{typeof window!=='undefined'?window.location.origin.replace('3000','4000'):'https://app.zkwaconnect.in'}/webhook/meta</div></div>
    <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600"><li>Meta Developer Console → WhatsApp → Configuration</li><li>Set Webhook URL to the URL above</li><li>Set Verify Token = <code className="text-xs bg-slate-100 px-1 rounded">META_VERIFY_TOKEN</code> from your .env</li><li>Subscribe to: messages, message_deliveries, message_reads</li></ol>
  </div>)
}

function CompanyTab({tenant}:any) {
  return (<div className="max-w-md"><h2 className="font-semibold text-slate-900 mb-4">Company Details</h2>
    <div className="card card-body space-y-2">
      {[['Company',tenant?.name],['Plan',tenant?.plan],['Status',tenant?.planStatus],['GSTIN',tenant?.gstin||'Not set'],['State',tenant?.state||'Not set'],['Messages Sent',tenant?.messagesSent?.toLocaleString()],['Messages Limit',tenant?.messagesLimit?.toLocaleString()]].map(([l,v]:any)=>(
        <div key={l} className="flex items-center gap-4 py-1 border-b border-slate-50 last:border-none"><span className="text-sm text-slate-500 w-32">{l}</span><span className="text-sm font-medium">{v||'—'}</span></div>
      ))}
      <p className="text-xs text-slate-400 pt-2">To update details contact: support@zkwaconnect.in</p>
    </div>
  </div>)
}
