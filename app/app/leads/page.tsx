"use client"
import { LogoIcon } from "@/components/Logo"
export default function Page() {
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <LogoIcon size={32}/>
        <div>
          <h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>
            🎯 Leads
          </h1>
          <p style={{fontSize:13,color:"#64748b",margin:0}}>Track and manage sales leads captured from WhatsApp conversations.</p>
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:48,textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:16}}>🎯</div>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:20,fontWeight:700,color:"#0f172a",marginBottom:8}}>Leads</h2>
        <p style={{fontSize:14,color:"#64748b",maxWidth:400,margin:"0 auto 24px"}}>Track and manage sales leads captured from WhatsApp conversations.</p>
        <div style={{display:"inline-flex",padding:"8px 16px",background:"#f0fdf4",
          border:"1px solid #bbf7d0",borderRadius:8,fontSize:12,color:"#15803d"}}>
          Connect your WhatsApp WABA first to unlock this feature
        </div>
      </div>
    </div>
  )
}
