import { prisma } from "@/lib/db/prisma"
import { metaGraph } from "@/lib/meta/graph"
import { getMetaAccessToken } from "@/lib/onboarding/context"
import { serviceWindowOpen } from "@/lib/billing/messaging"
import { findOrCreateConversation } from "@/lib/whatsapp/conversation"
import { sendAndRecord } from "@/lib/whatsapp/send"
import { markPaymentPaid } from "./requests"
import { notifyWorkspace } from "./notify"

// WhatsApp Payments (India): an "order_details" message with a "Review and pay" button. The customer pays inside WhatsApp
// through the business's own gateway (Razorpay, PayU, BillDesk or Zaakpay) linked in WhatsApp Manager → Payment configurations.
// Meta then sends a signed "payment" status webhook, which marks the payment paid.

export const WHATSAPP_PAY_GATEWAYS = ["razorpay", "payu", "billdesk", "zaakpay"] as const
export type WhatsAppPayAccount = { id: string; configurationName: string; gateway: typeof WHATSAPP_PAY_GATEWAYS[number] }
export type OrderLine = { name: string; amount: number; quantity: number }

export async function whatsAppPayAccount(organizationId: string): Promise<WhatsAppPayAccount | null> {
  const row = await prisma.paymentAccount.findUnique({ where: { organizationId_provider: { organizationId, provider: "WHATSAPP_PAY" } } })
  if (!row || row.status !== "ACTIVE") return null
  const config = row.config as { configurationName?: string; gateway?: WhatsAppPayAccount["gateway"] }
  return config.configurationName && config.gateway ? { id: row.id, configurationName: config.configurationName, gateway: config.gateway } : null
}

const money = (rupees: number) => ({ value: Math.round(rupees * 100), offset: 100 })

export type Address = { line1: string; city: string; state: string; postalCode: string }

export function orderDetailsPayload(input: { referenceId: string; account: WhatsAppPayAccount; business: string; address: Address; body: string; lines: OrderLine[]; total: number }) {
  const subtotal = input.lines.reduce((sum, line) => sum + Math.round(line.amount * 100) * line.quantity, 0) / 100
  return {
    type: "order_details",
    body: { text: input.body.slice(0, 1024) },
    footer: { text: `Pay securely to ${input.business}`.slice(0, 60) },
    action: { name: "review_and_pay", parameters: {
      reference_id: input.referenceId, type: "digital-goods", currency: "INR", total_amount: money(input.total),
      payment_settings: [{ type: "payment_gateway", payment_gateway: { type: input.account.gateway, configuration_name: input.account.configurationName,
        ...(input.account.gateway === "razorpay" ? { razorpay: { receipt: input.referenceId.slice(0, 40), notes: { zkwaconnect_reference: input.referenceId } } } : {}) } }],
      order: {
        status: "pending",
        items: input.lines.map(line => ({ name: line.name.slice(0, 60), amount: money(line.amount), quantity: line.quantity,
          // Items without a catalog need origin/importer details; the business itself is the seller.
          country_of_origin: "India", importer_name: input.business.slice(0, 200), importer_address: { address_line1: input.address.line1.slice(0, 100), city: input.address.city.slice(0, 50), zone_code: input.address.state.slice(0, 50), postal_code: input.address.postalCode, country_code: "IN" } })),
        subtotal: money(subtotal),
        ...(Math.round(input.total * 100) > Math.round(subtotal * 100) ? { tax: money(input.total - subtotal), } : {}),
        ...(Math.round(input.total * 100) < Math.round(subtotal * 100) ? { discount: money(subtotal - input.total) } : {}),
      },
    } },
  }
}

// Sends the "Review and pay" message for a payment request (inside the 24-hour window — it's an interactive message).
export async function sendOrderDetails(payment: { id: string; organizationId: string; contactId: string | null; amount: unknown; description: string | null; publicToken: string | null; orderId: string | null }, senderUserId?: string) {
  const account = await whatsAppPayAccount(payment.organizationId)
  if (!account) throw new Error("Set up WhatsApp Pay under Payments → Payment accounts first.")
  const [contact, phoneNumber, token, org, order] = await Promise.all([
    payment.contactId ? prisma.contact.findUnique({ where: { id: payment.contactId } }) : null,
    prisma.phoneNumber.findFirst({ where: { waba: { organizationId: payment.organizationId }, status: "CONNECTED" }, orderBy: { createdAt: "asc" } }),
    getMetaAccessToken(payment.organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: payment.organizationId }, select: { name: true, legalName: true, billingAddress: true, billingCity: true, state: true, billingPostalCode: true } }),
    payment.orderId ? prisma.order.findUnique({ where: { id: payment.orderId } }) : null,
  ])
  if (!contact || contact.phone.startsWith("ig:")) return { sent: false, reason: "This contact has no WhatsApp number." }
  if (!phoneNumber || !token) return { sent: false, reason: "Connect a WhatsApp number first." }
  const conversation = await findOrCreateConversation({ organizationId: payment.organizationId, phoneNumberId: phoneNumber.id, contactId: contact.id, reopen: false })
  if (!(await serviceWindowOpen(conversation.id))) return { sent: false, reason: "WhatsApp Pay messages can only be sent within 24 hours of the customer's last message." }
  const total = Number(payment.amount)
  const items = Array.isArray(order?.items) ? (order!.items as { name?: string; title?: string; price?: number; quantity?: number }[]) : []
  const lines: OrderLine[] = items.length && items.every(item => typeof item.price === "number")
    ? items.map(item => ({ name: item.name || item.title || "Item", amount: Number(item.price), quantity: Math.max(1, Number(item.quantity) || 1) }))
    : [{ name: payment.description || "Payment", amount: total, quantity: 1 }]
  const business = org.legalName || org.name
  if (!org.billingAddress || !org.billingCity || !org.state || !org.billingPostalCode) return { sent: false, reason: "WhatsApp Pay needs your business address: fill in the billing profile under Billing first." }
  const address = { line1: org.billingAddress, city: org.billingCity, state: org.state, postalCode: org.billingPostalCode }
  const interactive = orderDetailsPayload({ referenceId: payment.publicToken!, account, business, address, body: `${payment.description || "Your order"} — tap Review and pay to pay with UPI, card or netbanking.`, lines, total })
  try {
    await sendAndRecord({ accessToken: token, metaPhoneNumberId: phoneNumber.phoneNumberId, to: contact.phone, conversationId: conversation.id, senderUserId },
      { type: "interactive", interactive }, `💳 Review and pay ₹${total.toFixed(2)}`, { source: "WHATSAPP_PAY", paymentId: payment.id })
    return { sent: true, reason: "" }
  } catch (error) { return { sent: false, reason: error instanceof Error ? error.message : "WhatsApp delivery failed." } }
}

type PaymentStatus = { type?: string; status?: string; recipient_id?: string; payment?: { reference_id?: string; amount?: { value?: number; offset?: number }; transaction?: { id?: string; pg_transaction_id?: string; status?: string; type?: string; method?: { type?: string }; error?: { reason?: string } } } }

// Webhook statuses[] entry with type "payment".
export async function handleWhatsAppPayStatus(organizationId: string, phone: { phoneNumberId: string }, status: PaymentStatus) {
  const referenceId = status.payment?.reference_id
  if (!referenceId) return
  const payment = await prisma.payment.findFirst({ where: { organizationId, publicToken: referenceId, method: "WHATSAPP_PAY" } })
  if (!payment || payment.status !== "PENDING") return
  const transaction = status.payment?.transaction
  if (transaction?.status === "failed") {
    await notifyWorkspace(organizationId, "PAYMENT_FAILED", `WhatsApp Pay failed: ₹${Number(payment.amount).toFixed(2)}`, `${payment.description || "Payment"} — ${transaction.error?.reason || "the customer's payment did not go through"}.`, "/app/payments")
    return
  }
  if (!(status.status === "captured" || transaction?.status === "success")) return
  const paise = status.payment?.amount?.value !== undefined ? Math.round(status.payment.amount.value * 100 / (status.payment.amount.offset || 100)) : null
  if (paise !== null && paise !== Math.round(Number(payment.amount) * 100)) {
    await notifyWorkspace(organizationId, "PAYMENT_MISMATCH", "WhatsApp Pay amount mismatch", `Payment ${referenceId} reported ₹${paise / 100} but ₹${Number(payment.amount)} was requested. Check it before delivering.`, "/app/payments")
    return
  }
  // Cross-check with Meta's payment lookup when possible (Meta advises not to rely on the webhook alone).
  const account = await whatsAppPayAccount(organizationId)
  const token = await getMetaAccessToken(organizationId)
  if (account && token) {
    const lookup = await metaGraph<Record<string, unknown>>(`${phone.phoneNumberId}/payments/${encodeURIComponent(account.configurationName)}/${encodeURIComponent(referenceId)}`, token).catch(() => null)
    const text = lookup ? JSON.stringify(lookup) : ""
    if (lookup && /"status":"(failed|pending)"/.test(text) && !/"status":"(success|captured)"/.test(text)) return
  }
  await markPaymentPaid(payment.id, { gateway: `WhatsApp Pay${transaction?.method?.type ? ` (${transaction.method.type})` : ""}`, transactionId: transaction?.pg_transaction_id || transaction?.id })
  // Update the order card in the customer's chat.
  if (token && status.recipient_id) await metaGraph(`${phone.phoneNumberId}/messages`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    messaging_product: "whatsapp", recipient_type: "individual", to: status.recipient_id, type: "interactive",
    interactive: { type: "order_status", body: { text: "Payment received — thank you! We're processing your order." }, action: { name: "review_order", parameters: { reference_id: referenceId, order: { status: "processing" } } } },
  }) }).catch(() => null)
}
