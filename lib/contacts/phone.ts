// WhatsApp IDs are digits with country code and no "+". 10-digit numbers get the default country code.
export function normalizePhone(raw: string, countryCode = "91") {
  let digits = raw.replace(/\D/g, "").replace(/^0+/, "")
  if (digits.length === 10) digits = `${countryCode}${digits}`
  return /^\d{8,15}$/.test(digits) ? digits : null
}
