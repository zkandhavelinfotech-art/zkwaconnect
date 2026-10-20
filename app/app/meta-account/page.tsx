"use client"
import { MetaAccountDetails } from "@/components/meta/MetaAccountDetails"
import { InstagramConnect } from "@/components/meta/InstagramConnect"

export default function MetaAccountPage() {
  return (
    <div>
      <div style={{marginBottom:18}}>
        <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>Meta account</h1>
        <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>The Facebook connection, Business Manager, WhatsApp Business Account and phone numbers this workspace uses.</p>
      </div>
      <MetaAccountDetails />
      <InstagramConnect />
    </div>
  )
}
