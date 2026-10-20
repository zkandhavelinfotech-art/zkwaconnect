"use client"
import { useEffect,useState } from "react"
import QRCode from "qrcode"

type Contact={id:string;name:string|null;phone:string;email:string|null}
type Payment={id:string;amount:number|string;description:string|null;method:string;status:string;paymentLinkUrl:string|null;createdAt:string;contact:{name:string|null;phone:string}|null}
type Data={contacts:Contact[];payments:Payment[];providers:{UPI:boolean;RAZORPAY:boolean;CASHFREE:boolean}}
const fieldStyle:React.CSSProperties={width:"100%",boxSizing:"border-box",minHeight:42,padding:"9px 11px",border:"1px solid #cbd5d3",borderRadius:6,fontSize:13,background:"#fff"}

export default function WhatsAppPaymentsPage(){
  const [data,setData]=useState<Data|null>(null)
  const [contactId,setContactId]=useState("")
  const [amount,setAmount]=useState("")
  const [description,setDescription]=useState("")
  const [method,setMethod]=useState<"UPI"|"RAZORPAY"|"CASHFREE">("UPI")
  const [linkUrl,setLinkUrl]=useState("")
  const [qr,setQr]=useState("")
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{
    let active=true
    fetch("/api/whatsapp/payments").then(async response=>{
      const body=await response.json()
      if(!response.ok)throw new Error(body.error||"Could not load payment options.")
      if(active)setData(body)
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Could not load payment options.")})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[refresh])

  // Pre-fill from an order ("Payment link" on Commerce → Orders).
  useEffect(()=>{
    const query=new URLSearchParams(window.location.search)
    if(query.get("contact"))setContactId(query.get("contact")||"")
    if(query.get("amount"))setAmount(query.get("amount")||"")
    if(query.get("description"))setDescription(query.get("description")||"")
  },[])

  useEffect(()=>{
    if(!linkUrl.startsWith("upi://")){setQr("");return}
    QRCode.toDataURL(linkUrl,{width:220,margin:1}).then(setQr).catch(()=>setQr(""))
  },[linkUrl])

  async function createRequest(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");setNotice("");setLinkUrl("")
    try{
      const response=await fetch("/api/whatsapp/payments",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contactId,amount:Number(amount),description,method})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error||"Could not create payment request.")
      setLinkUrl(body.linkUrl);setNotice(body.message);setRefresh(value=>value+1)
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not create payment request.")}
    finally{setBusy(false)}
  }

  if(loading)return <div style={{padding:24,color:"#647b77"}}>Loading payment options…</div>
  return <div>
    <div style={{marginBottom:20}}><h1 style={{fontFamily:"Sora,sans-serif",fontSize:22,fontWeight:700,color:"#0f172a",margin:0}}>WhatsApp payments</h1>
      <p style={{fontSize:13,color:"#64748b",margin:"4px 0 0"}}>Send payment requests to opted-in contacts.</p></div>
    {error&&<div role="alert" style={{padding:11,background:"#fff1f0",color:"#9f2d22",borderRadius:6,marginBottom:14,fontSize:13}}>{error}</div>}
    {notice&&<div role="status" style={{padding:11,background:"#eaf8f1",color:"#176b4b",borderRadius:6,marginBottom:14,fontSize:13}}>{notice}</div>}
    <section style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(260px,.8fr)",gap:16,alignItems:"start"}}>
      <form onSubmit={createRequest} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20}}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 15px",color:"#183633"}}>New payment request</h2>
        <label style={{display:"block",marginBottom:12}}><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Opted-in contact</span>
          <select required value={contactId} onChange={event=>setContactId(event.target.value)} style={fieldStyle}>
            <option value="">Select contact</option>{data?.contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.name||contact.phone} · {contact.phone}</option>)}
          </select></label>
        <div style={{display:"grid",gridTemplateColumns:"minmax(130px,.6fr) minmax(160px,1fr)",gap:11}}>
          <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Amount (INR)</span>
            <input required type="number" min="1" max="1000000" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} style={fieldStyle}/></label>
          <label><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Description</span>
            <input required minLength={3} maxLength={180} value={description} onChange={event=>setDescription(event.target.value)} style={fieldStyle}/></label>
        </div>
        <label style={{display:"block",marginTop:12}}><span style={{display:"block",fontSize:11,fontWeight:700,color:"#526763",marginBottom:6}}>Payment method</span>
          <select value={method} onChange={event=>setMethod(event.target.value as typeof method)} style={fieldStyle}>
            {data?.providers.UPI&&<option value="UPI">UPI QR / UPI app — manual confirmation</option>}
            {data?.providers.RAZORPAY&&<option value="RAZORPAY">Razorpay — automatic confirmation</option>}
            {data?.providers.CASHFREE&&<option value="CASHFREE">Cashfree — automatic confirmation</option>}
          </select></label>
        <div style={{fontSize:11,color:"#71817e",lineHeight:1.5,marginTop:10}}>Only contacts with recorded WhatsApp opt-in are available. UPI payments require manual review; online gateways settle through signed webhooks.</div>
        <button type="submit" disabled={busy||!contactId||!amount||!description} style={{marginTop:14,border:0,borderRadius:6,padding:"10px 14px",
          background:"#075e54",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>{busy?"Creating and sending…":"Create and send payment link"}</button>
        {data&&!Object.values(data.providers).some(Boolean)&&<div style={{fontSize:11,color:"#a83226",marginTop:10}}>Configure UPI_ID, Razorpay, or Cashfree credentials to enable payment methods.</div>}
      </form>

      <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:20}}>
        <h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:"0 0 12px",color:"#183633"}}>Payment preview</h2>
        {linkUrl?<>
          {qr&&<img src={qr} alt="UPI payment QR" width={220} height={220} style={{display:"block",maxWidth:"100%",height:"auto",border:"1px solid #e2e8f0",padding:8,borderRadius:6}}/>}
          <a href={linkUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:10,color:"#087763",fontWeight:700,fontSize:12,overflowWrap:"anywhere"}}>{qr?"Open UPI app":"Open secure payment page"}</a>
          <button onClick={()=>navigator.clipboard.writeText(linkUrl)} style={{display:"block",marginTop:10,border:"1px solid #cbd5d3",borderRadius:5,padding:"7px 10px",background:"#fff",fontSize:11,cursor:"pointer"}}>Copy payment link</button>
        </>:<p style={{fontSize:12,color:"#71817e",margin:0}}>The link or QR will appear here when created.</p>}
      </section>
    </section>

    <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden",marginTop:18}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid #e8efee"}}><h2 style={{fontFamily:"Sora,sans-serif",fontSize:15,margin:0,color:"#183633"}}>Recent requests</h2></div>
      {data?.payments.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:620,borderCollapse:"collapse",fontSize:12,textAlign:"left"}}>
        <thead style={{background:"#f7faf9",color:"#647b77"}}><tr>{["Contact","Description","Method","Amount","Status","Link"].map(label=><th key={label} style={{padding:11,fontWeight:600}}>{label}</th>)}</tr></thead>
        <tbody>{data.payments.map(payment=><tr key={payment.id} style={{borderTop:"1px solid #edf1f0"}}>
          <td style={{padding:11}}>{payment.contact?.name||payment.contact?.phone||"-"}</td><td style={{padding:11}}>{payment.description||"Payment request"}</td>
          <td style={{padding:11}}>{payment.method}</td><td style={{padding:11}}>₹{Number(payment.amount).toFixed(2)}</td><td style={{padding:11}}>{payment.status}</td>
          <td style={{padding:11}}>{payment.paymentLinkUrl?<a href={payment.paymentLinkUrl} target="_blank" rel="noreferrer" style={{color:"#087763"}}>Open</a>:"-"}</td>
        </tr>)}</tbody></table></div>:<div style={{padding:18,fontSize:12,color:"#71817e"}}>No payment requests yet.</div>}
    </section>
  </div>
}