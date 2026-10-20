// WhatsApp business profile categories accepted by Meta, with labels for the settings form.
export const VERTICALS = {
  OTHER:"Other", AUTO:"Automotive", BEAUTY:"Beauty, spa & salon", APPAREL:"Clothing & apparel", EDU:"Education",
  ENTERTAIN:"Entertainment", EVENT_PLAN:"Event planning & service", FINANCE:"Finance & banking", GROCERY:"Food & grocery",
  GOVT:"Public service", HOTEL:"Hotel & lodging", HEALTH:"Medical & health", NONPROFIT:"Non-profit",
  PROF_SERVICES:"Professional services", RETAIL:"Shopping & retail", TRAVEL:"Travel & transportation", RESTAURANT:"Restaurant",
  NOT_A_BIZ:"Not a business",
} as const
export type Vertical = keyof typeof VERTICALS
export const VERTICAL_KEYS = Object.keys(VERTICALS) as [Vertical, ...Vertical[]]
