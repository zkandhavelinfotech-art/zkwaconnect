import type { Metadata } from "next"
import { LegalPage, company } from "@/components/LegalPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Privacy Policy · ZKWAConnect" }

export default function PrivacyPage() {
  const c = company()
  return <LegalPage title="Privacy Policy" intro={`This policy explains how ${c.name} ("we", "us") collects, uses and protects personal data when you use ${c.product}, our WhatsApp Business messaging platform, at ${c.site} and in our apps.`}>
    <h2>1. Two kinds of data</h2>
    <ul>
      <li><strong>Account data</strong> — about you as our customer: your name, email, mobile number, business name, GSTIN and billing address, sign-in and usage records, and payment records. We decide how this is used (we are the <em>data fiduciary / controller</em>).</li>
      <li><strong>Customer content</strong> — the contacts, conversations, messages, media, templates, chatbot flows, orders and form responses you and your team handle through {c.product}. We process this only on your instructions to provide the service (we are your <em>data processor</em>). You are responsible for having your contacts&apos; consent (WhatsApp opt-in) and for what you send.</li>
    </ul>

    <h2>2. What we collect</h2>
    <ul>
      <li>Details you give us when you register, set up a workspace, invite team members or pay.</li>
      <li>Data from Meta when you connect WhatsApp, Facebook or Instagram: business account and phone number IDs, display names, message templates, delivery and read statuses, and an access token, which we store encrypted.</li>
      <li>Messages and media sent to and from your WhatsApp Business number and Instagram account, received through Meta&apos;s official APIs.</li>
      <li>Technical data: IP address, browser and device, sign-in times, security events, and push notification subscriptions.</li>
      <li>Link clicks on tracked links (time and whether a link was opened); we do not track your contacts across other websites.</li>
    </ul>

    <h2>3. How we use it</h2>
    <ul>
      <li>To provide {c.product}: send and receive messages, run broadcasts and chatbots, show analytics, and keep your account secure.</li>
      <li>Billing, GST invoices, payment verification and fraud prevention.</li>
      <li>Service messages, such as trial and plan reminders, password resets, security alerts and important changes.</li>
      <li>Support, troubleshooting and improving reliability.</li>
      <li>Complying with law and with Meta&apos;s WhatsApp Business and Platform policies.</li>
    </ul>
    <p>We do <strong>not</strong> sell personal data, do not use your customer content for advertising, and do not use it to train AI models.</p>

    <h2>4. Who we share it with</h2>
    <ul>
      <li><strong>Meta Platforms</strong> (WhatsApp, Facebook, Instagram): messages pass through Meta&apos;s APIs, under Meta&apos;s own terms and privacy policy.</li>
      <li>Service providers who host or run parts of the service for us: cloud hosting and database, file storage, email delivery and payment processors such as Razorpay and Cashfree. They are bound to use the data only for us.</li>
      <li>Integrations you turn on (for example Shopify, WooCommerce, Google Sheets, Zapier or your webhooks). Data goes to them on your instruction.</li>
      <li>Authorities, when the law requires it.</li>
    </ul>

    <h2>5. Where and how long we keep it</h2>
    <p>Data is stored on secured cloud servers. Account data is kept while your account is active and afterwards as long as needed for tax, accounting and legal purposes (invoices: 8 years under Indian GST rules). Customer content is kept while your workspace exists. When you delete a workspace or ask us to delete your data, we delete or anonymise it within 30 days, except where the law requires us to keep it. Meta keeps its own copy of WhatsApp media for up to 30 days.</p>

    <h2>6. Security</h2>
    <p>We use HTTPS, encrypted Meta access tokens, hashed passwords, optional two-factor sign-in, role-based team permissions, sign-in rate limiting and audit logs. No system is perfectly secure; if a breach affects your personal data, we will tell you and the authorities as the law requires.</p>

    <h2>7. Your rights</h2>
    <p>Under India&apos;s Digital Personal Data Protection Act, 2023 and other applicable laws, you can ask to access, correct or delete your personal data, withdraw consent, and nominate someone to act for you. Most details can be changed in your Profile. For anything else, email <a href={`mailto:${c.email}`}>{c.email}</a>, or see <a href="/data-deletion">Data Deletion</a>. If your contacts ask about data held by a business using {c.product}, we will pass the request to that business, which decides on it.</p>

    <h2>8. Cookies</h2>
    <p>We use essential cookies only: to keep you signed in and remember your selected workspace. We do not use advertising cookies.</p>

    <h2>9. Children</h2>
    <p>{c.product} is a business service and is not meant for anyone under 18.</p>

    <h2>10. Grievance officer and changes</h2>
    <p>Grievance officer: {c.grievance || c.name}, <a href={`mailto:${c.email}`}>{c.email}</a>. We reply within 30 days. If we change this policy, we will post the new version here and tell you about important changes by email or in the app.</p>
  </LegalPage>
}
