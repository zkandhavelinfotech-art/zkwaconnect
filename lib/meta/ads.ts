// Builds Meta Marketing API objects for the "Create New Ad" wizard (ODAX objectives).

export type AdType = "WHATSAPP" | "INSTAGRAM_DIRECT" | "WEBSITE" | "LEAD_FORM"

export const AD_TYPES: Record<AdType, {
  label: string; description: string; objective: string; objectiveLabel: string; optimizationGoal: string; goalLabel: string
  destinationType?: string; ctas: { value: string; label: string }[]
}> = {
  WHATSAPP: { label: "Click to WhatsApp Ad", description: "Start a WhatsApp conversation from your ad",
    objective: "OUTCOME_ENGAGEMENT", objectiveLabel: "Engagement", optimizationGoal: "CONVERSATIONS", goalLabel: "Maximise number of conversations",
    destinationType: "WHATSAPP", ctas: [{ value: "WHATSAPP_MESSAGE", label: "Send WhatsApp message" }] },
  INSTAGRAM_DIRECT: { label: "Instagram Direct Ad", description: "Start an Instagram DM conversation from your ad",
    objective: "OUTCOME_ENGAGEMENT", objectiveLabel: "Engagement", optimizationGoal: "CONVERSATIONS", goalLabel: "Maximise number of conversations",
    destinationType: "INSTAGRAM_DIRECT", ctas: [{ value: "INSTAGRAM_MESSAGE", label: "Send message" }] },
  WEBSITE: { label: "Website Ad", description: "Send people to a product or landing page",
    objective: "OUTCOME_TRAFFIC", objectiveLabel: "Traffic", optimizationGoal: "LINK_CLICKS", goalLabel: "Maximise number of link clicks",
    destinationType: "WEBSITE", ctas: [{ value: "LEARN_MORE", label: "Learn more" }, { value: "SHOP_NOW", label: "Shop now" },
      { value: "SIGN_UP", label: "Sign up" }, { value: "BOOK_TRAVEL", label: "Book now" }, { value: "CONTACT_US", label: "Contact us" }] },
  LEAD_FORM: { label: "Lead Form Ad", description: "Capture lead details without leaving Facebook or Instagram",
    objective: "OUTCOME_LEADS", objectiveLabel: "Leads", optimizationGoal: "LEAD_GENERATION", goalLabel: "Maximise number of leads",
    destinationType: "ON_AD", ctas: [{ value: "SIGN_UP", label: "Sign up" }, { value: "APPLY_NOW", label: "Apply now" },
      { value: "LEARN_MORE", label: "Learn more" }, { value: "GET_QUOTE", label: "Get quote" }] },
}

export const SPECIAL_CATEGORIES = ["NONE", "EMPLOYMENT", "HOUSING", "FINANCIAL_PRODUCTS_SERVICES"] as const

export type Location = { key: string; name: string; type: "country" | "region" | "city"; countryCode?: string }
export type Targeting = {
  locations: Location[]; ageMin: number; ageMax: number; gender: "ALL" | "MALE" | "FEMALE"; platforms: ("facebook" | "instagram")[]
  specialCategory: typeof SPECIAL_CATEGORIES[number]
}

// Meta budgets are in the currency's smallest unit; these currencies have no minor unit.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND", "PYG", "ISK"])
export function toMinorUnits(amount: number, currency: string) {
  return Math.round(amount * (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100))
}

export function buildTargeting(targeting: Targeting, adType: AdType) {
  const special = targeting.specialCategory !== "NONE"
  const geo: Record<string, unknown> = {}
  const countries = targeting.locations.filter(item => item.type === "country").map(item => item.key)
  const regions = targeting.locations.filter(item => item.type === "region").map(item => ({ key: item.key }))
  const cities = targeting.locations.filter(item => item.type === "city").map(item => ({ key: item.key, ...(special ? { radius: 25, distance_unit: "kilometer" } : {}) }))
  if (countries.length) geo.countries = countries
  if (regions.length) geo.regions = regions
  if (cities.length) geo.cities = cities
  if (!countries.length && !regions.length && !cities.length) geo.countries = ["IN"]
  const platforms = adType === "INSTAGRAM_DIRECT" ? ["instagram"] : targeting.platforms
  return {
    geo_locations: geo,
    // Special ad categories don't allow narrowing by age or gender.
    age_min: special ? 18 : targeting.ageMin,
    age_max: special ? 65 : targeting.ageMax,
    ...(!special && targeting.gender !== "ALL" ? { genders: [targeting.gender === "MALE" ? 1 : 2] } : {}),
    ...(platforms.length === 1 ? { publisher_platforms: platforms } : {}),
    targeting_automation: { advantage_audience: 0 },
  }
}
