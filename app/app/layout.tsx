"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Logo, LogoIcon } from "@/components/Logo"
import { ProfileMenu } from "@/components/ProfileMenu"
import { InstallButton } from "@/components/pwa/Pwa"
import { NotificationBell } from "@/components/NotificationBell"
import { atLeast, PAGE_MIN_ROLE } from "@/lib/auth/permissions"
import { featureForPage, type FeatureKey, type PlanSummary } from "@/lib/billing/features"
import { LockedFeature } from "@/components/billing/LockedFeature"

type NavItem = { href:string; icon:string; label:string }
type NavGroup = { id:string; icon:string; label:string; items:NavItem[] }

const NAV:NavGroup[] = [
  { id:"overview", icon:"🏠", label:"Overview", items:[
    { href:"/app/dashboard", icon:"📊", label:"Dashboard" },
    { href:"/app/analytics", icon:"📈", label:"Analytics" },
  ]},
  { id:"chat", icon:"💬", label:"Live Chat", items:[
    { href:"/app/inbox", icon:"💬", label:"Inbox" },
  ]},
  { id:"campaigns", icon:"📣", label:"Campaigns", items:[
    { href:"/app/campaigns",  icon:"📣", label:"Broadcasts" },
    { href:"/app/ads/create", icon:"✨", label:"Create New Ad" },
    { href:"/app/ads",        icon:"📢", label:"Ads Manager" },
    { href:"/app/templates",  icon:"📋", label:"Templates" },
  ]},
  { id:"flows", icon:"🔀", label:"Flows", items:[
    { href:"/app/automation", icon:"🔀", label:"Flow Builder" },
    { href:"/app/forms",      icon:"📝", label:"WhatsApp Forms" },
  ]},
  { id:"audience", icon:"👥", label:"Audience", items:[
    { href:"/app/contacts", icon:"👥", label:"Contacts" },
    { href:"/app/leads",    icon:"🎯", label:"Leads" },
  ]},
  { id:"payments", icon:"🛍️", label:"Commerce", items:[
    { href:"/app/commerce",     icon:"📦", label:"Orders & Catalog" },
    { href:"/app/payments",     icon:"₹", label:"Payments" },
    { href:"/app/integrations", icon:"🔌", label:"Integrations" },
  ]},
  { id:"account", icon:"⚙️", label:"Account", items:[
    { href:"/app/profile",      icon:"👤", label:"My Profile" },
    { href:"/app/team",         icon:"👥", label:"Team" },
    { href:"/app/meta-account", icon:"🔗", label:"Meta Account" },
    { href:"/app/settings",     icon:"⚙️", label:"Settings" },
    { href:"/app/billing",      icon:"💳", label:"Billing" },
    { href:"/app/green-tick",   icon:"✔️", label:"Green tick" },
    { href:"/app/developers",   icon:"🧩", label:"Developers" },
  ]},
]

const OPEN_KEY = "zk-sidebar-open"
const RAIL_KEY = "zk-sidebar-rail"
const matches = (pathname:string, href:string) => pathname === href || pathname.startsWith(`${href}/`)

// The most specific menu entry wins (/app/ads/create over /app/ads).
function findActive(pathname:string) {
  let best:{group:NavGroup;item:NavItem}|null = null
  for (const group of NAV) for (const item of group.items)
    if (matches(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { group, item }
  return best
}

type Me = {
  user:{name:string;email:string}
  workspace:{id:string;name:string;role:string;walletBalance:number;currency:string;count:number}
  plan:{name:string;status:string;interval:string;renewsOn:string|null;trialEndsAt:string|null}|null
  whatsapp:{connected:boolean;phoneNumber:string|null}
  access?:{active:boolean;onFree:boolean;internal?:boolean;status:string;endsAt:string|null;planName:string|null;features:FeatureKey[];messagesUsed:number;messagesLimit:number|null;
    nearLimit:boolean;atLimit:boolean;next:{name:string;adds:FeatureKey[]}|null;plans:PlanSummary[]}
}

// Hide pages the member's role can't use (the server enforces the same rules).
function allowed(role:string|undefined, href:string) {
  if (!role) return true
  const rule = Object.keys(PAGE_MIN_ROLE).filter(prefix => href === prefix || href.startsWith(`${prefix}/`)).sort((a, b) => b.length - a.length)[0]
  return !rule || atLeast(role, PAGE_MIN_ROLE[rule])
}

export default function AppLayout({ children }:{ children:React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [ready,  setReady]  = useState(false)
  const [me, setMe] = useState<Me|null>(null)
  const [open, setOpen] = useState<Record<string,boolean>>({})
  const [rail, setRail] = useState(false)
  const [flyout, setFlyout] = useState<{id:string;top:number}|null>(null)
  const [drawer, setDrawer] = useState(false)
  const flyoutRef = useRef<HTMLDivElement>(null)

  const active = findActive(pathname)
  const activeGroup = active?.group
  const activeItem = active?.item

  useEffect(()=>{
    try {
      setOpen(JSON.parse(localStorage.getItem(OPEN_KEY) || "{}"))
      setRail(localStorage.getItem(RAIL_KEY) === "1")
    } catch { /* storage unavailable */ }
    fetch("/api/me").then(response => response.ok ? response.json() : null).then(setMe).catch(() => null)
    setReady(true)
  },[])

  // Keep the current page's group open; close the drawer and flyout after navigating.
  useEffect(()=>{
    if (activeGroup) setOpen(current => current[activeGroup.id] === true ? current : { ...current, [activeGroup.id]: true })
    setDrawer(false); setFlyout(null)
  },[pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if (!flyout) return
    function close(event:MouseEvent){ if (!flyoutRef.current?.contains(event.target as Node)) setFlyout(null) }
    function escape(event:KeyboardEvent){ if (event.key === "Escape") setFlyout(null) }
    const timer = setTimeout(() => document.addEventListener("mousedown", close))
    document.addEventListener("keydown", escape)
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape) }
  },[flyout])

  function toggle(id:string) {
    setOpen(current => {
      const next = { ...current, [id]: !(current[id] ?? false) }
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
      return next
    })
  }
  function toggleRail() {
    setRail(current => {
      try { localStorage.setItem(RAIL_KEY, current ? "0" : "1") } catch { /* storage unavailable */ }
      return !current
    })
    setFlyout(null)
  }

  if(!ready) return (
    <div style={{minHeight:"100vh",background:"#075E54",display:"flex",
      alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"rgba(255,255,255,.6)",fontSize:13,fontFamily:"DM Sans,sans-serif"}}>
        Loading…
      </div>
    </div>
  )

  const workspace = me?.workspace.name || "Your Business"
  const compact = rail && !drawer
  const flyoutGroup = flyout ? NAV.find(group => group.id === flyout.id) : undefined

  return (
    <div className={`zk-shell${compact ? " is-rail" : ""}`}>
      <style>{`
        .zk-shell{display:flex;min-height:100vh;font-family:"DM Sans",sans-serif;background-color:#efeae2;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23d9d2c5' stroke-width='1.4' opacity='.7'%3E%3Ccircle cx='18' cy='20' r='7'/%3E%3Cpath d='M60 12l8 8-8 8-8-8z'/%3E%3Cpath d='M96 18c6 0 10 4 10 9s-4 9-10 9h-6l-5 5v-6c-3-2-5-5-5-8 0-5 5-9 11-9z'/%3E%3Cpath d='M20 70h14M27 63v14'/%3E%3Ccircle cx='66' cy='72' r='3'/%3E%3Cpath d='M92 66l12 12M104 66L92 78'/%3E%3Cpath d='M14 104c4-6 10-6 14 0'/%3E%3Cpath d='M56 100h16v10H56z'/%3E%3Ccircle cx='100' cy='104' r='6'/%3E%3C/g%3E%3C/svg%3E")}
        .zk-sidebar{width:248px;background:linear-gradient(180deg,#075E54 0%,#054640 55%,#043a35 100%);display:flex;flex-direction:column;
          position:fixed;top:0;left:0;bottom:0;z-index:60;box-shadow:2px 0 14px rgba(5,70,64,.28);transition:width .18s ease,transform .2s ease}
        .zk-main{margin-left:248px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;transition:margin-left .18s ease}
        .is-rail .zk-sidebar{width:84px}
        .is-rail .zk-main{margin-left:84px}
        .zk-nav{flex:1;padding:8px 10px 12px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
        .zk-group{margin-top:4px}
        .zk-group-btn{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;background:transparent;border:0;border-radius:8px;text-decoration:none;
          cursor:pointer;color:rgba(255,255,255,.82);font-family:"DM Sans",sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
        .zk-group-btn:hover{background:rgba(255,255,255,.07);color:#fff}
        .zk-group-btn.has-active{color:#fff}
        .zk-group-btn.single.has-active{background:#25D366;color:#053d36}
        .zk-chevron{margin-left:auto;font-size:10px;transition:transform .15s ease;opacity:.7}
        .zk-chevron.open{transform:rotate(90deg)}
        .zk-items{overflow:hidden;padding-left:8px;margin-left:16px;border-left:1px solid rgba(255,255,255,.12)}
        .zk-item{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:2px 0 2px 6px;border-radius:8px;text-decoration:none;
          color:rgba(255,255,255,.7);font-size:13px;border-left:3px solid transparent}
        .zk-item:hover{background:rgba(255,255,255,.08);color:#fff}
        .zk-item.active{background:#25D366;color:#053d36;font-weight:700;border-left-color:#dcf8c6;box-shadow:0 4px 12px rgba(37,211,102,.35)}
        .zk-dot{width:7px;height:7px;border-radius:50%;background:#25D366;margin-left:auto;box-shadow:0 0 0 3px rgba(37,211,102,.25)}
        .zk-rail-btn{width:100%;display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 2px;margin:3px 0;background:transparent;
          border:0;border-radius:12px;cursor:pointer;color:rgba(255,255,255,.78);font-size:10.5px;font-weight:600;line-height:1.2;text-align:center;text-decoration:none}
        .zk-rail-btn .zk-rail-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:18px}
        .zk-rail-btn:hover .zk-rail-icon{background:rgba(255,255,255,.1)}
        .zk-rail-btn.has-active{color:#fff}
        .zk-rail-btn.has-active .zk-rail-icon{background:#25D366;box-shadow:0 4px 12px rgba(37,211,102,.4)}
        .zk-flyout{position:fixed;left:92px;z-index:70;min-width:210px;background:#fff;border-radius:12px;padding:8px;
          box-shadow:0 12px 32px rgba(11,20,26,.25);border:1px solid #e2e8f0}
        .zk-flyout a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:#0f172a;text-decoration:none;font-size:13px}
        .zk-flyout a:hover{background:#f0f2f5}
        .zk-flyout a.active{background:#dcf8c6;color:#054640;font-weight:700}
        .zk-collapse{border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.14);color:#fff;border-radius:8px;width:30px;height:30px;cursor:pointer;flex-shrink:0}
        .zk-topbar{background:#008069;padding:0 24px;height:56px;display:flex;align-items:center;
          justify-content:space-between;gap:12px;position:sticky;top:0;z-index:40;box-shadow:0 2px 8px rgba(0,64,52,.25)}
        .zk-burger{display:none;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);border-radius:8px;width:36px;height:36px;font-size:17px;cursor:pointer;color:#fff}
        .zk-content h1{color:#054640 !important}
        .zk-content > div > section, .zk-content section[style*="border"]{border-radius:12px !important;box-shadow:0 1px 3px rgba(11,20,26,.08)}
        .zk-overlay{display:none}
        .zk-content{flex:1;padding:24px 28px;max-width:1400px;width:100%}
        @media(max-width:900px){
          .zk-sidebar,.is-rail .zk-sidebar{transform:translateX(-100%);width:248px}
          .zk-sidebar.open{transform:none}
          .zk-main,.is-rail .zk-main{margin-left:0}
          .zk-burger{display:inline-flex;align-items:center;justify-content:center}
          .zk-overlay.open{display:block;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:55}
          .zk-content{padding:18px 16px}
          .zk-hide-sm,.zk-collapse{display:none}
        }
      `}</style>

      <div className={`zk-overlay${drawer ? " open" : ""}`} onClick={() => setDrawer(false)} aria-hidden="true" />

      {/* Sidebar */}
      <aside className={`zk-sidebar${drawer ? " open" : ""}`} aria-label="Main navigation">
        <div style={{padding:compact?"16px 0 12px":"16px 12px 12px 16px",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",
          alignItems:"center",justifyContent:compact?"center":"space-between",gap:8,flexDirection:compact?"column":"row"}}>
          <Link href="/app/dashboard" style={{textDecoration:"none"}} title="ZKWAConnect">
            {compact ? <LogoIcon size={38} /> : <Logo size={36} showText />}
          </Link>
          <button type="button" className="zk-collapse" onClick={toggleRail}
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"}>{compact ? "»" : "«"}</button>
        </div>

        {!compact && <div style={{margin:"12px 12px 4px",background:"rgba(0,0,0,.14)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"9px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
            <span style={{fontSize:10,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".06em"}}>Project</span>
            <Link href="/projects" style={{fontSize:10,color:"#86efac",fontWeight:700,textDecoration:"none"}}>Switch ⇄</Link>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:"#fff",fontFamily:"Sora,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{workspace}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,marginTop:4,color:me?.whatsapp.connected?"#86efac":"rgba(255,255,255,.55)"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:me?.whatsapp.connected?"#25D366":"#f59e0b"}}/>
            {me?.whatsapp.connected ? `WhatsApp · ${me.whatsapp.phoneNumber}` : "WhatsApp not connected"}
          </div>
        </div>}

        <nav className="zk-nav" style={compact ? {padding:"8px 6px"} : undefined}>
          {NAV.map(group => ({ ...group, items:group.items.filter(item => allowed(me?.workspace.role, item.href))
            .map(item => { const feature = featureForPage(item.href); return feature && me?.access && !me.access.features.includes(feature) ? { ...item, label:`${item.label} 🔒` } : item }) }))
            .filter(group => group.items.length).map(group => {
            const hasActive = group.id === activeGroup?.id
            const single = group.items.length === 1 ? group.items[0] : null
            if (compact) {
              const content = <><span className="zk-rail-icon">{group.icon}</span>{group.label}</>
              return single
                ? <Link key={group.id} href={single.href} className={`zk-rail-btn${hasActive ? " has-active" : ""}`} title={group.label}>{content}</Link>
                : <button key={group.id} type="button" className={`zk-rail-btn${hasActive ? " has-active" : ""}`} aria-haspopup="menu"
                    aria-expanded={flyout?.id === group.id} title={group.label}
                    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setFlyout(flyout?.id === group.id ? null : { id:group.id, top:rect.top }) }}>
                    {content}</button>
            }
            if (single) return <div key={group.id} className="zk-group">
              <Link href={single.href} className={`zk-group-btn single${hasActive ? " has-active" : ""}`} aria-current={hasActive ? "page" : undefined}>
                <span style={{fontSize:14,width:18,textAlign:"center",letterSpacing:0}}>{group.icon}</span>{group.label}
              </Link>
            </div>
            const isOpen = open[group.id] ?? hasActive
            return <div key={group.id} className="zk-group">
              <button type="button" className={`zk-group-btn${hasActive ? " has-active" : ""}`} aria-expanded={isOpen}
                aria-controls={`zk-group-${group.id}`} onClick={() => toggle(group.id)}>
                <span style={{fontSize:14,width:18,textAlign:"center",letterSpacing:0}}>{group.icon}</span>
                {group.label}
                {hasActive && !isOpen && <span className="zk-dot" />}
                <span className={`zk-chevron${isOpen ? " open" : ""}`} style={hasActive && !isOpen ? {marginLeft:8} : undefined}>▶</span>
              </button>
              {isOpen && <div id={`zk-group-${group.id}`} className="zk-items">
                {group.items.map(item => {
                  const current = item.href === activeItem?.href
                  return <Link key={item.href} href={item.href} className={`zk-item${current ? " active" : ""}`} aria-current={current ? "page" : undefined}>
                    <span style={{fontSize:14,width:18,textAlign:"center"}}>{item.icon}</span>{item.label}
                  </Link>
                })}
              </div>}
            </div>
          })}
        </nav>

        <div style={{padding:compact?"10px 6px 12px":"10px 10px 12px",borderTop:"1px solid rgba(255,255,255,.1)"}}>
          {me && !compact && <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px 10px"}}>
            <span style={{width:32,height:32,borderRadius:"50%",background:"#25D366",color:"#054640",display:"grid",placeItems:"center",fontWeight:800,fontSize:13,flexShrink:0}}>
              {(me.user.name || me.user.email)[0]?.toUpperCase()}</span>
            <span style={{minWidth:0}}>
              <span style={{display:"block",fontSize:12,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{me.user.name}</span>
              <span style={{display:"block",fontSize:11,color:"rgba(255,255,255,.5)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{me.user.email}</span>
            </span>
          </div>}
          <button onClick={async()=>{
            await fetch("/api/auth/logout",{method:"POST"})
            router.replace("/login")
          }} title="Sign out" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:compact?"center":"flex-start",gap:10,
            padding:"9px 12px",background:"rgba(0,0,0,.14)",border:"1px solid rgba(255,255,255,.1)",cursor:"pointer",borderRadius:8,color:"rgba(255,255,255,.75)",fontSize:13}}>
            <span style={{fontSize:15}}>🚪</span>{!compact && "Sign out"}
          </button>
        </div>
      </aside>

      {compact && flyoutGroup && flyout && <div ref={flyoutRef} className="zk-flyout" role="menu" aria-label={flyoutGroup.label}
        style={{top:Math.min(flyout.top, window.innerHeight - 60 - flyoutGroup.items.length * 42)}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".06em",padding:"6px 12px 8px"}}>{flyoutGroup.label}</div>
        {flyoutGroup.items.map(item => <Link key={item.href} href={item.href} role="menuitem" className={item.href === activeItem?.href ? "active" : ""}>
          <span style={{width:18,textAlign:"center"}}>{item.icon}</span>{item.label}</Link>)}
      </div>}

      {/* Main */}
      <div className="zk-main">
        <header className="zk-topbar">
          <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
            <button type="button" className="zk-burger" aria-label="Open menu" onClick={() => setDrawer(true)}>☰</button>
            <nav aria-label="Breadcrumb" style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
              {activeGroup && activeGroup.items.length > 1 && <>
                <span className="zk-hide-sm" style={{fontSize:13,color:"rgba(255,255,255,.75)"}}>{activeGroup.label}</span>
                <span className="zk-hide-sm" style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>›</span>
              </>}
              <span style={{fontFamily:"Sora,sans-serif",fontSize:15,fontWeight:600,color:"#fff",whiteSpace:"nowrap"}}>{activeItem?.label ?? "ZKWAConnect"}</span>
            </nav>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {me && !me.whatsapp.connected && <a href="/onboarding" className="zk-hide-sm" style={{fontSize:12,color:"#053d36",fontWeight:700,textDecoration:"none",
              background:"#dcf8c6",borderRadius:20,padding:"6px 12px",whiteSpace:"nowrap"}}>Finish WhatsApp setup →</a>}
            {me && <span className="zk-hide-sm" style={{fontSize:13,color:"rgba(255,255,255,.85)",whiteSpace:"nowrap"}}>
              Current Plan : <strong style={{color:"#fff"}}>{me.access?.internal ? "INTERNAL" : me.plan ? me.plan.name.toUpperCase() : "FREE"}</strong>{" "}
              <span style={{fontSize:11,opacity:.8}}>({me.access?.internal ? "all features" : me.plan?.status === "TRIAL" ? "trial" : me.plan ? me.plan.interval : "forever"})</span></span>}
            {!me?.access?.internal && <a href="/app/billing" style={{display:"inline-flex",alignItems:"center",gap:6,background:"#25D366",color:"#053d36",fontSize:13,fontWeight:700,
              textDecoration:"none",borderRadius:8,padding:"7px 14px",whiteSpace:"nowrap"}}>💎 {me?.access?.status === "TRIAL" ? "Upgrade" : "Explore Plans"}</a>}
            {me && <NotificationBell />}
            <InstallButton />
            {me && <ProfileMenu name={me.user.name} email={me.user.email} workspace={workspace} />}
          </div>
        </header>
        <main className="zk-content">
          {me?.access && (!me.access.active || me.access.onFree || me.access.nearLimit || (me.access.status === "TRIAL" && me.access.active && !me.access.onFree && me.access.endsAt)) &&
            <div role="status" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,
              background:!me.access.active||me.access.atLimit?"#fef2f2":me.access.onFree?"#eff6ff":"#fffbeb",border:`1px solid ${!me.access.active||me.access.atLimit?"#fecaca":"#fde68a"}`,color:!me.access.active||me.access.atLimit?"#991b1b":"#92400e"}}>
              <span style={{flex:1}}>{!me.access.active
                ? `Your ${me.access.status === "TRIAL" ? "free trial has ended" : me.access.status === "NONE" ? "workspace has no active plan" : "plan has expired"} — sending messages, broadcasts and chatbot replies are paused.`
                : me.access.onFree && !me.access.atLimit ? `You're on the Free plan${me.access.messagesLimit ? ` (${me.access.messagesLimit.toLocaleString("en-IN")} messages/month)` : ""}${me.access.status === "TRIAL" ? " — your trial has ended" : ""}. Upgrade to unlock broadcasts, chatbots and more.`
                : me.access.atLimit ? `You've used all ${me.access.messagesLimit?.toLocaleString("en-IN")} messages for this month — sending is paused until the 1st or until you upgrade.`
                : me.access.nearLimit ? `You've used ${me.access.messagesUsed.toLocaleString("en-IN")} of ${me.access.messagesLimit?.toLocaleString("en-IN")} messages this month.`
                : (() => { const days = Math.max(0, Math.ceil((new Date(me.access.endsAt!).getTime() - Date.now()) / 86_400_000))
                    return `${days <= 1 ? "Your free trial ends tomorrow" : `${days} days left in your free ${me.access.planName || ""} trial`} (ends ${new Date(me.access.endsAt!).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}). Upgrade now so broadcasts, chatbots and other features keep working — otherwise the workspace moves to the Free plan.` })()}</span>
              {atLeast(me.workspace.role, "ADMIN") ? <a href="/app/billing" style={{background:"#075e54",color:"#fff",borderRadius:6,padding:"6px 12px",fontWeight:700,textDecoration:"none",fontSize:12}}>
                {me.access.active ? "Upgrade" : "Renew plan"}</a> : <span style={{fontSize:12}}>Ask your workspace owner to renew.</span>}
            </div>}
          {(()=>{
            // Pages the plan doesn't include show an upgrade screen instead (the server refuses the actions too).
            const feature = featureForPage(pathname)
            if (feature && me?.access && !me.access.features.includes(feature))
              return <LockedFeature feature={feature} plans={me.access.plans} currentPlan={me.access.planName} canUpgrade={atLeast(me.workspace.role, "ADMIN")}/>
            return children
          })()}
        </main>
      </div>
    </div>
  )
}
