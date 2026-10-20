import type { Metadata } from "next"
import { LegalPage, company } from "@/components/LegalPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Terms of Service · ZKWAConnect" }

export default function TermsPage() {
  const c = company()
  return <LegalPage title="Terms of Service" intro={`These terms are an agreement between you (the business that signs up, and everyone you add to your workspace) and ${c.name} for the use of ${c.product}. By creating an account or using the service, you agree to them.`}>
    <h2>1. The service</h2>
    <p>{c.product} is software for using the official WhatsApp Business Platform (Cloud API) and related Meta channels. It includes a team inbox, broadcasts, templates, chatbots, forms, catalogs and orders, integrations, analytics and an API. Features depend on your plan. {c.product} is not affiliated with or endorsed by Meta; WhatsApp is a trademark of Meta Platforms, Inc.</p>

    <h2>2. Your account</h2>
    <ul>
      <li>Give accurate details, keep your password and 2FA codes safe, and tell us right away about any unauthorised use.</li>
      <li>You are responsible for everything done through your workspace by you, your team members and your API keys.</li>
      <li>You must be 18 or older and able to make a contract on behalf of your business.</li>
    </ul>

    <h2>3. Meta and WhatsApp rules</h2>
    <p>You must follow the <a href="https://business.whatsapp.com/policy" target="_blank" rel="noreferrer">WhatsApp Business Policy</a>, the WhatsApp Commerce Policy, Meta&apos;s Platform Terms and all laws that apply to your messages. In particular:</p>
    <ul>
      <li>Message only people who have opted in to hear from you on WhatsApp, and honour opt-out requests promptly.</li>
      <li>Do not send spam, or illegal, misleading, harmful, adult or prohibited content, and do not sell regulated goods in ways Meta forbids.</li>
      <li>Meta approves templates, sets messaging limits and quality ratings, and may restrict or ban numbers. We are not responsible for Meta&apos;s decisions, outages or changes to its pricing.</li>
    </ul>

    <h2>4. Plans, trials and payment</h2>
    <ul>
      <li>New workspaces get a free trial (currently 7 days) of a paid plan. After it ends, the workspace moves to the Free plan, where paid features lock, unless you buy a plan.</li>
      <li>Subscription fees are charged in advance, monthly or yearly, in Indian Rupees, plus GST. We issue GST invoices.</li>
      <li><strong>WhatsApp conversation and message charges are separate from the subscription.</strong> Depending on the billing option your workspace uses, Meta bills you directly, or the charges are taken from your prepaid {c.product} wallet at the rates shown in the app.</li>
      <li>If a payment is not made, sending can pause and the workspace can move to the Free plan. We may change prices with at least 30 days&apos; notice; the change applies from your next renewal.</li>
      <li>Refunds are covered by our <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.</li>
    </ul>

    <h2>5. Your content</h2>
    <p>You own your contacts, messages and other content. You give us permission to host, process and transmit it only to provide the service, as described in our <a href="/privacy">Privacy Policy</a>. You confirm that you have the rights and consents needed for it.</p>

    <h2>6. Acceptable use</h2>
    <p>Do not misuse the service. That includes trying to break its security, overloading it, reverse engineering it, reselling it without a partner agreement, or using it to harass people or break the law. We may suspend workspaces that put the platform, other customers or Meta access at risk; when we can, we will warn you first.</p>

    <h2>7. Availability and support</h2>
    <p>We work to keep {c.product} available and to tell you in advance about planned maintenance. The service depends on Meta and other third parties, so we cannot guarantee it will be uninterrupted. Support is by email and in-app chat; higher plans get faster responses.</p>

    <h2>8. Liability</h2>
    <p>The service is provided &quot;as is&quot;. As far as the law allows, we are not liable for indirect or consequential losses, such as lost profits, lost data or business interruption, and our total liability for any claim is limited to the fees you paid us in the 3 months before it. Nothing here limits liability that cannot be limited by law.</p>

    <h2>9. Ending the agreement</h2>
    <p>You can cancel any time from Billing or by emailing us. Your plan stays active until the end of the period you paid for. You can export your contacts before closing. After a workspace is closed, we delete its data as described in the Privacy Policy.</p>

    <h2>10. Law and disputes</h2>
    <p>These terms are governed by the laws of India. Disputes will first be discussed in good faith, and otherwise go to the courts at {c.jurisdiction || "the place of our registered office"}. We may update these terms; if we do, we will post the new version here and tell you about important changes.</p>
  </LegalPage>
}
