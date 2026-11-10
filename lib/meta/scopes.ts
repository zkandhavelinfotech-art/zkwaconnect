// Permissions ZKWAConnect requests when a customer connects Meta. The admin setup checker compares granted scopes to this list.
export const META_SCOPES = [
  { scope:"whatsapp_business_management", purpose:"Read WABAs, phone numbers and templates; subscribe webhooks" },
  { scope:"whatsapp_business_messaging", purpose:"Send and receive WhatsApp messages" },
  { scope:"business_management", purpose:"List the customer's business portfolios" },
  { scope:"ads_read", purpose:"Read Click-to-WhatsApp ad performance" },
  { scope:"ads_management", purpose:"Create ads from the Create New Ad wizard (created paused)" },
  { scope:"pages_manage_ads", purpose:"Run ads on behalf of the customer's Facebook Page" },
  { scope:"pages_show_list", purpose:"List Facebook Pages that own Lead Forms" },
  { scope:"pages_read_engagement", purpose:"Read Page Lead Forms" },
  { scope:"catalog_management", purpose:"Connect a product catalog and add products for WhatsApp commerce" },
] as const

