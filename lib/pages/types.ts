// WhatsApp Page Builder: section catalogue, theme and editable fields. Shared by the editor (client) and the public page
// renderer, so keep this file free of server-only imports. Every call-to-action opens a WhatsApp chat with a pre-filled message.

export type PageType = "SITE" | "LINKS" | "LANDING"
export const PAGE_TYPES: Record<PageType, { label: string; description: string }> = {
  SITE: { label: "Mini-website", description: "Your business page: hero, services, products, form, FAQ, hours and map — every button opens WhatsApp." },
  LINKS: { label: "Link-in-bio", description: "One tap-friendly list of WhatsApp buttons and links for your Instagram / Facebook bio." },
  LANDING: { label: "Campaign landing page", description: "A single offer or ad page with one clear WhatsApp call-to-action and its own tracking." },
}

export type SectionType = "hero" | "links" | "services" | "products" | "form" | "cta" | "faq" | "testimonials" | "gallery" | "hours" | "location" | "text" | "qr" | "social"
export type Section = { id: string; type: SectionType; hidden?: boolean; props: Record<string, unknown> }
export type Item = Record<string, string>

export type Theme = {
  businessName: string; logo: string; primary: string; background: string; text: string
  font: "Inter" | "Poppins" | "Playfair Display" | "DM Sans" | "Lora"; buttonStyle: "solid" | "outline" | "pill"
  floatingButton: boolean; floatingMessage: string
}
export const DEFAULT_THEME: Theme = { businessName: "", logo: "", primary: "#075E54", background: "#ffffff", text: "#111b21", font: "Inter", buttonStyle: "pill",
  floatingButton: true, floatingMessage: "Hi! I have a question." }
export const FONTS: Theme["font"][] = ["Inter", "Poppins", "DM Sans", "Playfair Display", "Lora"]

// Properties panel description: one entry per editable prop.
export type Field =
  | { key: string; label: string; kind: "text" | "textarea" | "image" | "url" | "message"; placeholder?: string; help?: string }
  | { key: string; label: string; kind: "select"; options: [string, string][] }
  | { key: string; label: string; kind: "toggle" }
  | { key: string; label: string; kind: "images" }
  | { key: string; label: string; kind: "items"; itemLabel: string; fields: Field[] }
  | { key: string; label: string; kind: "products" }

const msg = (label = "Pre-filled WhatsApp message"): Field => ({ key: "message", label, kind: "message", help: "What the customer's WhatsApp message will say. Start it with a keyword to trigger a chatbot flow." })

export const SECTIONS: Record<SectionType, { label: string; icon: string; description: string; fields: Field[]; defaults: () => Record<string, unknown> }> = {
  hero: { label: "Hero", icon: "🏠", description: "Big headline with a Chat on WhatsApp button", fields: [
    { key: "eyebrow", label: "Small label", kind: "text" }, { key: "title", label: "Headline", kind: "text" }, { key: "subtitle", label: "Text", kind: "textarea" },
    { key: "image", label: "Background / side image", kind: "image" },
    { key: "layout", label: "Layout", kind: "select", options: [["center", "Centred"], ["split", "Text + image"], ["cover", "Image background"]] },
    { key: "buttonText", label: "Button text", kind: "text" }, msg()],
    defaults: () => ({ eyebrow: "", title: "Chat with us on WhatsApp", subtitle: "Ask anything — we usually reply within minutes.", image: "", layout: "center", buttonText: "Chat on WhatsApp", message: "Hi! I'd like to know more." }) },
  links: { label: "Link buttons", icon: "🔗", description: "A stack of buttons (WhatsApp, links, call)", fields: [
    { key: "items", label: "Buttons", kind: "items", itemLabel: "Button", fields: [
      { key: "icon", label: "Icon (emoji)", kind: "text" }, { key: "label", label: "Button text", kind: "text" },
      { key: "kind", label: "Opens", kind: "select", options: [["whatsapp", "WhatsApp chat"], ["url", "Website link"], ["call", "Phone call"]] },
      { key: "value", label: "Message / link / phone", kind: "textarea", help: "WhatsApp: the pre-filled message. Link: https://… Call: +91…" }] }],
    defaults: () => ({ items: [
      { icon: "💬", label: "Chat on WhatsApp", kind: "whatsapp", value: "Hi! I have a question." },
      { icon: "🛍️", label: "See today's offers", kind: "whatsapp", value: "OFFERS" },
      { icon: "📅", label: "Book an appointment", kind: "whatsapp", value: "BOOK an appointment" }] }) },
  services: { label: "Services / offers", icon: "🧾", description: "Cards with an Ask on WhatsApp button each", fields: [
    { key: "heading", label: "Heading", kind: "text" }, { key: "intro", label: "Intro", kind: "textarea" },
    { key: "items", label: "Cards", kind: "items", itemLabel: "Card", fields: [
      { key: "title", label: "Title", kind: "text" }, { key: "text", label: "Description", kind: "textarea" }, { key: "price", label: "Price (optional)", kind: "text" },
      { key: "image", label: "Image", kind: "image" }, { key: "buttonText", label: "Button text", kind: "text" }, msg()] }],
    defaults: () => ({ heading: "What we offer", intro: "", items: [
      { title: "Consultation", text: "Talk to an expert about what you need.", price: "", image: "", buttonText: "Ask on WhatsApp", message: "Hi, I'd like a consultation." },
      { title: "Packages", text: "Popular packages at special prices.", price: "From ₹999", image: "", buttonText: "Ask on WhatsApp", message: "Hi, please share your packages." }] }) },
  products: { label: "Products (WhatsApp catalog)", icon: "🛍️", description: "Products from your catalog with Order on WhatsApp", fields: [
    { key: "heading", label: "Heading", kind: "text" }, { key: "intro", label: "Intro", kind: "textarea" }, { key: "buttonText", label: "Button text", kind: "text" },
    { key: "items", label: "Products", kind: "products" }],
    defaults: () => ({ heading: "Our products", intro: "Tap Order to chat with us on WhatsApp.", buttonText: "Order on WhatsApp", items: [] }) },
  form: { label: "Lead form", icon: "📝", description: "Name + WhatsApp number with opt-in; saved to Contacts", fields: [
    { key: "heading", label: "Heading", kind: "text" }, { key: "intro", label: "Intro", kind: "textarea" }, { key: "askMessage", label: "Ask what they need", kind: "toggle" },
    { key: "buttonText", label: "Button text", kind: "text" }, { key: "consentText", label: "WhatsApp opt-in text", kind: "text" },
    { key: "successText", label: "Thank-you message", kind: "text" }, { key: "tag", label: "Tag new contacts as", kind: "text", help: "e.g. diwali-offer — use it in Segments and broadcasts." }],
    defaults: () => ({ heading: "Get a call back on WhatsApp", intro: "Leave your number and we'll message you.", askMessage: true, buttonText: "Send",
      consentText: "I agree to receive updates on WhatsApp.", successText: "Thanks! We'll message you on WhatsApp shortly.", tag: "" }) },
  cta: { label: "Call-to-action banner", icon: "📣", description: "A coloured strip with one WhatsApp button", fields: [
    { key: "title", label: "Title", kind: "text" }, { key: "text", label: "Text", kind: "textarea" }, { key: "buttonText", label: "Button text", kind: "text" }, msg()],
    defaults: () => ({ title: "Have a question?", text: "We're on WhatsApp — tap below and ask away.", buttonText: "Chat now", message: "Hi! I have a question." }) },
  faq: { label: "FAQ", icon: "❓", description: "Questions and answers", fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "items", label: "Questions", kind: "items", itemLabel: "Question", fields: [{ key: "q", label: "Question", kind: "text" }, { key: "a", label: "Answer", kind: "textarea" }] }],
    defaults: () => ({ heading: "Frequently asked questions", items: [{ q: "How do I order?", a: "Tap any WhatsApp button and send us a message." }, { q: "When do you reply?", a: "Usually within a few minutes during business hours." }] }) },
  testimonials: { label: "Testimonials", icon: "⭐", description: "What customers say", fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "items", label: "Reviews", kind: "items", itemLabel: "Review", fields: [{ key: "name", label: "Name", kind: "text" }, { key: "text", label: "Review", kind: "textarea" },
      { key: "rating", label: "Stars", kind: "select", options: [["5", "★★★★★"], ["4", "★★★★"], ["3", "★★★"]] }] }],
    defaults: () => ({ heading: "Happy customers", items: [{ name: "Priya", text: "Quick replies on WhatsApp and great service!", rating: "5" }] }) },
  gallery: { label: "Photo gallery", icon: "🖼️", description: "A grid of photos", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "images", label: "Photos", kind: "images" }],
    defaults: () => ({ heading: "Gallery", images: [] }) },
  hours: { label: "Business hours", icon: "🕘", description: "When you reply on WhatsApp", fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "items", label: "Rows", kind: "items", itemLabel: "Row", fields: [{ key: "day", label: "Days", kind: "text" }, { key: "time", label: "Hours", kind: "text" }] },
    { key: "note", label: "Note", kind: "text" }],
    defaults: () => ({ heading: "We reply on WhatsApp", items: [{ day: "Mon – Sat", time: "9:00 am – 7:00 pm" }, { day: "Sunday", time: "Closed" }], note: "Messages outside these hours are answered the next morning." }) },
  location: { label: "Location / map", icon: "📍", description: "Address with a Google Maps link", fields: [
    { key: "heading", label: "Heading", kind: "text" }, { key: "address", label: "Address", kind: "textarea" },
    { key: "mapUrl", label: "Google Maps link", kind: "url", placeholder: "https://maps.app.goo.gl/…" }],
    defaults: () => ({ heading: "Visit us", address: "", mapUrl: "" }) },
  text: { label: "Text block", icon: "📄", description: "A heading and paragraphs", fields: [{ key: "heading", label: "Heading", kind: "text" }, { key: "body", label: "Text", kind: "textarea" }],
    defaults: () => ({ heading: "About us", body: "Tell customers who you are and why they'll love chatting with you." }) },
  qr: { label: "WhatsApp QR code", icon: "🔳", description: "Scan to chat (great for print and desktop visitors)", fields: [
    { key: "heading", label: "Heading", kind: "text" }, { key: "text", label: "Text", kind: "textarea" }, msg()],
    defaults: () => ({ heading: "Scan to chat on WhatsApp", text: "Open your phone camera and scan.", message: "Hi! I scanned your QR code." }) },
  social: { label: "Social links", icon: "🌐", description: "Instagram, Facebook, YouTube, website, email", fields: [
    { key: "instagram", label: "Instagram link", kind: "url" }, { key: "facebook", label: "Facebook link", kind: "url" }, { key: "youtube", label: "YouTube link", kind: "url" },
    { key: "website", label: "Website", kind: "url" }, { key: "email", label: "Email", kind: "text" }],
    defaults: () => ({ instagram: "", facebook: "", youtube: "", website: "", email: "" }) },
}
export const SECTION_TYPES = Object.keys(SECTIONS) as SectionType[]

export const newId = () => Math.random().toString(36).slice(2, 10)
export function newSection(type: SectionType, props: Record<string, unknown> = {}): Section {
  return { id: newId(), type, props: { ...SECTIONS[type].defaults(), ...props } }
}

// Which button a public link points at: a section's own CTA (item = -1) or one of its items.
export function ctaMessage(section: Section, item: number) {
  const props = section.props as { message?: string; items?: Item[] }
  if (item < 0) return { message: String(props.message || ""), label: String((props as { buttonText?: string; title?: string }).buttonText || section.type) }
  const entry = props.items?.[item]
  if (!entry) return null
  if (section.type === "links") return entry.kind === "whatsapp" ? { message: entry.value || "", label: entry.label || "Link" } : null
  if (section.type === "products") return { message: entry.message || `Hi, I'd like to order ${entry.name}${entry.price ? ` (${entry.price})` : ""}.`, label: entry.name || "Product" }
  return { message: entry.message || "", label: entry.title || entry.label || "Button" }
}

export const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
export const RESERVED_SLUGS = new Set(["admin", "api", "app", "login", "register", "p", "pay", "partner", "zkwaconnect", "support", "help", "www"])
