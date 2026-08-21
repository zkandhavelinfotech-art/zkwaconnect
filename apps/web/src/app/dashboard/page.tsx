"use client"
import { useQuery } from '@tanstack/react-query'
import { leadApi, analyticsApi, billingApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import Link            from 'next/link'
import { LogoIcon }  from '@/components/Logo'

export default function DashboardPage() {
  const { tenant, user } = useAuthStore()
  const { data: ls }  = useQuery({ queryKey:['lead-stats'],  queryFn:()=>leadApi.stats().then(r=>r.data.data) })
  const { data: an }  = useQuery({ queryKey:['analytics-7d'],queryFn:()=>analyticsApi.overview('7d').then(r=>r.data.data) })
  const { data: bil } = useQuery({ queryKey:['billing-ov'],  queryFn:()=>billingApi.overview().then(r=>r.data.data) })

  const msgPct = tenant ? Math.round((tenant.messagesSent/tenant.messagesLimit)*100) : 0

  const stats = [
    { label:'Messages Sent',   value:(an?.messagesSent||0).toLocaleString(),         icon:'📤', color:'text-green-600',  href:'/dashboard/analytics' },
    { label:'New Leads',       value:(ls?.today||0).toLocaleString(),                 icon:'🎯', color:'text-purple-600', href:'/dashboard/leads' },
    { label:'Active Convs',    value:(an?.activeConversations||0).toLocaleString(),   icon:'💬', color:'text-blue-600',   href:'/dashboard/inbox' },
    { label:'Wallet Balance',  value:`₹${(bil?.walletBalance||0).toLocaleString()}`,  icon:'💰', color:'text-yellow-600', href:'/dashboard/billing' },
  ]

  const quickActions = [
    { label:'Send Message',     icon:'📤', href:'/dashboard/inbox',     desc:'Reply to customers' },
    { label:'New Campaign',     icon:'📣', href:'/dashboard/campaigns', desc:'Broadcast to contacts' },
    { label:'Add Contact',      icon:'👥', href:'/dashboard/contacts',  desc:'Import or add contacts' },
    { label:'Create Template',  icon:'📋', href:'/dashboard/templates', desc:'WhatsApp message templates' },
    { label:'View Leads',       icon:'🎯', href:'/dashboard/leads',     desc:'Manage your pipeline' },
    { label:'Download Invoice', icon:'🧾', href:'/dashboard/billing',   desc:'GST invoices' },
  ]

  return (
    <div className="page-inner">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <LogoIcon size={36} />
          <h1 className="text-xl font-bold text-slate-900">Good morning, {user?.name?.split(' ')[0]} 👋</h1>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">{tenant?.name} · {tenant?.plan} plan · {tenant?.planStatus}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <Link key={s.label} href={s.href} className="stat-card hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">{s.label}</span>
              <span className="text-xl">{s.icon}</span>
            </div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {quickActions.map(a => (
          <Link key={a.label} href={a.href} className="card card-body hover:shadow-md transition-shadow flex items-center gap-3">
            <span className="text-2xl">{a.icon}</span>
            <div><div className="font-medium text-slate-900 text-sm">{a.label}</div><div className="text-xs text-slate-400 mt-0.5">{a.desc}</div></div>
          </Link>
        ))}
      </div>

      <div className="card card-body">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-900">Message usage this month</span>
          <span className="text-sm text-slate-500">{(tenant?.messagesSent||0).toLocaleString()} / {(tenant?.messagesLimit||0).toLocaleString()}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${msgPct>90?'bg-red-500':msgPct>70?'bg-yellow-500':'bg-green-500'}`} style={{width:`${Math.min(msgPct,100)}%`}}/>
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1"><span>{msgPct}% used</span><span>{Math.max(0,(tenant?.messagesLimit||0)-(tenant?.messagesSent||0)).toLocaleString()} remaining</span></div>
        {msgPct > 80 && <p className="text-xs text-yellow-600 mt-2">⚠️ Approaching limit — <Link href="/dashboard/billing" className="underline">upgrade plan</Link></p>}
      </div>
    </div>
  )
}
