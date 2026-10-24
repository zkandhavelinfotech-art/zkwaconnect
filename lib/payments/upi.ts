// UPI payment links (NPCI "upi://pay" intent) and the app-specific versions that open GPay, PhonePe or Paytm directly.
// No gateway is involved, so nobody notifies us of the payment: the payer submits the UTR and the business confirms it.

export type UpiParams = { upiId: string; payeeName: string; amount: number; note: string }

const query = (params: UpiParams) => new URLSearchParams({
  pa: params.upiId.trim(), pn: params.payeeName.slice(0, 50) || "Merchant", am: params.amount.toFixed(2), cu: "INR",
  // Personal UPI IDs reject merchant fields (mc/tr), so the reference goes in the note.
  tn: params.note.replace(/[^\w\s.,#\-/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60),
}).toString()

export function upiUri(params: UpiParams) {
  return `upi://pay?${query(params)}`
}

// Android and iOS app schemes; "upi://" lets Android show every installed UPI app.
export function upiAppLinks(params: UpiParams) {
  const q = query(params)
  return [
    { app: "gpay", label: "Google Pay", android: `tez://upi/pay?${q}`, ios: `gpay://upi/pay?${q}` },
    { app: "phonepe", label: "PhonePe", android: `phonepe://pay?${q}`, ios: `phonepe://pay?${q}` },
    { app: "paytm", label: "Paytm", android: `paytmmp://pay?${q}`, ios: `paytmmp://pay?${q}` },
    { app: "bhim", label: "BHIM / other UPI app", android: `upi://pay?${q}`, ios: `upi://pay?${q}` },
  ]
}

// UTR / UPI reference numbers are 12 digits; some apps show a longer alphanumeric transaction ID instead.
export function normalizeUtr(value: string) {
  const clean = value.replace(/\s/g, "").toUpperCase()
  return /^\d{12}$/.test(clean) || /^[A-Z0-9]{10,35}$/.test(clean) ? clean : null
}
