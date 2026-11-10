import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { decryptMetaToken } from "@/lib/meta/token"
import { metaGraph } from "@/lib/meta/graph"
import dns from "node:dns/promises"

export const runtime = "nodejs"

type BusinessDetail = {
  id: string
  name: string
  legal_name?: string
  verification_status?: string
  two_factor_type?: string
  primary_page?: { id: string; name: string }
  created_time?: string
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    }

    const membership = session.user.memberships[0]
    const organizationId = membership?.organizationId
    if (!organizationId) {
      return NextResponse.json({ error: "No organization found." }, { status: 400 })
    }

    const connection = await prisma.metaConnection.findFirst({
      where: { organizationId, status: "CONNECTED", accessTokenEncrypted: { not: null } },
      orderBy: { updatedAt: "desc" },
    })

    const token = connection?.accessTokenEncrypted
      ? (() => {
          try { return decryptMetaToken(connection.accessTokenEncrypted!) } catch { return null }
        })()
      : null

    if (!token) {
      return NextResponse.json({
        connected: false,
        businesses: [],
        message: "No active Meta Facebook connection. Please connect Facebook first.",
      })
    }

    // 1. Fetch businesses with deep fields
    let businesses: BusinessDetail[] = []
    try {
      const bizRes = await metaGraph<{ data: BusinessDetail[] }>(
        "me/businesses?fields=id,name,legal_name,verification_status,two_factor_type,primary_page,created_time&limit=20",
        token
      ).catch(() =>
        metaGraph<{ data: BusinessDetail[] }>("me/businesses?fields=id,name,verification_status&limit=20", token)
      )
      businesses = bizRes.data || []
    } catch (err) {
      return NextResponse.json({
        connected: true,
        businesses: [],
        error: err instanceof Error ? err.message : "Failed to fetch businesses from Meta.",
      })
    }

    // 2. Format details with auto-verification readiness & fetch owned domains
    const results = await Promise.all(
      businesses.map(async b => {
        const isVerified = b.verification_status === "verified"
        const inReview = b.verification_status === "in_review"
        const twoFactorEnforced = b.two_factor_type === "everyone"

        // Fetch domains owned by this business in Meta
        let ownedDomains: { id: string; name: string; status?: string }[] = []
        try {
          const domRes = await metaGraph<{ data: { id: string; name: string; status?: string }[] }>(
            `${b.id}/owned_domains?fields=id,name,status`,
            token
          ).catch(() => ({ data: [] }))
          ownedDomains = domRes.data || []
        } catch {
          ownedDomains = []
        }

        return {
          id: b.id,
          name: b.name,
          legalName: b.legal_name || null,
          verificationStatus: b.verification_status || "not_verified",
          isVerified,
          inReview,
          twoFactorType: b.two_factor_type || "unknown",
          twoFactorEnforced,
          primaryPage: b.primary_page || null,
          ownedDomains,
          securityCentreUrl: `https://business.facebook.com/settings/security?business_id=${b.id}`,
          businessInfoUrl: `https://business.facebook.com/settings/info?business_id=${b.id}`,
          domainsUrl: `https://business.facebook.com/settings/owned-domains?business_id=${b.id}`,
          whatsappAccountsUrl: `https://business.facebook.com/settings/whatsapp-business-accounts?business_id=${b.id}`,
        }
      })
    )

    return NextResponse.json({
      connected: true,
      count: results.length,
      businesses: results,
      appId: process.env.META_APP_ID || null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load business verification status." },
      { status: 500 }
    )
  }
}

function detectDnsProvider(nsList: string[]) {
  const nsLower = nsList.join(" ").toLowerCase()
  if (nsLower.includes("cloudflare")) return { name: "Cloudflare", link: "https://dash.cloudflare.com/", isCloudflare: true }
  if (nsLower.includes("domaincontrol") || nsLower.includes("godaddy")) return { name: "GoDaddy", link: "https://dcc.godaddy.com/manage/dns", isCloudflare: false }
  if (nsLower.includes("hostinger") || nsLower.includes("dns-parking")) return { name: "Hostinger", link: "https://hpanel.hostinger.com/", isCloudflare: false }
  if (nsLower.includes("namecheap") || nsLower.includes("registrar-servers")) return { name: "Namecheap", link: "https://ap.www.namecheap.com/domains/domaincontrolpanel", isCloudflare: false }
  if (nsLower.includes("awsdns")) return { name: "AWS Route 53", link: "https://console.aws.amazon.com/route53/", isCloudflare: false }
  return { name: nsList[0] ? `DNS (${nsList[0]})` : "Standard DNS Provider", link: null, isCloudflare: false }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    }

    const body = await request.json()
    const { action, domain } = body

    if (action === "check_domain_dns") {
      if (!domain || typeof domain !== "string") {
        return NextResponse.json({ error: "Domain name is required." }, { status: 400 })
      }

      const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase()
      const parts = cleanDomain.split(".")
      const rootDomain = parts.length > 2 ? parts.slice(-2).join(".") : cleanDomain

      const errors: string[] = []
      let foundTxt: string | null = null
      let matchedOn: string = cleanDomain
      let nameServers: string[] = []

      // Detect Name Servers (NS) to identify provider
      try {
        nameServers = await dns.resolveNs(rootDomain)
      } catch {
        try {
          nameServers = await dns.resolveNs(cleanDomain)
        } catch {
          nameServers = []
        }
      }

      const provider = detectDnsProvider(nameServers)

      // 1. Check the exact entered domain
      try {
        const records = await dns.resolveTxt(cleanDomain)
        const flatRecords = records.map(r => r.join(""))
        const match = flatRecords.find(r => r.startsWith("facebook-domain-verification="))
        if (match) {
          foundTxt = match
          matchedOn = cleanDomain
        }
      } catch (err) {
        errors.push(`${cleanDomain}: ${err instanceof Error ? err.message : "error"}`)
      }

      // 2. If not found and it's a subdomain, check the root apex domain (e.g. recruitmenttrainingacademy.com)
      if (!foundTxt && rootDomain !== cleanDomain) {
        try {
          const rootRecords = await dns.resolveTxt(rootDomain)
          const flatRoot = rootRecords.map(r => r.join(""))
          const rootMatch = flatRoot.find(r => r.startsWith("facebook-domain-verification="))
          if (rootMatch) {
            foundTxt = rootMatch
            matchedOn = rootDomain
          }
        } catch (err) {
          errors.push(`${rootDomain}: ${err instanceof Error ? err.message : "error"}`)
        }
      }

      if (foundTxt) {
        const verificationCode = foundTxt.replace("facebook-domain-verification=", "").trim()
        const isSubdomainMatch = matchedOn !== cleanDomain
        return NextResponse.json({
          ok: true,
          domain: cleanDomain,
          matchedOn,
          rootDomain,
          verified: true,
          verificationCode,
          provider,
          nameServers,
          message: isSubdomainMatch
            ? `✓ Found valid Meta TXT verification record on root domain: ${rootDomain}! Meta verifies at the root domain level, which automatically covers "${cleanDomain}".`
            : `✓ Found valid Facebook domain verification TXT record on ${cleanDomain}: ${foundTxt}`,
        })
      }

      return NextResponse.json({
        ok: true,
        domain: cleanDomain,
        rootDomain,
        verified: false,
        provider,
        nameServers,
        message:
          cleanDomain !== rootDomain
            ? `✕ No "facebook-domain-verification=..." TXT record found on "${cleanDomain}" or its root domain "${rootDomain}". Add the TXT record in ${provider.name} on host "@" (root domain) and re-check.`
            : `✕ No "facebook-domain-verification=..." TXT record found on ${cleanDomain}. Add the TXT record in ${provider.name} and re-check.`,
        errors,
      })
    }

    // Automated 1-Click Cloudflare DNS Deploy
    if (action === "add_cloudflare_dns") {
      const { apiToken, zoneId: rawZoneId, verificationCode, targetDomain } = body
      if (!apiToken || !verificationCode || !targetDomain) {
        return NextResponse.json({ error: "Cloudflare API Token, Verification Code, and Domain are required." }, { status: 400 })
      }

      const cleanDomain = targetDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase()
      const parts = cleanDomain.split(".")
      const rootDomain = parts.length > 2 ? parts.slice(-2).join(".") : cleanDomain

      let zoneId = rawZoneId
      // Auto-discover Zone ID if not provided
      if (!zoneId) {
        const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
          headers: { Authorization: `Bearer ${apiToken.trim()}` },
        }).then(r => r.json()).catch(() => ({}))

        if (zoneRes?.result?.[0]?.id) {
          zoneId = zoneRes.result[0].id
        } else {
          return NextResponse.json({
            error: `Could not find Cloudflare zone for "${rootDomain}". Verify your API token has Zone:DNS:Edit permissions.`,
          }, { status: 400 })
        }
      }

      // Add the TXT record
      const cfTxt = verificationCode.startsWith("facebook-domain-verification=")
        ? verificationCode
        : `facebook-domain-verification=${verificationCode.trim()}`

      const createRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "TXT",
          name: "@",
          content: cfTxt,
          ttl: 120,
        }),
      }).then(r => r.json()).catch(err => ({ success: false, errors: [{ message: err.message }] }))

      if (!createRes.success) {
        return NextResponse.json({
          error: createRes.errors?.[0]?.message || "Cloudflare rejected DNS record creation.",
        }, { status: 400 })
      }

      return NextResponse.json({
        ok: true,
        message: `✓ TXT record automatically deployed to Cloudflare DNS for ${rootDomain}! It will propagate globally in 60 seconds.`,
      })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification check failed." },
      { status: 500 }
    )
  }
}

