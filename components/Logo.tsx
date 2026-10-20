interface LogoProps { size?: number; showText?: boolean; className?: string }

export function Logo({ size = 32, showText = false, className = "" }: LogoProps) {
  const ts = Math.round(size * 0.44)
  return (
    <span className={className} style={{ display:"inline-flex", alignItems:"center", gap:10, lineHeight:1 }}>
      <span style={{ width:size, height:size, borderRadius:Math.round(size*.22),
        background:"linear-gradient(145deg,#128C7E 0%,#075E54 100%)",
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        flexShrink:0, boxShadow:"0 2px 8px rgba(7,94,84,.35)",
        overflow:"hidden", position:"relative" }}>
        <span style={{ fontFamily:"Arial,sans-serif", fontSize:Math.round(size*.42),
          fontWeight:800, display:"flex" }}>
          <span style={{ color:"#fff" }}>Z</span>
          <span style={{ color:"#25D366" }}>K</span>
        </span>
        <span style={{ position:"absolute", bottom:Math.round(size*.06), right:Math.round(size*.07),
          fontSize:Math.round(size*.22), lineHeight:1, color:"#25D366" }}>✓</span>
      </span>
      {showText && (
        <span style={{ display:"flex", flexDirection:"column", gap:0 }}>
          <span style={{ fontFamily:"Sora,sans-serif", fontSize:ts, fontWeight:700,
            color:"#fff", lineHeight:1.15 }}>ZKWAConnect</span>
          <span style={{ fontFamily:"DM Sans,sans-serif", fontSize:Math.round(ts*.58),
            fontWeight:400, color:"rgba(255,255,255,.6)", lineHeight:1.2 }}>Business API</span>
        </span>
      )}
    </span>
  )
}
export function LogoIcon({ size=32, className="" }: { size?:number; className?:string }) {
  return <Logo size={size} className={className} />
}
export function LogoLockup({ size=36, className="" }: { size?:number; className?:string }) {
  return <Logo size={size} showText className={className} />
}
