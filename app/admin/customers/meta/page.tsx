"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { MetaAccountDetails } from "@/components/meta/MetaAccountDetails"

function AdminCustomerMeta() {
  const organizationId = useSearchParams().get("org") || ""
  return organizationId ? <MetaAccountDetails organizationId={organizationId} />
    : <p style={{fontSize:13,color:"#64748b"}}>Open this page from Admin → Tenants.</p>
}

export default function AdminCustomerMetaPage() {
  return (
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"DM Sans,sans-serif"}}>
      <div style={{background:"#1e293b",borderBottom:"1px solid rgba(255,255,255,.08)",padding:"16px 32px",display:"flex",alignItems:"center",gap:16,color:"#fff"}}>
        <a href="/admin/dashboard" style={{color:"rgba(255,255,255,.6)",fontSize:13,textDecoration:"none"}}>← Admin</a>
        <div style={{fontFamily:"Sora,sans-serif",fontSize:18,fontWeight:700}}>Customer Meta account</div>
      </div>
      <div style={{maxWidth:1100,margin:"24px auto",padding:"0 24px 48px"}}>
        <div style={{background:"#f8fafc",borderRadius:14,padding:20}}>
          <Suspense fallback={<p style={{fontSize:13,color:"#64748b"}}>Loading…</p>}><AdminCustomerMeta /></Suspense>
        </div>
      </div>
    </div>
  )
}
