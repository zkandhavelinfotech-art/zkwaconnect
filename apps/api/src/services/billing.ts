// GST calculation + invoice number generation
export interface GSTResult {
  subtotal:  number
  cgst:      number
  sgst:      number
  igst:      number
  total:     number
  gstType:   'CGST_SGST' | 'IGST'
}

const OUR_STATE   = process.env.OUR_STATE    || 'Tamil Nadu'
const OUR_GSTIN   = process.env.OUR_GSTIN    || '33AABCZ1234A1Z5'
const HSN_CODE    = '998315'
const GST_RATE    = 0.18

export function calculateGST(subtotal: number, tenantState?: string): GSTResult {
  const sameState = tenantState?.toLowerCase() === OUR_STATE.toLowerCase()

  if (sameState) {
    // CGST 9% + SGST 9%
    const cgst = parseFloat((subtotal * 0.09).toFixed(2))
    const sgst = parseFloat((subtotal * 0.09).toFixed(2))
    return { subtotal, cgst, sgst, igst: 0, total: parseFloat((subtotal + cgst + sgst).toFixed(2)), gstType: 'CGST_SGST' }
  } else {
    // IGST 18%
    const igst = parseFloat((subtotal * GST_RATE).toFixed(2))
    return { subtotal, cgst: 0, sgst: 0, igst, total: parseFloat((subtotal + igst).toFixed(2)), gstType: 'IGST' }
  }
}

export function generateInvoiceNumber(sequence: number): string {
  const now   = new Date()
  const month = now.getMonth() + 1
  const fy    = month >= 4 ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}` : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`
  return `ZKW/${fy}/${sequence.toString().padStart(4, '0')}`
}

export { OUR_GSTIN, HSN_CODE }
