"use client"
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

const ACTION_ICONS: Record<string, string> = {
  CREATE: '✨', UPDATE: '✏️', DELETE: '🗑️', LOGIN: '🔑', LOGOUT: '🚪',
}
const ACTION_CLR: Record<string, string> = {
  CREATE: 'badge-green', UPDATE: 'badge-blue', DELETE: 'badge-red', LOGIN: 'badge-purple', LOGOUT: 'badge-slate',
}

export default function AuditPage() {
  const [page, setPage]       = useState(1)
  const [action, setAction]   = useState('')
  const [entity, setEntity]   = useState('')
  const [search, setSearch]   = useState('')
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc')

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, action, entity, search, from, to],
    queryFn: () => api.get('/audit-logs', { params: { page, pageSize: 25, action, entity, search, from, to } }).then(r => r.data.data).catch(() => ({ logs:[], total:0, totalPages:1, summary:{ actions:[], entities:[] } })),
    keepPreviousData: true,
  } as any)

  const logs     = data?.logs     || []
  const summary  = data?.summary  || { actions: [], entities: [] }
  const total    = data?.total    || 0
  const totPages = data?.totalPages || 1

  function reset() { setPage(1); setAction(''); setEntity(''); setSearch(''); setFrom(''); setTo('') }

  async function exportCSV() {
    const res = await api.get('/audit-logs/export', { params: { action, entity, from, to }, responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a   = document.createElement('a'); a.href = url; a.download = `audit-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const sortedLogs = [...logs].sort((a: any, b: any) => {
    const da = new Date(a.createdAt).getTime()
    const db = new Date(b.createdAt).getTime()
    return sortDir === 'desc' ? db - da : da - db
  })

  return (
    <div className="page-inner">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">{total.toLocaleString()} events · complete tenant activity trail</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-outline text-sm">Clear filters</button>
          <button onClick={exportCSV} className="btn-outline text-sm">↓ Export CSV</button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {summary.actions.slice(0, 6).map((a: any) => (
          <button key={a.action} onClick={() => { setAction(action === a.action ? '' : a.action); setPage(1) }}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${action === a.action ? 'bg-green-50 border-green-400 text-green-700 font-medium' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {ACTION_ICONS[a.action] || '•'} {a.action} <span className="ml-1 opacity-60">{a._count}</span>
          </button>
        ))}
        {summary.entities.slice(0, 6).map((e: any) => (
          <button key={e.entity} onClick={() => { setEntity(entity === e.entity ? '' : e.entity); setPage(1) }}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${entity === e.entity ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {e.entity} <span className="ml-1 opacity-60">{e._count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input className="form-input w-52" placeholder="🔍 Search action, entity, IP…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <input className="form-input w-36 text-xs" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} />
          <span>→</span>
          <input className="form-input w-36 text-xs" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} />
        </div>
        <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="btn-outline text-xs px-3">
          {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-40">Timestamp</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Entity ID</th>
              <th>User</th>
              <th>Role</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(8).fill(0).map((_, i) => (
                <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j}><div className="skeleton h-4 w-full" /></td>)}</tr>
              ))
            ) : sortedLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm font-medium">No audit events found</div>
                  <div className="text-xs mt-1">Events are recorded automatically when data is created, updated, or deleted</div>
                </td>
              </tr>
            ) : sortedLogs.map((log: any) => (
              <tr key={log.id} className="group">
                <td className="font-mono text-xs text-slate-400 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td>
                  <span className={`badge ${ACTION_CLR[log.action] || 'badge-slate'}`}>
                    {ACTION_ICONS[log.action] || '•'} {log.action}
                  </span>
                </td>
                <td>
                  <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {log.entity}
                  </span>
                </td>
                <td className="font-mono text-xs text-slate-400 max-w-[120px] truncate">
                  {log.entityId || '—'}
                </td>
                <td>
                  <div className="text-xs">
                    <div className="font-medium text-slate-900">{log.user?.name || 'System'}</div>
                    <div className="text-slate-400">{log.user?.email || ''}</div>
                  </div>
                </td>
                <td>
                  {log.user?.role && (
                    <span className="badge badge-slate text-[10px]">{log.user.role}</span>
                  )}
                </td>
                <td className="font-mono text-xs text-slate-400">{log.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Page {page} of {totPages} · {total.toLocaleString()} events
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn-outline text-xs disabled:opacity-40">«</button>
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-outline text-xs disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page === totPages} className="btn-outline text-xs disabled:opacity-40">Next →</button>
              <button onClick={() => setPage(totPages)} disabled={page === totPages} className="btn-outline text-xs disabled:opacity-40">»</button>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
        <span>Audit logs are retained for 2 years.</span>
        <span>All mutating API calls are captured automatically.</span>
        <span>Auth events (login/logout) are not captured here.</span>
      </div>
    </div>
  )
}
