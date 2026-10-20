import { NextResponse }  from "next/server"
import { PaymentStatus } from "@/generated/prisma/client"
import { prisma }        from "@/lib/db/prisma"
import { getSession }    from "@/lib/auth/session"
import { activatePaidSubscription } from "@/lib/billing/activate"

async function assertFinance() {
  const s = await getSession()
  if (!s?.user || !["SUPER_ADMIN","ADMIN","FINANCE"].includes(s.user.adminRole))
    throw new Error("Finance admin access required")
  return s.user
}

export async function GET(req: Request) {
  try {
    await assertFinance()
    const raw = new URL(req.url).searchParams.get("status") || "PENDING"
    const where = raw === "ALL" ? {} : { status: raw as PaymentStatus }
    const payments = await prisma.payment.findMany({
      where,
      include: {
        organization: { select: { name:true, slug:true, legalName:true, gstin:true } },
        invoice: { select: { invoiceNumber:true, status:true, total:true } },
        subscription: { include: { plan: { select: { name:true, slug:true } } } },
      },
      orderBy: { createdAt: "desc" }, take: 100,
    })
    return NextResponse.json({ payments })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await assertFinance()
    const { id, action, reason } = await req.json() as { id:string; action:string; reason?:string }
    if (!id || !["approve", "reject"].includes(action))
      return NextResponse.json({ error: "Invalid payment action." }, { status: 400 })
    const payment = await prisma.payment.findUnique({ where: { id } })
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (payment.status !== "PENDING")
      return NextResponse.json({ error: "Only pending payments can be reviewed." }, { status: 409 })

    const updated = await prisma.$transaction(async tx => {
      const now = new Date()
      const reviewed = await tx.payment.update({
        where: { id },
        data: action === "approve"
          ? { status: "APPROVED", verifiedAt: now, verifiedBy: admin.id }
          : { status: "REJECTED", verifiedAt: now, verifiedBy: admin.id,
              rejectionReason: reason?.trim().slice(0, 500) || "Payment could not be verified" },
      })

      if (action === "approve") await activatePaidSubscription(tx, payment, now)

      await tx.notification.create({ data: {
        organizationId: payment.organizationId,
        type: action === "approve" ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
        title: action === "approve" ? "Payment approved" : "Payment rejected",
        message: action === "approve"
          ? `Your payment of ₹${payment.amount} has been approved. Your plan is now active.`
          : `Your payment of ₹${payment.amount} was rejected. ${reason?.trim() || "Please contact support."}`,
      } })
      return reviewed
    })
    return NextResponse.json({ payment: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
