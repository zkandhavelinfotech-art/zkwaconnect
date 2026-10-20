import type { Metadata } from "next"
import { LegalPage, company } from "@/components/LegalPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Refund & Cancellation Policy · ZKWAConnect" }

export default function RefundPage() {
  const c = company()
  return <LegalPage title="Refund & Cancellation Policy" intro={`This policy covers payments made to ${c.name} for ${c.product} plans and wallet top-ups.`}>
    <h2>1. Try before you pay</h2>
    <p>Every new workspace gets a free trial, so you can check that {c.product} fits your business before paying. No card is needed for the trial.</p>

    <h2>2. Cancelling a plan</h2>
    <ul>
      <li>You can cancel at any time from <strong>Billing</strong> or by emailing <a href={`mailto:${c.email}`}>{c.email}</a>.</li>
      <li>Your plan stays active until the end of the month or year you have paid for, and it won&apos;t renew. After that, the workspace moves to the Free plan; your data is kept.</li>
    </ul>

    <h2>3. Subscription refunds</h2>
    <ul>
      <li>Subscription fees are generally <strong>non-refundable</strong> once the paid period has started, including for unused days.</li>
      <li><strong>First purchase:</strong> if you ask within <strong>7 days</strong> of your first paid plan and have sent fewer than 100 messages on it, we refund the fee in full.</li>
      <li><strong>Duplicate or wrong payments</strong>, such as being charged twice or paying for the wrong plan, are refunded in full once verified.</li>
      <li>If we cannot provide the service for reasons on our side for more than 72 hours in a row, we refund or credit the days affected.</li>
      <li>No refunds are given for suspensions caused by breaking our Terms or Meta&apos;s policies, or for Meta banning or restricting a number.</li>
    </ul>

    <h2>4. Wallet balance and WhatsApp message charges</h2>
    <ul>
      <li>Money added to the {c.product} wallet pays WhatsApp message charges and fees. Charges for messages already sent are not refundable, because Meta charges for them.</li>
      <li>Messages that fail before Meta accepts them are refunded to the wallet automatically.</li>
      <li>When you close your account, any unused wallet balance is refunded on request, minus payment-gateway charges.</li>
      <li>If Meta bills your card directly (the &quot;Direct to Meta&quot; option), those charges are between you and Meta.</li>
    </ul>

    <h2>5. How to ask and how long it takes</h2>
    <p>Email <a href={`mailto:${c.email}`}>{c.email}</a> from your account email with your workspace name, invoice number and the reason. We reply within 2 business days. Approved refunds go back to the original payment method (UPI, card or bank account) within <strong>7–10 business days</strong>. A GST credit note is issued where required.</p>
  </LegalPage>
}
