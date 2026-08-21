"use client"
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export default function WebhookPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['webhook-events'],
    queryFn: () => api.get('/webhook-events?pageSize=50').then(r => r.data.data).catch(() => ({ events:[] })),
    refetchInterval: 10000,
  })
  const events = data?.events || []
  const TC: any = { messages:'badge-green', statuses:'badge-blue', message_deliveries:'badge-yellow' }

  return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-bold text-slate-900">Webhook Monitor</h1><p className="text-sm text-slate-500">Live Meta webhook events · auto-refreshes every 10s</p></div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><div className="live-dot"/><span>Live</span></div>
          <button onClick={()=>refetch()} className="btn-outline text-sm">↻ Refresh</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="stat-card"><div className="stat-label">Webhook URL</div><div className="text-xs font-mono text-slate-700 mt-1 break-all select-all">{typeof window!=='undefined'?window.location.origin.replace('3000','4000'):''}/webhook/meta</div></div>
        <div className="stat-card"><div className="stat-label">Events received</div><div className="stat-value">{events.length}</div></div>
        <div className="stat-card"><div className="stat-label">Status</div><div className="flex items-center gap-2 mt-1"><div className="live-dot"/><span className="text-sm font-medium text-green-600">Listening</span></div></div>
      </div>
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Time</th><th>Type</th><th>Phone ID</th><th>Processed</th><th>Message ID</th></tr></thead>
          <tbody>
            {isLoading ? Array(5).fill(0).map((_,i)=><tr key={i}>{Array(5).fill(0).map((_,j)=><td key={j}><div className="skeleton h-4 w-full"/></td>)}</tr>)
            : events.length===0 ? <tr><td colSpan={5} className="text-center py-12 text-slate-400"><div className="text-3xl mb-2">📡</div><div className="text-sm font-medium">No events yet</div><div className="text-xs mt-1">Events appear when Meta sends messages to your webhook</div></td></tr>
            : events.map((e:any)=>(
              <tr key={e.id}>
                <td className="font-mono text-xs text-slate-400">{new Date(e.receivedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td>
                <td><span className={`badge ${TC[e.eventType]||'badge-slate'}`}>{e.eventType}</span></td>
                <td className="font-mono text-xs text-slate-500">{e.phoneNumberId||'—'}</td>
                <td><span className={e.processed?'text-green-600 text-xs font-medium':'text-yellow-600 text-xs'}>{e.processed?'✓ Yes':'⟳ Pending'}</span></td>
                <td className="font-mono text-xs text-slate-400">{e.waMessageId||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-4 card-body">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">Setup</h3>
        <ol className="text-sm text-slate-600 space-y-1.5 list-decimal list-inside">
          <li>Meta Developer Console → Your App → WhatsApp → Configuration</li>
          <li>Webhook URL: the URL shown above</li>
          <li>Verify Token: value of <code className="text-xs bg-slate-100 px-1 rounded">META_VERIFY_TOKEN</code> in your .env</li>
          <li>Subscribe to: <span className="badge badge-green">messages</span> <span className="badge badge-blue">message_deliveries</span> <span className="badge badge-yellow">message_reads</span></li>
        </ol>
      </div>
    </div>
  )
}
