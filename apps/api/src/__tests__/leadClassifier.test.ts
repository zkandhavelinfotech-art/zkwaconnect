import { describe, it, expect } from 'vitest'
import { classifyLead } from '../services/leadClassifier'

describe('classifyLead', () => {
  it('classifies job enquiry', () => {
    expect(classifyLead('Hi I am interested in the job vacancy')).toBe('JOB_ENQUIRY')
    expect(classifyLead('please share resume and salary details')).toBe('JOB_ENQUIRY')
    expect(classifyLead('is there any career opportunity')).toBe('JOB_ENQUIRY')
  })

  it('classifies service request', () => {
    expect(classifyLead('My AC is not working please send technician')).toBe('SERVICE_REQUEST')
    expect(classifyLead('need urgent repair')).toBe('SERVICE_REQUEST')
    expect(classifyLead('plumber needed today')).toBe('SERVICE_REQUEST')
  })

  it('classifies product enquiry', () => {
    expect(classifyLead('What is the price of this item?')).toBe('PRODUCT_ENQUIRY')
    expect(classifyLead('is it available in stock?')).toBe('PRODUCT_ENQUIRY')
    expect(classifyLead('how much does it cost to buy')).toBe('PRODUCT_ENQUIRY')
  })

  it('classifies billing', () => {
    expect(classifyLead('I need invoice for last payment')).toBe('BILLING')
    expect(classifyLead('did not receive receipt for subscription')).toBe('BILLING')
    expect(classifyLead('my wallet balance is wrong')).toBe('BILLING')
  })

  it('classifies support', () => {
    expect(classifyLead('app is not loading, getting error')).toBe('SUPPORT')
    expect(classifyLead('there is a bug in the system')).toBe('SUPPORT')
    expect(classifyLead('help me please app crashed')).toBe('SUPPORT')
  })

  it('defaults to GENERAL for short messages', () => {
    expect(classifyLead('Hello')).toBe('GENERAL')
    expect(classifyLead('Hi')).toBe('GENERAL')
    expect(classifyLead('')).toBe('GENERAL')
  })

  it('handles undefined/null', () => {
    expect(classifyLead(null as any)).toBe('GENERAL')
    expect(classifyLead(undefined as any)).toBe('GENERAL')
  })
})
