import crypto from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { serviceWindowOpen } from "@/lib/billing/messaging"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { notifyWorkspace } from "@/lib/payments/notify"
import { paymentAccounts, type CashfreeAccount, type Provider, type RazorpayAccount } from "./accounts"
import { sendOrderDetails } from "./whatsapp-pay"

// Customer payment requests: the business asks a contact to pay, by direct UPI (manual UTR confirmation)
// or through its own Razorpay / Cashfree account (confirmed automatically by the gateway's webhook).

export const publicUrl = (path: string) => `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}${path}`
export const payPageUrl = (token: string) => publicUrl(`/pay/${token}`)

async function razorpayLink(account: RazorpayAccount, input: { id: string; amount: number; description: string; contact: { name: string | null; phone: string; email: string | null } }) {
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${account.keyId}:${account.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(input.amount * 100), currency: "INR", accept_partial: false, reference_id: input.id, description: input.description.slice(0, 2048),
      customer: { name: input.contact.name || undefined, contact: `+${input.contact.phone.replace(/\D/g, "")}`, email: input.contact.email || undefined },
      notify: { sms: false, email: false }, reminder_enable: false, notes: { zkwaconnect_payment_id: input.id } }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.json() as { id?: string; short_url?: string; error?: { description?: string } }
  if (!response.ok || !body.id || !body.short_url) throw new Error(body.error?.description || "Razorpay could not create a payment link.")
  return { transactionId: body.id, url: body.short_url }
}

async function cashfreeLink(account: CashfreeAccount, input: { id: string; amount: number; description: string; contact: { name: string | null; phone: string; email: string | null } }) {
  const base = account.production ? "https://api.cashfree.com" : "https://sandbox.cashfree.com"
  const response = await fetch(`${base}/pg/links`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-version": "2023-08-01", "x-client-id": account.clientId, "x-client-secret": account.clientSecret, "x-request-id": input.id },
    body: JSON.stringify({ link_id: input.id, link_amount: input.amount, link_currency: "INR", link_purpose: input.description.slice(0, 500),
      customer_details: { customer_name: input.contact.name || "Customer", customer_phone: input.contact.phone.replace(/\D/g, "").slice(-10), customer_email: input.contact.email || undefined },
      link_notify: { send_sms: false, send_email: false }, link_notes: { zkwaconnect_payment_id: input.id } }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.json() as { link_id?: string; link_url?: string; cf_link_id?: string; message?: string }
  if (!response.ok || !body.link_url) throw new Error(body.message || "Cashfree could not create a payment link.")
  return { transactionId: body.link_id || body.cf_link_id || input.id, url: body.link_url }
}

export type RequestInput = { contactId: string; amount: number; description: string; method: Provider; orderId?: string; send?: boolean; senderUserId?: string }

export async function createPaymentRequest(organizationId: string, input: RequestInput) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, organizationId } })
  if (!contact) throw Object.assign(new Error("Contact not found."), { status: 404 })
  const accounts = await paymentAccounts(organizationId)
  const account = accounts[input.method]
  if (!account) throw Object.assign(new Error(input.method === "UPI" ? "Add your UPI ID under Payments → Payment accounts first."
    : input.method === "WHATSAPP_PAY" ? "Set up WhatsApp Pay under Payments → Payment accounts first."
    : `Connect your ${input.method === "RAZORPAY" ? "Razorpay" : "Cashfree"} account under Payments → Payment accounts first.`), { status: 409 })

  const publicToken = crypto.randomBytes(12).toString("base64url")
  const payment = await prisma.payment.create({ data: { organizationId, contactId: contact.id, amount: input.amount, description: input.description, method: input.method,
    status: "PENDING", publicToken, orderId: input.orderId, paymentAccountId: account.id, upiId: input.method === "UPI" ? accounts.UPI!.upiId : undefined } })
  let url = payPageUrl(publicToken)
  try {
    if (input.method === "RAZORPAY") {
      const link = await razorpayLink(accounts.RAZORPAY!, { id: payment.id, amount: input.amount, description: input.description, contact })
      await prisma.payment.update({ where: { id: payment.id }, data: { transactionId: link.transactionId, paymentLinkUrl: link.url } }); url = link.url
    } else if (input.method === "CASHFREE") {
      const link = await cashfreeLink(accounts.CASHFREE!, { id: payment.id, amount: input.amount, description: input.description, contact })
      await prisma.payment.update({ where: { id: payment.id }, data: { transactionId: link.transactionId, paymentLinkUrl: link.url } }); url = link.url
    } else if (input.method === "UPI") {
      await prisma.payment.update({ where: { id: payment.id }, data: { paymentLinkUrl: url } })
    } else url = ""

  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", rejectionReason: error instanceof Error ? error.message : "Link creation failed." } })
    throw error
  }
  if (input.method === "WHATSAPP_PAY") {
    const sent = input.send === false ? { sent: false, reason: "not sent" } : await sendOrderDetails(payment, input.senderUserId)
    if (!sent.sent) await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", rejectionReason: sent.reason } })
    return { payment, url, ...sent }
  }
  const sent = input.send === false ? { sent: false, reason: "not sent" } : await sendToContact(organizationId, contact.id,
    `🧾 ${input.description}\nAmount: ₹${input.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n\nPay here: ${url}${input.method === "UPI" ? "\n(Google Pay, PhonePe, Paytm or any UPI app)" : ""}`,
    { source: "PAYMENT_REQUEST", paymentId: payment.id }, input.senderUserId)
  return { payment: { ...payment, paymentLinkUrl: url }, url, ...sent }
}

// Free-form WhatsApp text: only inside the 24-hour customer service window.
export async function sendToContact(organizationId: string, contactId: string, text: string, metadata: Prisma.InputJsonValue, senderUserId?: string) {
  const [contact, phoneNumber, token] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId } }),
    prisma.phoneNumber.findFirst({ where: { waba: { organizationId }, status: "CONNECTED" }, orderBy: { createdAt: "asc" } }),
    getMetaAccessToken(organizationId),
  ])
  if (!contact || contact.phone.startsWith("ig:")) return { sent: false, reason: "This contact has no WhatsApp number." }
  if (!phoneNumber || !token) return { sent: false, reason: "Connect a WhatsApp number first." }
  const conversation = await findOrCreateConversation({ organizationId, phoneNumberId: phoneNumber.id, contactId, reopen: false })
  if (!(await serviceWindowOpen(conversation.id))) return { sent: false, reason: "The customer hasn't messaged in the last 24 hours, so WhatsApp only allows templates. Copy the link and share it, or send a template first." }
  try {
    await sendAndRecord({ accessToken: token, metaPhoneNumberId: phoneNumber.phoneNumberId, to: contact.phone, conversationId: conversation.id, senderUserId },
      { type: "text", text: { preview_url: true, body: text } }, text, metadata)
    return { sent: true, reason: "" }
  } catch (error) { return { sent: false, reason: error instanceof Error ? error.message : "WhatsApp delivery failed." } }
}

// The business confirms (or rejects) a direct-UPI payment after checking its bank / UPI app for the UTR.
export async function reviewPayment(organizationId: string, paymentId: string, action: "confirm" | "reject", userId: string, reason?: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, organizationId, contactId: { not: null } } })
  if (!payment) throw Object.assign(new Error("Payment not found."), { status: 404 })
  if (payment.status !== "PENDING") throw new Error(`This payment is already ${payment.status.toLowerCase()}.`)
  if (action === "reject") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", verifiedAt: new Date(), verifiedBy: userId, rejectionReason: reason || "Payment not received" } })
    if (payment.contactId) await sendToContact(organizationId, payment.contactId, `We couldn't find your payment of ₹${Number(payment.amount).toFixed(2)}${payment.utr ? ` (UTR ${payment.utr})` : ""}. ${reason ? `${reason}. ` : ""}Please check and send the correct UTR, or contact us.`, { source: "PAYMENT_REJECTED", paymentId: payment.id }, userId)
    return { status: "REJECTED" }
  }
  return markPaymentPaid(payment.id, { verifiedBy: userId })
}

// Shared by manual confirmation, gateway webhooks and WhatsApp Pay: mark paid, update the order, thank the customer.
export async function markPaymentPaid(paymentId: string, input: { verifiedBy?: string; gateway?: string; transactionId?: string }) {
  const claimed = await prisma.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "APPROVED", verifiedAt: new Date(), verifiedBy: input.verifiedBy || input.gateway,
    ...(input.transactionId ? { transactionId: input.transactionId } : {}) } })
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
  if (!claimed.count) return { status: payment.status }
  if (payment.orderId) await prisma.order.updateMany({ where: { id: payment.orderId, organizationId: payment.organizationId }, data: { status: "PAID", paymentMethod: payment.method } })
  const amount = `₹${Number(payment.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
  await notifyWorkspace(payment.organizationId, "PAYMENT_RECEIVED", `Payment received: ${amount}`, `${payment.description || "Payment"}${input.gateway ? ` · confirmed by ${input.gateway}` : ""}.`, "/app/payments")
  if (payment.contactId) await sendToContact(payment.organizationId, payment.contactId, `✅ Payment received — ${amount}${payment.description ? ` for ${payment.description}` : ""}. Thank you!`, { source: "PAYMENT_RECEIPT", paymentId: payment.id })
  return { status: "APPROVED" }
}
