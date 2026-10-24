import type { Metadata } from "next"
import { redirect } from "next/navigation"
import QRCode from "qrcode"
import { prisma } from "@/lib/db/prisma"
import { upiAppLinks, upiUri } from "@/lib/payments/upi"
import { PayActions } from "./PayActions"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Pay securely", robots: { index: false } }

const shell = (children: React.ReactNode) => <div style={{ minHeight: "100vh", background: "#f0f4f3", display: "flex", justifyContent: "center", padding: "24px 16px", fontFamily: "DM Sans,system-ui,sans-serif", color: "#0f172a" }}>
  <div style={{ width: "100%", maxWidth: 420 }}>{children}</div></div>

// Public payment page for a customer payment request (link sent on WhatsApp).
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payment = await prisma.payment.findUnique({ where: { publicToken: token }, include: { organization: { select: { name: true, legalName: true } } } })
  if (!payment) return shell(<div style={{ background: "#fff", borderRadius: 14, padding: 24, textAlign: "center" }}><h1 style={{ fontSize: 20 }}>Payment link not found</h1>
    <p style={{ color: "#64748b", fontSize: 14 }}>Please ask the business to send a new link.</p></div>)
  if (payment.method !== "UPI" && payment.paymentLinkUrl && payment.status === "PENDING") redirect(payment.paymentLinkUrl)

  const business = payment.organization.legalName || payment.organization.name
  const amount = Number(payment.amount)
  const ref = `ZK${payment.id.slice(-6).toUpperCase()}`
  const params2 = { upiId: payment.upiId || "", payeeName: business, amount, note: `${ref} ${payment.description || ""}` }
  const qr = payment.upiId && payment.status === "PENDING" ? await QRCode.toDataURL(upiUri(params2), { width: 240, margin: 1 }) : null

  return shell(<>
    <div style={{ background: "#075e54", color: "#fff", borderRadius: "14px 14px 0 0", padding: "18px 20px" }}>
      <div style={{ fontSize: 12, opacity: .8 }}>Pay to</div>
      <div style={{ fontFamily: "Sora,sans-serif", fontSize: 19, fontWeight: 700 }}>{business}</div>
    </div>
    <div style={{ background: "#fff", borderRadius: "0 0 14px 14px", padding: 20, boxShadow: "0 8px 24px rgba(15,23,42,.08)" }}>
      <div style={{ fontSize: 13, color: "#64748b" }}>{payment.description || "Payment"}</div>
      <div style={{ fontFamily: "Sora,sans-serif", fontSize: 34, fontWeight: 800, margin: "4px 0 2px" }}>₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>Reference {ref}</div>
      {payment.status === "APPROVED" ? <div role="status" style={{ marginTop: 18, padding: 14, background: "#f0fdf4", color: "#166534", borderRadius: 10, fontWeight: 700 }}>✅ Paid — thank you!</div>
        : payment.status !== "PENDING" ? <div role="status" style={{ marginTop: 18, padding: 14, background: "#fef2f2", color: "#991b1b", borderRadius: 10 }}>This payment request is {payment.status.toLowerCase()}. Please contact {business}.</div>
        : <PayActions token={token} upiId={payment.upiId || ""} links={upiAppLinks(params2)} qr={qr} submitted={Boolean(payment.utr)} />}
    </div>
    <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 14 }}>You pay {business} directly with UPI. ZKWAConnect never holds your money.</p>
  </>)
}
