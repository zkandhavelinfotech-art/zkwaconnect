// Shared TypeScript types for ZKWAConnect

export type Plan        = 'STARTER' | 'GROWTH' | 'ENTERPRISE'
export type PlanStatus  = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'
export type UserRole    = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER'
export type LeadCategory= 'JOB_ENQUIRY' | 'SERVICE_REQUEST' | 'BILLING' | 'SUPPORT' | 'PRODUCT_ENQUIRY' | 'GENERAL'
export type LeadStage   = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
export type InvoiceType = 'SUBSCRIPTION' | 'WALLET_TOPUP' | 'USAGE'
export type MsgDirection= 'INBOUND' | 'OUTBOUND'
export type MsgStatus   = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

export interface Tenant {
  id: string; name: string; slug: string
  plan: Plan; planStatus: PlanStatus
  gstin?: string; state?: string
  walletBalance: number; messagesSent: number; messagesLimit: number
  trialEndsAt?: string; createdAt: string
}

export interface User {
  id: string; tenantId: string
  email: string; name: string; role: UserRole
  phone?: string; avatarUrl?: string; isActive: boolean
  lastLoginAt?: string; createdAt: string
}

export interface Lead {
  id: string; tenantId: string; contactId?: string
  name?: string; phone: string; email?: string
  category: LeadCategory; source: string; stage: LeadStage; priority: string
  message?: string; notes?: string; agentId?: string
  smsSent: boolean; autoReplySent: boolean
  value?: number; closedAt?: string; createdAt: string
}

export interface Contact {
  id: string; tenantId: string
  phone: string; name?: string; email?: string
  labels: string[]; optedIn: boolean; source?: string; createdAt: string
}

export interface Invoice {
  id: string; tenantId: string; invoiceNumber: string
  type: InvoiceType; plan?: Plan
  subtotal: number; cgst: number; sgst: number; igst: number; total: number
  ourGstin: string; hsnCode: string
  razorpayPaymentId?: string; status: string
  paidAt?: string; createdAt: string
}

export const PLAN_LIMITS: Record<Plan, { messages: number; contacts: number; price: number }> = {
  STARTER:    { messages: 1000,   contacts: 500,   price: 2499 },
  GROWTH:     { messages: 10000,  contacts: 10000, price: 5999 },
  ENTERPRISE: { messages: 100000, contacts: 999999, price: 0 },
}
