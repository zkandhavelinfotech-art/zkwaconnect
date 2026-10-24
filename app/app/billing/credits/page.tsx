import { redirect } from "next/navigation"

// v5.0.0's "Add credits" address: credits are the WhatsApp wallet, topped up on the Billing page.
export default function CreditsPage() {
  redirect("/app/billing#wallet")
}
