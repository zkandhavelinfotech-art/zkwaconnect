"use client"
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { billingApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { toast }          from 'sonner'
import { LogoLockup, LogoIcon } from '@/components/Logo'

declare const Razorpay: any
const PLANS = [
  { id:'STARTER',    name:'Starter',    price:2499,  msgs:'1,000',  color:'border-slate-200' },
  { id:'GROWTH',     name:'Growth',     price:5999,  msgs:'10,000', color:'border-green-400', popular:true },
  { id:'ENTERPRISE', name:'Enterprise', price:null,  msgs:'Unlimited', color:'border-purple-400' },
]

export default function BillingPage() {
  const { tenant } = useAuthStore()
  const [downloading, setDownloading] = useState<string|null>(null)

  const { data, isLoading } = useQuery({ queryKey:['billing'], queryFn:()=>billingApi.overview().then(r=>r.data.data) })
  const { data: invData }   = useQuery({ queryKey:['invoices'], queryFn:()=>billingApi.invoices({ pageSize:10 }).then(r=>r.data.data) })

  const subscribeMut = useMutation({
    mutationFn: (plan: string) => billingApi.subscribe({ plan }),
    onSuccess: (res, plan) => {
      const { orderId, amount } = res.data.data
      const rzp = new Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: orderId, amount,
        name: 'ZKWAConnect', description: `${plan} Plan Subscription`,
        handler: async (r: any) => {
          await billingApi.verifyPayment({ ...r, plan })
          toast.success('Payment successful! Plan activated.')
          window.location.reload()
        },
        prefill: { name: tenant?.name },
        theme: { color: '#00C853' },
      })
      rzp.open()
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Payment failed'),
  })

  const downloadPdf = async (id: string) => {
    setDownloading(id)
    try {
      const res  = await billingApi.invoicePdf(id)
      const url  = URL.createObjectURL(new Blob([res.data], { type:'application/pdf' }))
      const a    = document.createElement('a')
      a.href     = url; a.download = `invoice-${id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Download failed') } finally { setDownloading(null) }
  }

  const inv = invData?.invoices || []

  return (
    <div className="page-inner">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1"><LogoIcon size={28}/><h1 className="text-xl font-bold text-slate-900">Billing &amp; Invoices</h1></div>
        <p className="text-sm text-slate-500">GST-compliant invoices · Razorpay payments</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><div className="stat-label">Current Plan</div><div className="stat-value text-green-600">{tenant?.plan}</div><div className="text-xs text-slate-400 mt-1">{tenant?.planStatus}</div></div>
        <div className="stat-card"><div className="stat-label">Messages Used</div><div className="stat-value">{(tenant?.messagesSent||0).toLocaleString()}<span className="text-sm font-normal text-slate-400"> / {(tenant?.messagesLimit||0).toLocaleString()}</span></div></div>
        <div className="stat-card"><div className="stat-label">Wallet Balance</div><div className="stat-value">₹{(data?.walletBalance||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {PLANS.map(p=>(
          <div key={p.id} className={`card p-5 border-2 ${p.color} relative`}>
            {p.popular&&<div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-green text-xs">Most Popular</div>}
            <div className="font-bold text-slate-900 text-lg mb-1">{p.name}</div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{p.price?`₹${p.price.toLocaleString()}`:''}<span className="text-sm font-normal text-slate-400">{p.price?'/mo':''}</span></div>
            <div className="text-sm text-slate-500 mb-4">{p.msgs} messages/mo</div>
            {p.price ? (
              <button onClick={()=>subscribeMut.mutate(p.id)} disabled={tenant?.plan===p.id||subscribeMut.isPending}
                className={`w-full btn-brand justify-center ${tenant?.plan===p.id?'opacity-50':''}`}>
                {tenant?.plan===p.id?'Current plan':'Upgrade'}
              </button>
            ) : (
              <a href="mailto:enterprise@zkwaconnect.in" className="w-full btn-outline justify-center text-center block">Contact us</a>
            )}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="card-header"><h3 className="font-semibold text-sm text-slate-900">GST Invoices</h3></div>
        {isLoading ? <div className="p-8"><div className="skeleton h-8 w-full mb-3"/><div className="skeleton h-8 w-full"/></div>
        : inv.length===0 ? <div className="card-body text-center py-8 text-slate-400 text-sm">No invoices yet</div>
        : (
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Type</th><th>Plan</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Status</th><th>Date</th><th>PDF</th></tr></thead>
            <tbody>
              {inv.map((i:any)=>(
                <tr key={i.id}>
                  <td className="font-mono text-xs font-medium">{i.invoiceNumber}</td>
                  <td className="text-xs">{i.type}</td>
                  <td className="text-xs">{i.plan||'—'}</td>
                  <td className="num">₹{(i.subtotal||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                  <td className="num text-xs text-slate-400">
                    {i.igst>0?`IGST ₹${i.igst.toFixed(2)}`:`CGST+SGST ₹${(i.cgst+i.sgst).toFixed(2)}`}
                  </td>
                  <td className="num font-medium">₹{(i.total||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                  <td><span className={`badge ${i.status==='PAID'?'badge-green':'badge-yellow'}`}>{i.status}</span></td>
                  <td className="text-xs text-slate-400">{i.paidAt?new Date(i.paidAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'-'}</td>
                  <td>
                    <button onClick={()=>downloadPdf(i.id)} disabled={downloading===i.id}
                      className="text-xs text-green-600 hover:underline font-medium">
                      {downloading===i.id?'…':'↓ PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
