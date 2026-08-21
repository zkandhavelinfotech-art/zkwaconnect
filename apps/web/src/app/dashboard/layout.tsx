"use client"
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { Logo }         from '@/components/Logo'
import { useSSE } from '@/hooks/useSSE'
import { toast } from 'sonner'

const NAV = [
  { href:'/dashboard',           icon:'📊', label:'Dashboard' },
  { href:'/dashboard/inbox',     icon:'💬', label:'Inbox' },
  { href:'/dashboard/leads',     icon:'🎯', label:'Leads' },
  { href:'/dashboard/contacts',  icon:'👥', label:'Contacts' },
  { href:'/dashboard/templates', icon:'📋', label:'Templates' },
  { href:'/dashboard/campaigns', icon:'📣', label:'Campaigns' },
  { href:'/dashboard/analytics', icon:'📈', label:'Analytics' },
  { href:'/dashboard/flows',     icon:'⚡', label:'Flows' },
  { href:'/dashboard/billing',   icon:'🧾', label:'Billing' },
  { href:'/dashboard/catalog',   icon:'🛍️', label:'Catalog' },
  { href:'/dashboard/webhook',   icon:'📡', label:'Webhook' },
  { href:'/dashboard/partners',  icon:'🤝', label:'Partners' },
  { href:'/dashboard/audit',     icon:'📋', label:'Audit Log' },
  { href:'/dashboard/settings',  icon:'⚙️', label:'Settings' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router    = useRouter()
  const pathname  = usePathname()
  const { user, tenant, accessToken, logout } = useAuthStore()

  useEffect(() => {
    if (!accessToken) router.push('/auth/login')
  }, [accessToken])

  useSSE((type, data) => {
    if (type === 'NEW_LEAD')    toast.success(`New lead: ${data?.lead?.name || data?.contact?.phone}`)
    if (type === 'NEW_MESSAGE') toast.info('New message received')
  })

  if (!accessToken) return null

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col gap-0.5">
            <Logo size={34} showText />
            <div className="text-[10px] text-slate-400 pl-0.5 truncate max-w-[140px] mt-0.5">{tenant?.name}</div>
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map(({ href, icon, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${active ? 'bg-green-50 text-green-700 font-medium border-r-2 border-green-500' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <span className="text-base">{icon}</span>{label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-900 truncate">{user?.name}</div>
              <div className="text-[10px] text-slate-400">{user?.role}</div>
            </div>
          </div>
          <button onClick={() => { logout(); router.push('/auth/login') }}
            className="w-full text-xs text-slate-500 hover:text-red-500 text-left transition-colors">
            Sign out →
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
