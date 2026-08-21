"use client"
const PARTNERS = [
  { name:'Shopify',       icon:'🛒', desc:'Sync orders and customers. Send order confirmations via WhatsApp.', status:'Coming soon', color:'bg-green-50 border-green-200' },
  { name:'WooCommerce',   icon:'🛍️', desc:'Connect your store. Automate abandoned cart recovery via WhatsApp.', status:'Coming soon', color:'bg-purple-50 border-purple-200' },
  { name:'Zoho CRM',      icon:'📊', desc:'Sync leads and contacts. Auto-create CRM records from conversations.', status:'Coming soon', color:'bg-blue-50 border-blue-200' },
  { name:'HubSpot',       icon:'🔶', desc:'Bidirectional sync. Log WhatsApp conversations as CRM activities.', status:'Coming soon', color:'bg-orange-50 border-orange-200' },
  { name:'Razorpay',      icon:'💳', desc:'Send payment links via WhatsApp. Auto-notify on payment events.', status:'Active', color:'bg-green-50 border-green-300' },
  { name:'Google Sheets', icon:'📋', desc:'Export leads and contacts. Schedule automated reports.', status:'Coming soon', color:'bg-emerald-50 border-emerald-200' },
  { name:'Zapier',        icon:'⚡', desc:'Connect ZKWAConnect to 5,000+ apps via webhooks.', status:'Coming soon', color:'bg-yellow-50 border-yellow-200' },
  { name:'Make',          icon:'🔄', desc:'Advanced automation workflows connecting WhatsApp with your tools.', status:'Coming soon', color:'bg-pink-50 border-pink-200' },
]

export default function PartnersPage() {
  return (
    <div className="page-inner">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Partner Integrations</h1>
        <p className="text-sm text-slate-500">Connect ZKWAConnect with your tools</p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {PARTNERS.map(p=>(
          <div key={p.name} className={`border-2 rounded-xl p-5 ${p.color}`}>
            <div className="flex items-start gap-4">
              <span className="text-3xl">{p.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{p.name}</span>
                  <span className={`badge ${p.status==='Active'?'badge-green':'badge-slate'}`}>{p.status}</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{p.desc}</p>
                <div className="mt-3">
                  {p.status==='Active'
                    ? <button className="btn-brand text-xs py-1.5">Configure</button>
                    : <button className="btn-outline text-xs py-1.5" disabled>Notify me when ready</button>
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card card-body text-center">
        <div className="text-2xl mb-2">🤝</div>
        <div className="font-medium text-slate-900 mb-1">Want a custom integration?</div>
        <p className="text-sm text-slate-500 mb-3">We build custom integrations for Enterprise customers</p>
        <a href="mailto:enterprise@zkwaconnect.in" className="btn-brand mx-auto">Contact Enterprise Sales</a>
      </div>
    </div>
  )
}
