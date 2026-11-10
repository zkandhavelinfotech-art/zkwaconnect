import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSession } from "@/lib/auth/session"

async function requireAdmin() {
  const session = await getSession()
  if (!session?.user || !["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(session.user.adminRole)) {
    throw Object.assign(new Error("Admin access required."), { status: 403 })
  }
  return session.user
}

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const interval = (searchParams.get("interval") || "monthly").toLowerCase()

    const now = new Date()
    let startDate: Date
    if (interval === "yearly") {
      startDate = new Date(now.getTime() - 365 * 86_400_000)
    } else if (interval === "quarterly") {
      startDate = new Date(now.getTime() - 90 * 86_400_000)
    } else if (interval === "all") {
      startDate = new Date(0)
    } else {
      // default: monthly (last 30 days)
      startDate = new Date(now.getTime() - 30 * 86_400_000)
    }

    // 1. Fetch all organizations
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        walletBalance: true,
        currency: true,
        subscriptions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            status: true,
            billingInterval: true,
            plan: { select: { name: true, slug: true, monthlyPrice: true, annualPrice: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // 2. Fetch paid invoices within date range
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: startDate },
      },
      select: {
        organizationId: true,
        kind: true,
        amount: true,
        tax: true,
        total: true,
        description: true,
      },
    })

    // 3. Fetch message wallet debits within date range
    const messageDebits = await prisma.walletTransaction.findMany({
      where: {
        type: { in: ["DEBIT", "REFUND"] },
        createdAt: { gte: startDate },
      },
      select: {
        organizationId: true,
        type: true,
        amount: true,
        category: true,
        mode: true,
        metaCost: true,
      },
    })

    // Calculate per-client metrics
    const clientDataMap: Record<string, {
      subRevenue: number
      flowAddonRevenue: number
      clientMessageBilled: number
      metaBaseCost: number
      messageCommissionProfit: number
      marketingCount: number
      utilityCount: number
      authCount: number
      serviceCount: number
    }> = {}

    for (const org of orgs) {
      clientDataMap[org.id] = {
        subRevenue: 0,
        flowAddonRevenue: 0,
        clientMessageBilled: 0,
        metaBaseCost: 0,
        messageCommissionProfit: 0,
        marketingCount: 0,
        utilityCount: 0,
        authCount: 0,
        serviceCount: 0,
      }
    }

    // Process invoices
    for (const inv of paidInvoices) {
      if (!clientDataMap[inv.organizationId]) continue
      const amount = Number(inv.amount || inv.total || 0)
      const desc = (inv.description || "").toLowerCase()
      if (inv.kind === "FLOW_BUILDER_ADDON" || desc.includes("flow") || desc.includes("chatbot")) {
        clientDataMap[inv.organizationId].flowAddonRevenue += amount
      } else {
        clientDataMap[inv.organizationId].subRevenue += amount
      }
    }

    // Process message transactions
    for (const tx of messageDebits) {
      if (!clientDataMap[tx.organizationId]) continue
      const isRefund = tx.type === "REFUND"
      const multiplier = isRefund ? -1 : 1
      const clientCharged = multiplier * Math.abs(Number(tx.amount || 0))
      const metaCost = multiplier * Number(tx.metaCost || 0)
      const profit = clientCharged - metaCost

      const client = clientDataMap[tx.organizationId]
      client.clientMessageBilled += clientCharged
      client.metaBaseCost += metaCost
      client.messageCommissionProfit += profit

      const cat = (tx.category || "MARKETING").toUpperCase()
      if (cat === "MARKETING") client.marketingCount += multiplier
      else if (cat === "UTILITY") client.utilityCount += multiplier
      else if (cat === "AUTHENTICATION") client.authCount += multiplier
      else client.serviceCount += multiplier
    }

    // Prepare client list
    const clients = orgs.map(org => {
      const metrics = clientDataMap[org.id]
      const sub = org.subscriptions[0]
      const planName = sub?.plan?.name || "Free"
      const billingInterval = sub?.billingInterval || "MONTHLY"
      const totalClientRevenue = metrics.subRevenue + metrics.flowAddonRevenue + metrics.clientMessageBilled
      const totalClientProfit = metrics.subRevenue + metrics.flowAddonRevenue + metrics.messageCommissionProfit
      const margin = totalClientRevenue > 0 ? Math.round((totalClientProfit / totalClientRevenue) * 100) : 100

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        walletBalance: Number(org.walletBalance),
        planName,
        billingInterval,
        subRevenue: Math.round(metrics.subRevenue * 100) / 100,
        flowAddonRevenue: Math.round(metrics.flowAddonRevenue * 100) / 100,
        clientMessageBilled: Math.round(metrics.clientMessageBilled * 100) / 100,
        metaBaseCost: Math.round(metrics.metaBaseCost * 100) / 100,
        messageCommissionProfit: Math.round(metrics.messageCommissionProfit * 100) / 100,
        totalClientProfit: Math.round(totalClientProfit * 100) / 100,
        marginPercent: margin,
        messages: {
          marketing: Math.max(0, metrics.marketingCount),
          utility: Math.max(0, metrics.utilityCount),
          auth: Math.max(0, metrics.authCount),
          total: Math.max(0, metrics.marketingCount + metrics.utilityCount + metrics.authCount),
        },
      }
    })

    // Platform totals
    const totalSubRevenue = clients.reduce((acc, c) => acc + c.subRevenue, 0)
    const totalFlowRevenue = clients.reduce((acc, c) => acc + c.flowAddonRevenue, 0)
    const totalMessageBilled = clients.reduce((acc, c) => acc + c.clientMessageBilled, 0)
    const totalMetaPaid = clients.reduce((acc, c) => acc + c.metaBaseCost, 0)
    const totalMessageCommission = clients.reduce((acc, c) => acc + c.messageCommissionProfit, 0)
    const totalNetProfit = Math.round((totalSubRevenue + totalFlowRevenue + totalMessageCommission) * 100) / 100
    const totalGrossRevenue = Math.round((totalSubRevenue + totalFlowRevenue + totalMessageBilled) * 100) / 100
    const overallMargin = totalGrossRevenue > 0 ? Math.round((totalNetProfit / totalGrossRevenue) * 100) : 100

    return NextResponse.json({
      interval,
      currency: "INR",
      startDate: startDate.toISOString(),
      summary: {
        totalNetProfit,
        totalGrossRevenue,
        totalSubRevenue: Math.round(totalSubRevenue * 100) / 100,
        totalFlowRevenue: Math.round(totalFlowRevenue * 100) / 100,
        totalMessageBilled: Math.round(totalMessageBilled * 100) / 100,
        totalMetaPaid: Math.round(totalMetaPaid * 100) / 100,
        totalMessageCommission: Math.round(totalMessageCommission * 100) / 100,
        overallMargin,
        totalMessagesSent: clients.reduce((acc, c) => acc + c.messages.total, 0),
      },
      clients: clients.sort((a, b) => b.totalClientProfit - a.totalClientProfit),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate profit analytics." },
      { status: (error as { status?: number }).status || 500 }
    )
  }
}

