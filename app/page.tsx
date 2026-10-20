"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    const has = document.cookie.split(";").some(c => c.trim().startsWith("zkwaconnect_session="))
    router.replace(has ? "/app/dashboard" : "/marketing")
  }, [router])
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", background:"#075E54" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:64, height:64, borderRadius:14,
          background:"linear-gradient(145deg,#128C7E,#075E54)",
          border:"2px solid rgba(255,255,255,.2)",
          display:"flex", alignItems:"center", justifyContent:"center",
          margin:"0 auto 12px" }}>
          <span style={{ fontFamily:"Arial", fontWeight:900, fontSize:26 }}>
            <span style={{ color:"#fff" }}>Z</span>
            <span style={{ color:"#25D366" }}>K</span>
          </span>
        </div>
        <div style={{ color:"rgba(255,255,255,.6)", fontSize:13 }}>Loading ZKWAConnect…</div>
      </div>
    </div>
  )
}
