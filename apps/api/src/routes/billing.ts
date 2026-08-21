import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { calculateGST, generateInvoiceNumber, OUR_GSTIN, HSN_CODE } from '../services/billing'
import { createHmac } from 'crypto'
import Razorpay from 'razorpay'

function getRzp() {
  const key    = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!key || !secret) throw new Error('Razorpay credentials not configured')
  return new Razorpay({ key_id: key, key_secret: secret })
}

const PLAN_PRICES: Record<string, number> = { STARTER: 2499, GROWTH: 5999, ENTERPRISE: 0 }

export async function billingRoutes(app: FastifyInstance) {

  // GET /billing — overview + last 5 invoices
  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const tenant   = await prisma.tenant.findUnique({ where: { id: req.user.tid }, select: { plan:true, planStatus:true, walletBalance:true, messagesSent:true, messagesLimit:true, trialEndsAt:true } })
    const invoices = await prisma.invoice.findMany({ where: { tenantId: req.user.tid }, orderBy: { createdAt: 'desc' }, take: 5 })
    return { success: true, data: { ...tenant, invoices } }
  })

  // GET /billing/invoices — paginated list
  app.get('/invoices', { onRequest: [app.authenticate] }, async (req) => {
    const { page = 1, pageSize = 10 } = req.query as any
    const skip  = (Number(page) - 1) * Number(pageSize)
    const where = { tenantId: req.user.tid }
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({ where, skip, take: Number(pageSize), orderBy: { createdAt: 'desc' } }),
      prisma.invoice.count({ where }),
    ])
    return { success: true, data: { invoices, total, page: Number(page), totalPages: Math.ceil(total / Number(pageSize)) } }
  })

  // GET /billing/invoices/:id/pdf — stream PDF
  app.get('/invoices/:id/pdf', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: req.user.tid }, include: { tenant: { select: { name:true, address:true, city:true, state:true, gstin:true } } } })
    if (!invoice) return reply.status(404).send({ success: false, error: 'Invoice not found' })

    // If already uploaded to S3, redirect
    if (invoice.pdfUrl) {
      return reply.redirect(invoice.pdfUrl)
    }

    // Generate on-the-fly with PDFKit
    const PDFDocument = (await import('pdfkit')).default
    const doc = new PDFDocument({ margin: 50, size: 'A4' })

    reply.raw.setHeader('Content-Type', 'application/pdf')
    reply.raw.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`)
    doc.pipe(reply.raw)

    // ── Header ────────────────────────────────────────────
    doc.fontSize(22).fillColor('#00C853').text('ZKWAConnect', 50, 50)
    doc.fontSize(10).fillColor('#666').text('ZKandhavel Infotech Pvt. Ltd.', 50, 78)
    doc.text(`GSTIN: ${invoice.ourGstin}`, 50, 92)
    doc.text('Chennai, Tamil Nadu — 600001', 50, 106)

    doc.fontSize(18).fillColor('#111').text('TAX INVOICE', 400, 50)
    doc.fontSize(10).fillColor('#666')
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, 400, 78)
    doc.text(`Date: ${new Date(invoice.paidAt || invoice.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })}`, 400, 92)
    doc.text(`Status: ${invoice.status}`, 400, 106)

    doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e2e8f0').stroke()

    // ── Bill to ───────────────────────────────────────────
    doc.fillColor('#111').fontSize(11).text('Bill To', 50, 145)
    doc.fontSize(10).fillColor('#444')
    doc.text(invoice.tenant?.name || 'Customer', 50, 162)
    if (invoice.tenantGstin) doc.text(`GSTIN: ${invoice.tenantGstin}`, 50, 176)
    if (invoice.tenantState) doc.text(`State: ${invoice.tenantState}`, 50, 190)

    // ── Table ─────────────────────────────────────────────
    const tableTop = 230
    doc.fillColor('#f8fafc').rect(50, tableTop, 495, 24).fill()
    doc.fillColor('#444').fontSize(10)
    doc.text('Description',    55, tableTop + 7)
    doc.text('HSN',           300, tableTop + 7)
    doc.text('Period',        340, tableTop + 7)
    doc.text('Amount (₹)',    460, tableTop + 7, { align: 'right', width: 80 })

    doc.moveTo(50, tableTop + 24).lineTo(545, tableTop + 24).strokeColor('#e2e8f0').stroke()

    const rowTop = tableTop + 34
    doc.fillColor('#111').fontSize(10)
    doc.text(`${invoice.plan || 'Service'} Plan — ${invoice.type}`, 55, rowTop)
    doc.text(invoice.hsnCode || '998315',                           300, rowTop)
    doc.text(invoice.periodStart ? new Date(invoice.periodStart).toLocaleDateString('en-IN', { month:'short', year:'numeric' }) : '—', 340, rowTop)
    doc.text(invoice.subtotal.toFixed(2),                           460, rowTop, { align: 'right', width: 80 })

    doc.moveTo(50, rowTop + 20).lineTo(545, rowTop + 20).strokeColor('#e2e8f0').stroke()

    // ── GST breakdown ─────────────────────────────────────
    const gstTop = rowTop + 35
    doc.fillColor('#666').fontSize(10)
    if (invoice.igst > 0) {
      doc.text('IGST @ 18%', 350, gstTop)
      doc.text(invoice.igst.toFixed(2), 460, gstTop, { align: 'right', width: 80 })
    } else {
      doc.text('CGST @ 9%', 350, gstTop)
      doc.text(invoice.cgst.toFixed(2), 460, gstTop, { align: 'right', width: 80 })
      doc.text('SGST @ 9%', 350, gstTop + 18)
      doc.text(invoice.sgst.toFixed(2), 460, gstTop + 18, { align: 'right', width: 80 })
    }

    const totalTop = invoice.igst > 0 ? gstTop + 35 : gstTop + 50
    doc.fillColor('#00C853').rect(350, totalTop, 195, 28).fill()
    doc.fillColor('#fff').fontSize(12).text('TOTAL', 360, totalTop + 8)
    doc.text(`₹ ${invoice.total.toFixed(2)}`, 460, totalTop + 8, { align: 'right', width: 80 })

    // ── Footer ────────────────────────────────────────────
    doc.fillColor('#666').fontSize(9)
    doc.text('This is a computer-generated invoice and does not require a signature.', 50, 720, { align: 'center', width: 495 })
    doc.text('For support: support@zkwaconnect.in | www.zkwaconnect.in', 50, 734, { align: 'center', width: 495 })

    doc.end()
    reply.hijack()
  })

  // POST /billing/subscribe — create Razorpay order
  app.post('/subscribe', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { plan } = req.body as any
    if (!PLAN_PRICES[plan]) return reply.status(400).send({ success: false, error: 'Invalid plan' })
    const tenant   = await prisma.tenant.findUnique({ where: { id: req.user.tid } })
    const subtotal = PLAN_PRICES[plan]
    const gst      = calculateGST(subtotal, tenant?.state)
    const rz       = getRzp()
    const order    = await rz.orders.create({ amount: Math.round(gst.total * 100), currency: 'INR', receipt: `zkwa-${req.user.tid}-${Date.now()}` })
    return { success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency, plan, gst } }
  })

  // POST /billing/verify-payment — verify + activate plan
  app.post('/verify-payment', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body as any
    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return reply.status(500).send({ success: false, error: 'Razorpay not configured' })
    const expected = createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
    if (expected !== razorpay_signature) return reply.status(400).send({ success: false, error: 'Invalid payment signature' })
    const tenant   = await prisma.tenant.findUnique({ where: { id: req.user.tid } })
    const subtotal = PLAN_PRICES[plan] || 0
    const gst      = calculateGST(subtotal, tenant?.state)
    const count    = await prisma.invoice.count({ where: { tenantId: req.user.tid } })
    const num      = generateInvoiceNumber(count + 1)
    const invoice  = await prisma.invoice.create({
      data: { tenantId: req.user.tid, invoiceNumber: num, type: 'SUBSCRIPTION', plan, subtotal: gst.subtotal, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst, total: gst.total, ourGstin: OUR_GSTIN, hsnCode: HSN_CODE, tenantState: tenant?.state, tenantGstin: tenant?.gstin, razorpayPaymentId: razorpay_payment_id, razorpayOrderId: razorpay_order_id, status: 'PAID', paidAt: new Date(), periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000) },
    })
    await prisma.tenant.update({ where: { id: req.user.tid }, data: { plan, planStatus: 'ACTIVE', messagesLimit: plan === 'GROWTH' ? 10000 : 1000 } })
    return { success: true, data: { invoice } }
  })

  // POST /billing/wallet/topup — create order
  app.post('/wallet/topup', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { amount } = req.body as any
    if (!amount || amount < 100) return reply.status(400).send({ success: false, error: 'Minimum topup is ₹100' })
    const rz    = getRzp()
    const order = await rz.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt: `wallet-${req.user.tid}-${Date.now()}` })
    return { success: true, data: { orderId: order.id, amount: order.amount } }
  })

  // POST /billing/wallet/verify — verify + credit wallet
  app.post('/wallet/verify', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body as any
    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return reply.status(500).send({ success: false, error: 'Razorpay not configured' })
    const expected = createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
    if (expected !== razorpay_signature) return reply.status(400).send({ success: false, error: 'Invalid signature' })
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tid } })
    const newBal = (tenant?.walletBalance || 0) + Number(amount)
    await prisma.tenant.update({ where: { id: req.user.tid }, data: { walletBalance: newBal } })
    await prisma.walletTransaction.create({ data: { tenantId: req.user.tid, type: 'CREDIT', amount: Number(amount), balance: newBal, description: 'Wallet topup', reference: razorpay_payment_id } })
    const count = await prisma.invoice.count({ where: { tenantId: req.user.tid } })
    const num   = generateInvoiceNumber(count + 1)
    await prisma.invoice.create({ data: { tenantId: req.user.tid, invoiceNumber: num, type: 'WALLET_TOPUP', subtotal: Number(amount), cgst: 0, sgst: 0, igst: 0, total: Number(amount), ourGstin: OUR_GSTIN, hsnCode: HSN_CODE, razorpayPaymentId: razorpay_payment_id, razorpayOrderId: razorpay_order_id, status: 'PAID', paidAt: new Date() } })
    return { success: true, data: { balance: newBal } }
  })
}
