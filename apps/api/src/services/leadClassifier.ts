// Lead intent classification via keyword matching
export const LEAD_KEYWORDS: Record<string, string[]> = {
  JOB_ENQUIRY: [
    'job','hiring','vacancy','position','career','employment','apply','resume','cv',
    'salary','work','opportunity','opening','recruitment','interview',
  ],
  SERVICE_REQUEST: [
    'repair','fix','service','maintenance','install','broken','not working',
    'issue','problem','help','support','urgent','emergency','ac','plumber',
    'electrician','cleaning','painting',
  ],
  PRODUCT_ENQUIRY: [
    'price','cost','rate','quote','how much','available','stock','buy','purchase',
    'order','product','item','catalogue','discount','offer','deal',
  ],
  BILLING: [
    'invoice','bill','payment','paid','refund','receipt','transaction','charge',
    'subscription','plan','due','outstanding','balance','wallet',
  ],
  SUPPORT: [
    'error','bug','crash','not loading','slow','fail','trouble','issue','help me',
    'complaint','feedback','wrong','incorrect','app',
  ],
}

export function classifyLead(message: string): string {
  if (!message) return 'GENERAL'
  const lower = message.toLowerCase()
  let best = 'GENERAL'
  let maxHits = 0

  for (const [category, keywords] of Object.entries(LEAD_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw)).length
    if (hits > maxHits) { maxHits = hits; best = category }
  }
  return best
}
