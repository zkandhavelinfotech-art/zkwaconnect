import { NextResponse } from "next/server"
import { z }             from "zod"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"

const schema = z.object({
  invoiceId:      z.string().min(1),
  method:         z.enum(["UPI","QR"]).default("UPI"),
  upiId:          z.string().optional(),
  transactionId:  z.string().trim().min(4).max(120),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    const m = session?.user.memberships.find(m => m.status === "ACTIVE")
    if (!m) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = schema.parse(await req.json())
    const invoice = await prisma.invoice.findFirst({
      where: { id: body.invoiceId, organizationId: m.organizationId, status: "DUE" },
    })
    if (!invoice) return NextResponse.json({ error: "Due invoice not found for this workspace." }, { status: 404 })
    const existing = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id, status: { in: ["PENDING", "APPROVED"] } },
    })
    if (existing) return NextResponse.json({ error: "This invoice already has a payment under review." }, { status: 409 })

    const payment = await prisma.payment.create({
      data: {
        organizationId: m.organizationId,
        subscriptionId: invoice.subscriptionId,
        invoiceId:      invoice.id,
        amount:         invoice.total,
        method:         body.method,
        upiId:          body.upiId,
        transactionId:  body.transactionId,
        status:         "PENDING",
        submittedAt:    new Date(),
      },
    })
    return NextResponse.json({
      payment,
      message: "Payment submitted. Admin will approve within 24 hours.",
    }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
