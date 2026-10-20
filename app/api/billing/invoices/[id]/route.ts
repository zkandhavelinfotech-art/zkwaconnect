import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"
import { renderInvoicePdf } from "@/lib/billing/invoices"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const membership = session?.user.memberships.find(item => item.status === "ACTIVE")
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: membership.organizationId },
      include: { subscription: { include: { plan: { select: { name: true } } } },
        payments: { where: { status: "APPROVED" }, select: { method: true, transactionId: true, verifiedAt: true }, orderBy: { verifiedAt: "desc" }, take: 1 } },
    })
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 })

    const pdf = await renderInvoicePdf(invoice)
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not render invoice." }, { status: 500 })
  }
}