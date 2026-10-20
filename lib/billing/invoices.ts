import crypto from "node:crypto"
import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import { Prisma } from "@/generated/prisma/client"
import type { Organization, Invoice } from "@/generated/prisma/client"

type BillingOrganization = Pick<Organization,
  "id" | "legalName" | "name" | "gstin" | "billingAddress" | "billingCity" |
  "billingPostalCode" | "billingStateCode" | "state">

function money(value: number) {
  return Number(value.toFixed(2))
}

function gstRate() {
  const value = Number(process.env.GST_RATE || 18)
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 18
}

export async function createGstInvoice(
  tx: Prisma.TransactionClient,
  organization: BillingOrganization,
  subscriptionId: string | null,
  amount: number,
  description?: string,
  kind: "SUBSCRIPTION" | "WALLET_TOPUP" = "SUBSCRIPTION",
) {
  const sellerName = process.env.COMPANY_NAME || "ZKandhavel Infotech Pvt. Ltd."
  const sellerGstin = process.env.SELLER_GSTIN || process.env.GSTIN || null
  const buyerGstin = organization.gstin?.trim().toUpperCase() || null
  const sellerStateCode = sellerGstin?.slice(0, 2)
  const buyerStateCode = buyerGstin?.slice(0, 2) || organization.billingStateCode || undefined
  const rate = gstRate()
  const taxable = money(amount)
  const tax = money(taxable * rate / 100)
  const intraState = Boolean(sellerStateCode && buyerStateCode && sellerStateCode === buyerStateCode)
  const cgst = intraState ? money(tax / 2) : 0
  const sgst = intraState ? money(tax - cgst) : 0
  const igst = intraState ? 0 : tax
  const buyerAddress = [organization.billingAddress, organization.billingCity,
    organization.state, organization.billingPostalCode].filter(Boolean).join(", ") || null
  const now = new Date()
  const invoiceNumber = `ZKWA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`

  return tx.invoice.create({
    data: {
      organizationId: organization.id,
      subscriptionId,
      invoiceNumber,
      kind,
      description: description || null,
      amount: taxable,
      tax,
      total: money(taxable + tax),
      currency: "INR",
      status: "DUE",
      gstin: buyerGstin,
      hsnCode: process.env.HSN_CODE || "998314",
      sellerName,
      sellerGstin,
      buyerName: organization.legalName?.trim() || organization.name,
      buyerAddress,
      placeOfSupply: organization.state || "India",
      gstRate: rate,
      cgst,
      sgst,
      igst,
      dueAt: new Date(Date.now() + 7 * 86_400_000),
    },
  })
}

type InvoiceForPdf = Pick<Invoice,
  "invoiceNumber" | "amount" | "tax" | "total" | "currency" | "status" | "gstin" | "hsnCode" |
  "sellerName" | "sellerGstin" | "buyerName" | "buyerAddress" | "placeOfSupply" | "gstRate" | "cgst" | "sgst" | "igst" | "issuedAt"
  | "description" | "dueAt" | "paidAt">
  & { subscription: { plan: { name: string }; currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null } | null
      payments?: { method: string; transactionId: string | null; verifiedAt: Date | null }[] }

// UPI deep link for an invoice (same as the QR on the billing page).
export function invoiceUpiLink(invoice: { invoiceNumber: string; total: Prisma.Decimal | number }) {
  const upiId = process.env.UPI_ID
  if (!upiId) return null
  return `upi://pay?${new URLSearchParams({ pa: upiId, pn: process.env.COMPANY_NAME || "ZKandhavel Infotech Pvt. Ltd.",
    am: Number(invoice.total).toFixed(2), cu: "INR", tn: `Invoice ${invoice.invoiceNumber}` })}`
}

export async function renderInvoicePdf(invoice: InvoiceForPdf) {
  const upiLink = invoice.status === "DUE" ? invoiceUpiLink(invoice) : null
  const qr = upiLink ? await QRCode.toBuffer(upiLink, { width: 240, margin: 1 }) : null
  const paid = invoice.payments?.[0]
  const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48 })
    const chunks: Buffer[] = []
    document.on("data", chunk => chunks.push(Buffer.from(chunk)))
    document.on("end", () => resolve(Buffer.concat(chunks)))
    document.on("error", reject)

    const formatCurrency = (value: number | Prisma.Decimal) =>
      `INR ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const line = (label: string, value: string, y: number) => {
      document.font("Helvetica").fontSize(10).fillColor("#40534f").text(label, 50, y)
      document.font("Helvetica-Bold").fillColor("#172b27").text(value, 340, y, { width: 200, align: "right" })
    }

    document.font("Helvetica-Bold").fontSize(21).fillColor("#075e54").text(invoice.sellerName || "ZKWAConnect")
    if (process.env.COMPANY_ADDRESS) document.font("Helvetica").fontSize(9).fillColor("#63716e").text(process.env.COMPANY_ADDRESS)
    document.moveDown(1.2)
    document.font("Helvetica-Bold").fontSize(16).fillColor("#172b27").text("TAX INVOICE")
    document.font("Helvetica").fontSize(10).fillColor("#40534f").text(`Invoice: ${invoice.invoiceNumber}`)
    document.text(`Issued: ${invoice.issuedAt.toLocaleDateString("en-IN")}`)
    document.text(`Status: ${invoice.status}`)
    if (invoice.status === "DUE" && invoice.dueAt) document.text(`Due by: ${date(invoice.dueAt)}`)
    if (invoice.sellerGstin) document.text(`Supplier GSTIN: ${invoice.sellerGstin}`)

    document.moveDown()
    document.font("Helvetica-Bold").fontSize(11).fillColor("#172b27").text("Bill to")
    document.font("Helvetica").fontSize(10).fillColor("#40534f").text(invoice.buyerName || "Customer")
    if (invoice.buyerAddress) document.text(invoice.buyerAddress)
    if (invoice.gstin) document.text(`GSTIN: ${invoice.gstin}`)
    if (invoice.placeOfSupply) document.text(`Place of supply: ${invoice.placeOfSupply}`)

    const tableTop = 300
    document.rect(48, tableTop, 500, 25).fill("#eaf2f0")
    document.font("Helvetica-Bold").fontSize(9).fillColor("#24443e")
      .text("Description", 58, tableTop + 8)
      .text("HSN/SAC", 300, tableTop + 8)
      .text("Taxable value", 390, tableTop + 8, { width: 145, align: "right" })
    document.font("Helvetica").fontSize(10).fillColor("#172b27")
      .text(invoice.description || `ZKWAConnect ${invoice.subscription?.plan.name || "subscription"}`, 58, tableTop + 39, { width: 230 })
      .text(invoice.hsnCode || "-", 300, tableTop + 39)
      .text(formatCurrency(invoice.amount), 390, tableTop + 39, { width: 145, align: "right" })

    let y = tableTop + 82
    line(`GST (${Number(invoice.gstRate)}%)`, formatCurrency(invoice.tax), y)
    y += 20
    if (Number(invoice.cgst) > 0) {
      line("CGST", formatCurrency(invoice.cgst), y); y += 18
      line("SGST", formatCurrency(invoice.sgst), y); y += 18
    }
    if (Number(invoice.igst) > 0) {
      line("IGST", formatCurrency(invoice.igst), y); y += 18
    }
    document.moveTo(340, y + 4).lineTo(540, y + 4).strokeColor("#cad7d4").stroke()
    line(invoice.status === "PAID" ? "Total paid" : "Total payable", formatCurrency(invoice.total), y + 15)

    if (invoice.status === "PAID") {
      document.save().rotate(-12, { origin: [470, 150] }).roundedRect(405, 125, 130, 44, 6).lineWidth(2.5).strokeColor("#168253").stroke()
        .font("Helvetica-Bold").fontSize(24).fillColor("#168253").text("PAID", 405, 135, { width: 130, align: "center" }).restore()
      let py = y + 60
      document.font("Helvetica-Bold").fontSize(11).fillColor("#172b27").text("Payment received", 50, py); py += 17
      document.font("Helvetica").fontSize(10).fillColor("#40534f")
      if (invoice.paidAt) { document.text(`Paid on: ${date(invoice.paidAt)}`, 50, py); py += 15 }
      if (paid) { document.text(`Method: ${paid.method}${paid.transactionId ? `   Reference / UTR: ${paid.transactionId}` : ""}`, 50, py); py += 15 }
      const period = invoice.subscription
      if (period?.currentPeriodStart && period.currentPeriodEnd)
        document.text(`Service period: ${date(period.currentPeriodStart)} – ${date(period.currentPeriodEnd)}`, 50, py)
    } else if (invoice.status === "CANCELLED") {
      document.font("Helvetica-Bold").fontSize(12).fillColor("#9f2d22").text("This invoice was cancelled and is not payable.", 50, y + 60)
    } else if (qr) {
      const qy = y + 55
      document.image(qr, 50, qy, { width: 110 })
      document.font("Helvetica-Bold").fontSize(11).fillColor("#172b27").text("Scan to pay with any UPI app", 175, qy + 10)
      document.font("Helvetica").fontSize(10).fillColor("#40534f")
        .text(`UPI ID: ${process.env.UPI_ID}`, 175, qy + 30)
        .text(`Amount: ${formatCurrency(invoice.total)}   Note: Invoice ${invoice.invoiceNumber}`, 175, qy + 46)
        .text("After paying, enter the UPI reference (UTR) under Billing > Pay with UPI in ZKWAConnect.", 175, qy + 62, { width: 360 })
    }
    document.font("Helvetica").fontSize(8).fillColor("#71817e")
      .text(`Currency: ${invoice.currency}   |   HSN/SAC: ${invoice.hsnCode || "-"}`, 50, 740)
    document.end()
  })
}