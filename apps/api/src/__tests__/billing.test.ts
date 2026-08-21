import { describe, it, expect } from 'vitest'
import { calculateGST, generateInvoiceNumber } from '../services/billing'

describe('calculateGST', () => {
  describe('same state (Tamil Nadu → Tamil Nadu)', () => {
    it('applies CGST 9% + SGST 9%', () => {
      const r = calculateGST(5999, 'Tamil Nadu')
      expect(r.gstType).toBe('CGST_SGST')
      expect(r.cgst).toBeCloseTo(539.91, 1)
      expect(r.sgst).toBeCloseTo(539.91, 1)
      expect(r.igst).toBe(0)
      expect(r.total).toBeCloseTo(7078.82, 1)
    })

    it('handles case-insensitive state match', () => {
      const r = calculateGST(1000, 'tamil nadu')
      expect(r.gstType).toBe('CGST_SGST')
    })
  })

  describe('inter-state (Maharashtra → Tamil Nadu)', () => {
    it('applies IGST 18%', () => {
      const r = calculateGST(5999, 'Maharashtra')
      expect(r.gstType).toBe('IGST')
      expect(r.igst).toBeCloseTo(1079.82, 1)
      expect(r.cgst).toBe(0)
      expect(r.sgst).toBe(0)
      expect(r.total).toBeCloseTo(7078.82, 1)
    })
  })

  describe('wallet topup', () => {
    it('calculates GST on 1000 same state', () => {
      const r = calculateGST(1000, 'Tamil Nadu')
      expect(r.subtotal).toBe(1000)
      expect(r.total).toBeCloseTo(1180, 0)
    })
  })

  describe('missing state', () => {
    it('defaults to IGST when state undefined', () => {
      const r = calculateGST(1000, undefined)
      expect(r.gstType).toBe('IGST')
    })
  })
})

describe('generateInvoiceNumber', () => {
  it('generates correct format', () => {
    const num = generateInvoiceNumber(1)
    expect(num).toMatch(/^ZKW\/\d{4}-\d{2}\/0001$/)
  })

  it('pads sequence to 4 digits', () => {
    expect(generateInvoiceNumber(1)).toContain('0001')
    expect(generateInvoiceNumber(42)).toContain('0042')
    expect(generateInvoiceNumber(999)).toContain('0999')
  })

  it('uses correct financial year', () => {
    const now   = new Date()
    const month = now.getMonth() + 1
    const num   = generateInvoiceNumber(1)
    if (month >= 4) {
      expect(num).toContain(`${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`)
    } else {
      expect(num).toContain(`${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`)
    }
  })
})
