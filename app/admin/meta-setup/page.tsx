"use client"
import { useCallback, useEffect, useState } from "react"

type Status = "pass"|"warn"|"fail"|"info"
type Check = { id:string; step:number; title:string; status:Status; detail:string }
type Result = {
  checks:Check[]
  values:{ appId:string; callbackUrl:string; redirectUri:string; verifyToken:string; scopes:readonly {scope:string;purpose:string}[]; publicUrl:string
    configId:string; graphVersion:string; appSecretSet:boolean; encryptionKeySet:boolean; canWriteEnv:boolean }
  summary:{ pass:number; attention:number }
  checkedAt:string
}

const STATUS:Record<Status,{icon:string;color:string;bg:string;label:string}> = {
  pass:{icon:"✓",color:"#4ade80",bg:"rgba(74,222,128,.12)",label:"OK"},
  warn:{icon:"!",color:"#fbbf24",bg:"rgba(251,191,36,.12)",label:"Check"},
  fail:{icon:"✕",color:"#f87171",bg:"rgba(248,113,113,.12)",label:"Fix"},
  info:{icon:"i",color:"#93c5fd",bg:"rgba(147,197,253,.12)",label:"Manual"},
}

function Copy({value,secret=false}:{value:string;secret?:boolean}) {
  const [shown,setShown] = useState(!secret)
  const [copied,setCopied] = useState(false)
  if(!value)return <span style={{color:"#f87171",fontSize:12}}>Not configured</span>
  return <span style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
    <code style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"4px 8px",fontSize:12,
      color:"#e2e8f0",wordBreak:"break-all"}}>{shown?value:"•".repeat(Math.min(24,value.length))}</code>
    {secret&&<button onClick={()=>setShown(v=>!v)} style={smallBtn}>{shown?"Hide":"Show"}</button>}
    <button onClick={()=>{navigator.clipboard.writeText(value).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500)})}} style={smallBtn}>{copied?"Copied ✓":"Copy"}</button>
  </span>
}
const smallBtn:React.CSSProperties = {background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#e2e8f0",borderRadius:6,
  padding:"3px 9px",fontSize:11,cursor:"pointer"}

export default function MetaSetupPage() {
  const [result,setResult] = useState<Result|null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState("")

  const run = useCallback(async()=>{
    setLoading(true);setError("")
    try{
      const response = await fetch("/api/admin/meta-setup")
      const body = await response.json()
      if(!response.ok)throw new Error(body.error||"Checks failed to run.")
      setResult(body)
    }catch(reason){setError(reason instanceof Error?reason.message:"Checks failed to run.")}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{run()},[run])

  const v = result?.values
  const steps:{n:number;title:string;body:React.ReactNode}[] = [
    {n:1,title:"Create your Meta app",body:<>
      <ol style={olStyle}>
        <li>Open <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={linkStyle}>developers.facebook.com/apps</a> and click <b>Create app</b>.</li>
        <li>Connect it to <b>your own business portfolio</b> — the app belongs to you, not to your customers.</li>
        <li>Add the products <b>WhatsApp</b>, <b>Facebook Login for Business</b> and <b>Marketing API</b>.</li>
        <li>In <b>App settings → Basic</b>, copy the App ID and App secret, and add a Privacy Policy URL (required to go live).</li>
      </ol></>},
    {n:2,title:"Save the credentials (form above, or edit .env)",body:<>
      <p style={pStyle}>Use the <b>Meta app credentials</b> form above — it checks them with Meta and writes .env for you. Or add these lines yourself:</p>
      <pre style={preStyle}>{`META_APP_ID=${v?.appId||"<numeric app id>"}
NEXT_PUBLIC_META_APP_ID=${v?.appId||"<same app id>"}
META_APP_SECRET=<app secret>
ENCRYPTION_KEY=<random 32+ characters>
SESSION_SECRET=<random 32+ characters>
META_VERIFY_TOKEN=<random string you choose>
APP_URL=${v?.publicUrl||"https://app.zkwaconnect.in"}`}</pre>
      <div style={hintStyle}>Restart the server after editing .env, then re-run these checks.</div></>},
    {n:3,title:"Allow the login redirect",body:<>
      <p style={pStyle}>Facebook Login for Business → Settings → <b>Valid OAuth Redirect URIs</b>:</p>
      <Copy value={v?.redirectUri||""}/></>},
    {n:4,title:"Point Meta's webhook at ZKWAConnect",body:<>
      <p style={pStyle}>WhatsApp → Configuration → Webhook → <b>Edit</b>:</p>
      <div style={{display:"grid",gap:8}}>
        <div><span style={kvLabel}>Callback URL</span><Copy value={v?.callbackUrl||""}/></div>
        <div><span style={kvLabel}>Verify token</span><Copy value={v?.verifyToken||""} secret/></div>
      </div>
      <p style={{...pStyle,marginTop:10}}>Click <b>Verify and save</b>, then under Webhook fields subscribe to <b>“messages”</b> and <b>“message_template_status_update”</b> (template approvals).</p>
      <RegisterWebhook defaultUrl={v?.callbackUrl||""} onDone={run}/></>},
    {n:5,title:"Get permissions approved and go live",body:<>
      <p style={pStyle}>In <b>App Review → Permissions and features</b>, request <b>advanced access</b> for:</p>
      <div style={{display:"grid",gap:4,marginBottom:10}}>{v?.scopes.map(item=><div key={item.scope} style={{fontSize:12,color:"#cbd5e1"}}>
        <code style={{color:"#86efac"}}>{item.scope}</code> — {item.purpose}</div>)}</div>
      <p style={pStyle}>Complete <b>Business Verification</b> for your portfolio, then switch the app from Development to <b>Live</b>. Until then, only people with a role on the app can connect.</p></>},
    {n:6,title:"Customer accounts receive messages",body:<p style={pStyle}>
      When a customer picks their WhatsApp Business Account during setup, ZKWAConnect subscribes it to your app so their messages reach the inbox.
      Accounts connected before this was added can be fixed by the customer in <b>Settings → WhatsApp</b>.</p>},
  ]

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#fff",fontFamily:"DM Sans,sans-serif"}}>
      <div style={{background:"#1e293b",borderBottom:"1px solid rgba(255,255,255,.08)",padding:"16px 32px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <a href="/admin/dashboard" style={{color:"rgba(255,255,255,.6)",fontSize:13,textDecoration:"none"}}>← Admin</a>
        <div style={{fontFamily:"Sora,sans-serif",fontSize:18,fontWeight:700}}>Meta app setup</div>
        <div style={{flex:1}}/>
        {result&&<div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>
          <span style={{color:"#4ade80",fontWeight:700}}>{result.summary.pass} passing</span> · <span style={{color:result.summary.attention?"#fbbf24":"#4ade80",fontWeight:700}}>
            {result.summary.attention} need attention</span> · checked {new Date(result.checkedAt).toLocaleTimeString()}</div>}
        <button onClick={run} disabled={loading} style={{background:"#25D366",color:"#fff",border:0,borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",opacity:loading?.6:1}}>
          {loading?"Checking…":"Re-run checks"}</button>
      </div>

      <div style={{maxWidth:1000,margin:"0 auto",padding:"28px 24px 60px"}}>
        <p style={{fontSize:14,color:"rgba(255,255,255,.6)",lineHeight:1.6,margin:"0 0 22px",maxWidth:720}}>
          ZKWAConnect uses <b style={{color:"#fff"}}>one Meta app that you own</b>. Your customers never create apps — they just click “Continue with Meta” during setup.
          Follow these steps once on Meta&apos;s developer site; each step is checked live against your server and Meta.
        </p>
        {error&&<div role="alert" style={{background:"rgba(248,113,113,.12)",border:"1px solid rgba(248,113,113,.3)",color:"#fca5a5",borderRadius:8,padding:12,marginBottom:16,fontSize:13}}>{error}</div>}

        {result&&<CredentialsForm values={result.values} onSaved={run}/>}

        {steps.map(step=>{
          const stepChecks = result?.checks.filter(check=>check.step===step.n)||[]
          const worst = stepChecks.some(c=>c.status==="fail")?"fail":stepChecks.some(c=>c.status==="warn")?"warn":stepChecks.length&&stepChecks.every(c=>c.status==="pass")?"pass":"info"
          return <section key={step.n} style={{background:"#1e293b",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,padding:20,marginBottom:14,
            borderLeft:`3px solid ${STATUS[worst].color}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <span style={{width:30,height:30,borderRadius:"50%",background:STATUS[worst].bg,color:STATUS[worst].color,display:"flex",alignItems:"center",
                justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>{worst==="pass"?"✓":step.n}</span>
              <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,fontWeight:700,margin:0}}>{step.title}</h2>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,380px),1fr))",gap:18}}>
              <div>{step.body}</div>
              <div style={{display:"grid",gap:8,alignContent:"start"}}>
                {loading&&!result?<div style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>Checking…</div>:stepChecks.map(check=>{
                  const style = STATUS[check.status]
                  return <div key={check.id} style={{background:style.bg,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700}}>
                      <span style={{color:style.color}}>{style.icon}</span>{check.title}
                      <span style={{marginLeft:"auto",fontSize:10,color:style.color,textTransform:"uppercase",letterSpacing:".06em"}}>{style.label}</span>
                    </div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.65)",marginTop:4,lineHeight:1.5,overflowWrap:"anywhere"}}>{check.detail}</div>
                  </div>
                })}
              </div>
            </div>
          </section>
        })}
      </div>
    </div>
  )
}

const olStyle:React.CSSProperties = {margin:0,paddingLeft:18,fontSize:13,color:"#cbd5e1",lineHeight:1.8}
const linkStyle:React.CSSProperties = {color:"#86efac"}
const preStyle:React.CSSProperties = {background:"rgba(0,0,0,.3)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,padding:12,fontSize:12,
  color:"#e2e8f0",overflowX:"auto",margin:0}
const hintStyle:React.CSSProperties = {fontSize:11,color:"rgba(255,255,255,.45)",marginTop:6}
const pStyle:React.CSSProperties = {fontSize:13,color:"#cbd5e1",lineHeight:1.6,margin:"0 0 8px"}
const kvLabel:React.CSSProperties = {display:"block",fontSize:11,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}

function CredentialsForm({values,onSaved}:{values:Result["values"];onSaved:()=>Promise<void>}) {
  const [appId,setAppId] = useState(values.appId)
  const [appSecret,setAppSecret] = useState("")
  const [verifyToken,setVerifyToken] = useState("")
  const [generateVerifyToken,setGenerateVerifyToken] = useState(!values.verifyToken)
  const [configId,setConfigId] = useState(values.configId)
  const [graphVersion,setGraphVersion] = useState(values.graphVersion||"v25.0")
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState<{tone:"ok"|"error";text:string;lines?:string[]}|null>(null)

  async function save(event:React.FormEvent){
    event.preventDefault();setSaving(true);setMessage(null)
    try{
      const response = await fetch("/api/admin/meta-setup",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({appId,appSecret,verifyToken:generateVerifyToken?"":verifyToken,generateVerifyToken,configId,graphVersion})})
      const body = await response.json()
      if(!response.ok){setMessage({tone:"error",text:body.error||"Could not save.",lines:body.lines});return}
      setAppSecret("");setVerifyToken("");setGenerateVerifyToken(false)
      setMessage({tone:"ok",text:[body.message,body.generatedVerifyToken?"A new verify token was generated — paste it into Meta's webhook settings (step 4).":"",
        body.generatedEncryptionKey?"A strong ENCRYPTION_KEY was generated.":""].filter(Boolean).join(" ")})
      await onSaved()
    }catch{setMessage({tone:"error",text:"Network error. Please try again."})}
    finally{setSaving(false)}
  }

  return <section style={{background:"#1e293b",border:"1px solid rgba(37,211,102,.35)",borderRadius:12,padding:20,marginBottom:22}}>
    <h2 style={{fontFamily:"Sora,sans-serif",fontSize:16,fontWeight:700,margin:"0 0 4px"}}>Meta app credentials</h2>
    <p style={{fontSize:12,color:"rgba(255,255,255,.55)",margin:"0 0 16px",lineHeight:1.6}}>
      From <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={linkStyle}>developers.facebook.com/apps</a> → your app → App settings → Basic.
      Meta checks the App ID and secret before anything is saved. {values.canWriteEnv?"Saved to the server's .env (previous version kept as .env.backup).":"This server can't write .env — you'll get the lines to add to your hosting settings."}</p>
    <form onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:14}}>
      <label><span style={kvLabel}>App ID *</span>
        <input required value={appId} onChange={event=>setAppId(event.target.value.replace(/\D/g,""))} placeholder="1234567890123456" style={darkInput}/></label>
      <label><span style={kvLabel}>App secret {values.appSecretSet&&<span style={{textTransform:"none",color:"#86efac"}}>· saved</span>}</span>
        <input type="password" autoComplete="off" value={appSecret} onChange={event=>setAppSecret(event.target.value.trim())}
          placeholder={values.appSecretSet?"Leave blank to keep the saved secret":"32-character app secret"} required={!values.appSecretSet} style={darkInput}/></label>
      <label><span style={kvLabel}>Webhook verify token</span>
        <input value={verifyToken} disabled={generateVerifyToken} onChange={event=>setVerifyToken(event.target.value.trim())}
          placeholder={values.verifyToken?"Leave blank to keep the current token":"Your own random string"} style={{...darkInput,opacity:generateVerifyToken?.5:1}}/>
        <span style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"rgba(255,255,255,.55)",marginTop:6}}>
          <input type="checkbox" checked={generateVerifyToken} onChange={event=>setGenerateVerifyToken(event.target.checked)}/> Generate a secure token for me</span></label>
      <label><span style={kvLabel}>Embedded Signup configuration ID (optional)</span>
        <input value={configId} onChange={event=>setConfigId(event.target.value.replace(/\D/g,""))} placeholder="Facebook Login for Business → Configurations" style={darkInput}/></label>
      <label><span style={kvLabel}>Graph API version</span>
        <input value={graphVersion} onChange={event=>setGraphVersion(event.target.value.trim())} placeholder="v25.0" style={darkInput}/></label>
      <div style={{display:"flex",alignItems:"flex-end"}}>
        <button type="submit" disabled={saving} style={{background:"#25D366",color:"#fff",border:0,borderRadius:8,padding:"11px 18px",fontWeight:700,fontSize:13,cursor:"pointer",opacity:saving?.6:1}}>
          {saving?"Checking with Meta…":"Verify with Meta & save"}</button>
      </div>
    </form>
    {message&&<div role={message.tone==="error"?"alert":"status"} style={{marginTop:14,borderRadius:8,padding:"10px 12px",fontSize:13,
      background:message.tone==="ok"?"rgba(74,222,128,.12)":"rgba(248,113,113,.12)",color:message.tone==="ok"?"#86efac":"#fca5a5"}}>
      {message.text}
      {message.lines&&<pre style={{...preStyle,marginTop:8}}>{message.lines.join("\n")}</pre>}
    </div>}
  </section>
}
const darkInput:React.CSSProperties = {width:"100%",boxSizing:"border-box",background:"rgba(0,0,0,.25)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,
  padding:"9px 11px",fontSize:13,color:"#fff",fontFamily:"inherit"}

function RegisterWebhook({defaultUrl,onDone}:{defaultUrl:string;onDone:()=>Promise<void>}) {
  const [url,setUrl] = useState(defaultUrl)
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState<{ok:boolean;text:string}|null>(null)
  useEffect(()=>{setUrl(current=>current||defaultUrl)},[defaultUrl])
  async function register(){
    setBusy(true);setMessage(null)
    try{
      const response = await fetch("/api/admin/meta-setup/webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({callbackUrl:url})})
      const body = await response.json()
      setMessage({ok:response.ok,text:body.message||body.error||"Done."})
      if(response.ok)await onDone()
    }catch{setMessage({ok:false,text:"Network error. Please try again."})}
    finally{setBusy(false)}
  }
  return <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.08)"}}>
    <p style={pStyle}><b>Or do it from here:</b> once this address is live on the internet, register it with Meta in one click.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <input value={url} onChange={event=>setUrl(event.target.value.trim())} aria-label="Webhook callback URL"
        style={{flex:1,minWidth:240,boxSizing:"border-box",background:"rgba(0,0,0,.25)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"8px 10px",fontSize:12,color:"#fff"}}/>
      <button type="button" onClick={register} disabled={busy||!url} style={{background:"#25D366",color:"#fff",border:0,borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",opacity:busy?.6:1}}>
        {busy?"Registering…":"Register webhook with Meta"}</button>
    </div>
    {message&&<div role={message.ok?"status":"alert"} style={{marginTop:8,fontSize:12,borderRadius:8,padding:"8px 10px",
      background:message.ok?"rgba(74,222,128,.12)":"rgba(248,113,113,.12)",color:message.ok?"#86efac":"#fca5a5"}}>{message.text}</div>}
  </div>
}
