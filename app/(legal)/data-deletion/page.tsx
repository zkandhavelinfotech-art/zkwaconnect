import type { Metadata } from "next"
import { LegalPage, company } from "@/components/LegalPage"
import { DeletionForm } from "./DeletionForm"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Data Deletion · ZKWAConnect" }

export default function DataDeletionPage() {
  const c = company()
  return <LegalPage title="Data Deletion" intro={`How to delete your data from ${c.product}, including data we received through Facebook, Instagram or WhatsApp (Meta) login and connections.`}>
    <h2>Delete your account and workspaces</h2>
    <ol>
      <li>Sign in to {c.product}. Workspace owners can export their contacts first from <strong>Contacts → Export</strong>.</li>
      <li>Email <a href={`mailto:${c.email}`}>{c.email}</a> from your account email with the subject <strong>&quot;Delete my account&quot;</strong>, and say which workspaces should be deleted.</li>
      <li>We confirm by email and delete the account, its workspaces, contacts, conversations, media, templates and Meta access tokens within <strong>30 days</strong>. Invoices and payment records are kept as tax law requires.</li>
    </ol>

    <h2>Remove the Meta (Facebook / WhatsApp / Instagram) connection</h2>
    <ul>
      <li>On Facebook: <strong>Settings &amp; privacy → Settings → Business integrations</strong> (or Apps and websites) → find {c.product} → <strong>Remove</strong>. Meta notifies us automatically, and we create a deletion request with a confirmation code you can check below. Removing the app also cancels the access it gave us straight away.</li>
    </ul>

    <h2>You are a contact of a business that uses {c.product}</h2>
    <p>That business controls your messages and contact details. Reply <strong>STOP</strong> on WhatsApp to stop marketing messages, and ask the business to delete your data. You can also use the form below; we will pass your request to the business.</p>

    <h2>Request deletion or check a request</h2>
    <DeletionForm />
  </LegalPage>
}
