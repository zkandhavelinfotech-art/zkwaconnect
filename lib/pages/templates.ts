import { DEFAULT_THEME, newSection, type PageType, type Section, type Theme } from "./types"

// Ready-made starting points. Every one is WhatsApp-first: the buttons pre-fill messages (many start with a keyword
// such as BOOK or PRICE so a chatbot flow can take over).

export type PageTemplate = { id: string; type: PageType; label: string; emoji: string; description: string; theme: Partial<Theme>; sections: (business: string) => Section[] }

const site = (id: string, label: string, emoji: string, description: string, theme: Partial<Theme>, build: (business: string) => Section[]): PageTemplate =>
  ({ id, type: "SITE", label, emoji, description, theme, sections: build })

export const PAGE_TEMPLATES: PageTemplate[] = [
  site("clinic", "Clinic / doctor", "🩺", "Appointments, treatments, timings and location", { primary: "#0e7490", font: "Inter" }, business => [
    newSection("hero", { eyebrow: "Trusted care", title: `${business}`, subtitle: "Book your appointment on WhatsApp in under a minute.", layout: "split", buttonText: "Book on WhatsApp", message: "BOOK an appointment" }),
    newSection("services", { heading: "Treatments", items: [
      { title: "General consultation", text: "Diagnosis and treatment advice.", price: "₹500", image: "", buttonText: "Book", message: "BOOK general consultation" },
      { title: "Health check-up", text: "Full body check-up packages.", price: "From ₹1,499", image: "", buttonText: "Ask", message: "Hi, please share check-up packages." },
      { title: "Teleconsultation", text: "Talk to the doctor on a WhatsApp call.", price: "₹400", image: "", buttonText: "Book", message: "BOOK teleconsultation" }] }),
    newSection("hours"), newSection("testimonials"), newSection("location"), newSection("faq"), newSection("cta", { title: "Not feeling well?", text: "Message us now — we'll find the earliest slot.", buttonText: "Book now", message: "BOOK earliest slot" })]),
  site("salon", "Salon / spa", "💇", "Services menu, offers, gallery and booking", { primary: "#be185d", font: "Poppins" }, business => [
    newSection("hero", { eyebrow: "Look good, feel great", title: business, subtitle: "Book your slot and see today's offers on WhatsApp.", layout: "cover", buttonText: "Book a slot", message: "BOOK a slot" }),
    newSection("services", { heading: "Services", items: [
      { title: "Haircut & styling", text: "", price: "₹399", image: "", buttonText: "Book", message: "BOOK haircut" },
      { title: "Facial & cleanup", text: "", price: "₹899", image: "", buttonText: "Book", message: "BOOK facial" },
      { title: "Bridal packages", text: "", price: "On request", image: "", buttonText: "Ask", message: "Hi, please share bridal packages." }] }),
    newSection("gallery"), newSection("testimonials"), newSection("hours"), newSection("location")]),
  site("coaching", "Coaching / tuition", "🎓", "Courses, batches, demo class and enquiries", { primary: "#4338ca", font: "DM Sans" }, business => [
    newSection("hero", { eyebrow: "Admissions open", title: business, subtitle: "Ask for batch timings, fees and a free demo class on WhatsApp.", layout: "split", buttonText: "Get details on WhatsApp", message: "COURSES" }),
    newSection("services", { heading: "Courses", items: [
      { title: "Foundation", text: "Classes 8–10", price: "", image: "", buttonText: "Fees & timings", message: "Hi, fees and timings for Foundation?" },
      { title: "JEE / NEET", text: "Classes 11–12", price: "", image: "", buttonText: "Fees & timings", message: "Hi, fees and timings for JEE/NEET?" }] }),
    newSection("form", { heading: "Book a free demo class", tag: "demo-class" }), newSection("testimonials"), newSection("faq"), newSection("location")]),
  site("restaurant", "Restaurant / cloud kitchen", "🍛", "Menu, order on WhatsApp, timings", { primary: "#c2410c", font: "Poppins" }, business => [
    newSection("hero", { eyebrow: "Fresh & hot", title: business, subtitle: "Order on WhatsApp — delivery and takeaway.", layout: "cover", buttonText: "Order on WhatsApp", message: "MENU" }),
    newSection("products", { heading: "Today's specials" }), newSection("services", { heading: "Menu highlights", items: [
      { title: "Thali", text: "Rice, 3 curries, roti, dessert", price: "₹199", image: "", buttonText: "Order", message: "ORDER Thali" },
      { title: "Biryani", text: "Chicken / veg", price: "₹249", image: "", buttonText: "Order", message: "ORDER Biryani" }] }),
    newSection("hours"), newSection("location")]),
  site("realestate", "Real estate", "🏢", "Projects, site visits and price enquiries", { primary: "#1e3a8a", font: "Playfair Display" }, business => [
    newSection("hero", { eyebrow: "New launch", title: business, subtitle: "Get the brochure, prices and book a site visit on WhatsApp.", layout: "cover", buttonText: "Get brochure", message: "BROCHURE" }),
    newSection("services", { heading: "Projects", items: [
      { title: "2 BHK apartments", text: "From 1,050 sq ft", price: "From ₹65 L", image: "", buttonText: "Price list", message: "Hi, price list for 2 BHK?" },
      { title: "3 BHK apartments", text: "From 1,450 sq ft", price: "From ₹92 L", image: "", buttonText: "Price list", message: "Hi, price list for 3 BHK?" }] }),
    newSection("gallery"), newSection("form", { heading: "Book a site visit", tag: "site-visit" }), newSection("location")]),
  site("retail", "Shop / retail", "🛍️", "Catalog products, offers and order on WhatsApp", { primary: "#075E54", font: "Inter" }, business => [
    newSection("hero", { eyebrow: "Shop on WhatsApp", title: business, subtitle: "Browse, ask and order — all on WhatsApp.", layout: "split", buttonText: "Shop on WhatsApp", message: "CATALOG" }),
    newSection("products"), newSection("testimonials"), newSection("faq", { items: [{ q: "How do I pay?", a: "UPI, card or cash on delivery — we'll share the payment link on WhatsApp." }, { q: "Do you deliver?", a: "Yes, across India. Ask us on WhatsApp for delivery time." }] }),
    newSection("qr"), newSection("social")]),
  site("blank-site", "Blank mini-website", "⬜", "Start with a hero and a contact banner", {}, business => [newSection("hero", { title: business }), newSection("cta")]),
  { id: "links", type: "LINKS", label: "Link-in-bio", emoji: "🔗", description: "Logo, a few WhatsApp buttons and your social links", theme: { buttonStyle: "pill", floatingButton: false },
    sections: business => [newSection("hero", { title: business, subtitle: "Tap a button to chat with us on WhatsApp.", layout: "center", buttonText: "", message: "" }), newSection("links"), newSection("social")] },
  { id: "landing-offer", type: "LANDING", label: "Offer / ad landing page", emoji: "🎯", description: "One offer, benefits, reviews and one WhatsApp button", theme: { primary: "#b91c1c" },
    sections: () => [
      newSection("hero", { eyebrow: "Limited-time offer", title: "Flat 30% off this week", subtitle: "Message us on WhatsApp to claim your discount.", layout: "split", buttonText: "Claim on WhatsApp", message: "OFFER" }),
      newSection("services", { heading: "Why customers love it", items: [
        { title: "Quality you can trust", text: "", price: "", image: "", buttonText: "", message: "" },
        { title: "Fast delivery", text: "", price: "", image: "", buttonText: "", message: "" },
        { title: "Easy returns", text: "", price: "", image: "", buttonText: "", message: "" }] }),
      newSection("testimonials"), newSection("cta", { title: "Offer ends soon", text: "Tap below — we'll send your discount code on WhatsApp.", buttonText: "Claim my 30% off", message: "OFFER" })] },
  { id: "landing-event", type: "LANDING", label: "Event / webinar registration", emoji: "🎟️", description: "Event details and registration with WhatsApp reminders", theme: { primary: "#6d28d9" },
    sections: () => [
      newSection("hero", { eyebrow: "Free webinar", title: "Grow your business with WhatsApp", subtitle: "Saturday, 7 pm · Online", layout: "center", buttonText: "Register on WhatsApp", message: "REGISTER webinar" }),
      newSection("text", { heading: "What you'll learn", body: "• How to get more enquiries\n• Answering faster with chatbots\n• Turning chats into sales" }),
      newSection("form", { heading: "Register — reminders come on WhatsApp", tag: "webinar", askMessage: false }), newSection("faq")] },
]

export function templateById(id: string) { return PAGE_TEMPLATES.find(template => template.id === id) }

export function buildFromTemplate(templateId: string, business: string) {
  const template = templateById(templateId) || PAGE_TEMPLATES[PAGE_TEMPLATES.length - 4]
  return { type: template.type, theme: { ...DEFAULT_THEME, businessName: business, ...template.theme }, sections: template.sections(business) }
}
