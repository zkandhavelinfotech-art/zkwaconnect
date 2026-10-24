"use client"
import { useEffect, useState } from "react"
import { LogoLockup } from "@/components/Logo"

export type PublicBrand = { name: string; logoUrl: string | null; primaryColor: string | null; hidePoweredBy: boolean } | null

// The partner's brand on its own web address (sign-in, sign-up, password pages); null on the main address.
export function useBrand() {
  const [brand, setBrand] = useState<PublicBrand>(null)
  useEffect(() => { fetch("/api/public/brand").then(response => response.ok ? response.json() : null).then(body => setBrand(body?.brand || null)).catch(() => null) }, [])
  return brand
}

// Logo block for the green auth pages: the partner's logo/name, or ZKWAConnect's.
export function BrandMark({ brand, size = 40 }: { brand: PublicBrand; size?: number }) {
  if (!brand) return <LogoLockup size={size} />
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#fff" }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {brand.logoUrl && <img src={brand.logoUrl} alt="" height={size} style={{ borderRadius: 8, background: "#fff", maxWidth: 160, objectFit: "contain" }} />}
    <strong style={{ fontFamily: "Sora,sans-serif", fontSize: size * .5 }}>{brand.name}</strong>
  </span>
}

export const brandBackground = (brand: PublicBrand) => brand?.primaryColor
  ? `linear-gradient(135deg,${brand.primaryColor} 0%,${brand.primaryColor}cc 50%,${brand.primaryColor} 100%)`
  : "linear-gradient(135deg,#075E54 0%,#128C7E 45%,#075E54 100%)"
