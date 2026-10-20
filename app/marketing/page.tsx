export default function MarketingPage() {
  const supportNumber = (process.env.SUPPORT_WHATSAPP_NUMBER || "").replace(/\D/g, "")
  const marketingUrl = supportNumber
    ? `/marketing/index.html?support=${encodeURIComponent(supportNumber)}`
    : "/marketing/index.html"

  return (
    <div style={{ margin:0, padding:0, background:"#075E54", minHeight:"100vh" }}>
      <iframe src={marketingUrl}
        style={{ width:"100%", height:"100vh", border:"none", display:"block" }}
        title="ZKWAConnect — WhatsApp Business API Platform" />
    </div>
  )
}
