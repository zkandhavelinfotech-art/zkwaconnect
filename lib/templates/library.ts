// ZKWAConnect's WhatsApp Template Message Library. Bodies follow Meta's rules: numbered variables,
// no variable at the very start or end, and sample values for every variable.

export type LibraryButton =
  | { type:"QUICK_REPLY"; text:string }
  | { type:"URL"; text:string; url:string; track?:boolean }
  | { type:"PHONE_NUMBER"; text:string; phone_number:string }

export type LibraryTemplate = {
  id:string
  name:string
  title:string
  category:"MARKETING"|"UTILITY"
  industry:string
  header?:string
  body:string
  footer?:string
  buttons?:LibraryButton[]
  examples:string[]
}

export const TEMPLATE_INDUSTRIES = ["IT & Software","E-commerce","Education","Healthcare","Real estate","Restaurants","Travel","Finance","Events","Services","General"] as const

export const TEMPLATE_LIBRARY:LibraryTemplate[] = [
  // IT & Software — welcome and onboarding for software companies, SaaS products and IT services
  {id:"it_company_welcome",name:"it_company_welcome",title:"Software company welcome",category:"MARKETING",industry:"IT & Software",
    header:"Welcome! 👋",body:"Hello {{1}}, thank you for connecting with {{2}}! We build custom software, web and mobile apps, and cloud solutions for growing businesses. How can we help you today?",
    footer:"Reply anytime — we're here to help",buttons:[{type:"QUICK_REPLY",text:"Our services"},{type:"QUICK_REPLY",text:"Book a demo"},{type:"QUICK_REPLY",text:"Talk to sales"}],
    examples:["Priya","ZKandavel Infotech"]},
  {id:"saas_account_welcome",name:"saas_account_welcome",title:"SaaS account created",category:"UTILITY",industry:"IT & Software",
    header:"Your account is ready ✅",body:"Hi {{1}}, welcome to {{2}}! Your account has been created successfully. Log in to set up your workspace, and reply here if you need any help getting started.",
    buttons:[{type:"URL",text:"Log in",url:"https://app.zkwaconnect.in/login"},{type:"QUICK_REPLY",text:"Talk to support"}],
    examples:["Priya","ZKWAConnect"]},
  {id:"saas_trial_started",name:"saas_free_trial_started",title:"Free trial started",category:"UTILITY",industry:"IT & Software",
    body:"Hi {{1}}, your {{2}}-day free trial of {{3}} has started. Explore every feature and message us here if you have any questions.",
    buttons:[{type:"URL",text:"Open dashboard",url:"https://app.zkwaconnect.in/app/dashboard"}],examples:["Priya","14","ZKWAConnect"]},
  {id:"saas_trial_ending",name:"saas_trial_ending_reminder",title:"Trial ending reminder",category:"MARKETING",industry:"IT & Software",
    body:"Hi {{1}}, your free trial of {{2}} ends on {{3}}. Upgrade now to keep your data and continue without any interruption.",
    footer:"Plans start at ₹999/month",buttons:[{type:"URL",text:"Upgrade now",url:"https://app.zkwaconnect.in/app/billing"},{type:"QUICK_REPLY",text:"Talk to sales"}],
    examples:["Priya","ZKWAConnect","25 Oct"]},
  {id:"it_enquiry_ack",name:"it_services_enquiry_received",title:"IT services enquiry received",category:"UTILITY",industry:"IT & Software",
    body:"Hi {{1}}, thank you for your enquiry about {{2}}. Our team will contact you within {{3}}. Your reference number is {{4}}, please keep it for follow-up.",
    examples:["Rahul","mobile app development","24 hours","ZK-1042"]},
  {id:"it_demo_booked",name:"product_demo_confirmed",title:"Product demo confirmed",category:"UTILITY",industry:"IT & Software",
    body:"Hi {{1}}, your {{2}} demo is confirmed for {{3}}. Our product specialist will share the meeting link before the session.",
    buttons:[{type:"QUICK_REPLY",text:"Reschedule"},{type:"QUICK_REPLY",text:"Cancel"}],examples:["Rahul","ZKWAConnect","Monday, 11 AM"]},
  {id:"it_support_ticket",name:"support_ticket_created",title:"Support ticket created",category:"UTILITY",industry:"IT & Software",
    body:"Hi {{1}}, we have received your support request. Your ticket number is {{2}} and our team will respond within {{3}}. Reply to this message to add more details.",
    examples:["Rahul","TKT-2087","4 hours"]},
  {id:"it_services_intro",name:"it_services_introduction",title:"IT services introduction",category:"MARKETING",industry:"IT & Software",
    body:"Hi {{1}}, looking to grow your business with technology? {{2}} offers website development, mobile apps, cloud hosting and IT support at affordable prices. Reply to know more.",
    buttons:[{type:"QUICK_REPLY",text:"I'm interested"},{type:"URL",text:"Visit website",url:"https://zkandavelinfotech.com/"}],
    examples:["Rahul","ZKandavel Infotech"]},

  // E-commerce
  {id:"order_confirmation",name:"order_confirmation",title:"Order confirmation",category:"UTILITY",industry:"E-commerce",
    header:"Order confirmed ✅",body:"Hi {{1}}, thank you for your order! Your order {{2}} of ₹{{3}} has been confirmed and will be shipped soon.",
    footer:"Reply HELP for support",buttons:[{type:"URL",text:"Track order",url:"https://example.com/orders"}],examples:["Priya","#ZK1042","1,499"]},
  {id:"order_shipped",name:"order_shipped",title:"Order shipped",category:"UTILITY",industry:"E-commerce",
    body:"Good news {{1}}! Your order {{2}} has been shipped via {{3}} and should reach you by {{4}}. Tap below to track it.",
    buttons:[{type:"URL",text:"Track shipment",url:"https://example.com/track"}],examples:["Priya","#ZK1042","Delhivery","24 Oct"]},
  {id:"out_for_delivery",name:"out_for_delivery",title:"Out for delivery",category:"UTILITY",industry:"E-commerce",
    body:"Hi {{1}}, your order {{2}} is out for delivery today. Please keep ₹{{3}} ready if you chose cash on delivery.",
    examples:["Priya","#ZK1042","1,499"]},
  {id:"abandoned_cart",name:"abandoned_cart_reminder",title:"Abandoned cart reminder",category:"MARKETING",industry:"E-commerce",
    header:"You left something behind 🛒",body:"Hi {{1}}, the items in your cart are almost sold out! Complete your purchase now and use code {{2}} to get {{3}} off.",
    footer:"Offer valid for 24 hours",buttons:[{type:"URL",text:"Complete purchase",url:"https://example.com/cart"}],examples:["Priya","CART10","10%"]},
  {id:"festive_sale",name:"festive_sale_offer",title:"Festive sale offer",category:"MARKETING",industry:"E-commerce",
    header:"🎉 Festive Sale is LIVE",body:"Hi {{1}}, celebrate with up to {{2}} off on our bestsellers! Sale ends on {{3}}, so shop before stocks run out.",
    footer:"Reply STOP to opt out",buttons:[{type:"URL",text:"Shop now",url:"https://example.com/sale"},{type:"QUICK_REPLY",text:"Stop promotions"}],
    examples:["Priya","50%","31 Oct"]},
  {id:"back_in_stock",name:"back_in_stock",title:"Back in stock",category:"MARKETING",industry:"E-commerce",
    body:"Hi {{1}}, good news! {{2}} is back in stock. Grab yours before it sells out again.",
    buttons:[{type:"URL",text:"Buy now",url:"https://example.com/product"}],examples:["Priya","Classic Cotton Kurta"]},
  {id:"cod_confirmation",name:"cod_order_confirmation",title:"COD order confirmation",category:"UTILITY",industry:"E-commerce",
    body:"Hi {{1}}, please confirm your cash on delivery order {{2}} of ₹{{3}}. Tap a button below to confirm or cancel.",
    buttons:[{type:"QUICK_REPLY",text:"Confirm order"},{type:"QUICK_REPLY",text:"Cancel order"}],examples:["Priya","#ZK1042","1,499"]},
  {id:"review_request",name:"review_request",title:"Review request",category:"MARKETING",industry:"E-commerce",
    body:"Hi {{1}}, we hope you're loving your {{2}}! Could you take a minute to share your feedback? It really helps us.",
    buttons:[{type:"URL",text:"Write a review",url:"https://example.com/review"}],examples:["Priya","new headphones"]},

  // Payments & finance
  {id:"payment_reminder",name:"payment_reminder",title:"Payment reminder",category:"UTILITY",industry:"Finance",
    body:"Hi {{1}}, this is a reminder that your payment of ₹{{2}} for invoice {{3}} is due on {{4}}. Please pay on time to avoid late fees.",
    buttons:[{type:"URL",text:"Pay now",url:"https://example.com/pay"}],examples:["Rahul","4,999","INV-2026-118","25 Oct"]},
  {id:"payment_received",name:"payment_received",title:"Payment received",category:"UTILITY",industry:"Finance",
    body:"Hi {{1}}, we've received your payment of ₹{{2}} via {{3}}. Your transaction ID is {{4}}. Thank you!",
    examples:["Rahul","4,999","UPI","T2610181234"]},
  {id:"emi_due",name:"emi_due_reminder",title:"EMI due reminder",category:"UTILITY",industry:"Finance",
    body:"Dear {{1}}, your EMI of ₹{{2}} for loan account {{3}} is due on {{4}}. Please maintain sufficient balance in your account.",
    examples:["Rahul","12,450","LN00982","5 Nov"]},

  // Education
  {id:"class_reminder",name:"class_reminder",title:"Class reminder",category:"UTILITY",industry:"Education",
    body:"Hi {{1}}, your {{2}} class starts at {{3}} today. Join on time using the link below.",
    buttons:[{type:"URL",text:"Join class",url:"https://example.com/class"}],examples:["Ananya","Physics","5:00 PM"]},
  {id:"admission_open",name:"admissions_open",title:"Admissions open",category:"MARKETING",industry:"Education",
    header:"Admissions open 🎓",body:"Hi {{1}}, admissions for {{2}} are now open! Early-bird scholarships of up to {{3}} are available till {{4}}, so apply soon.",
    buttons:[{type:"URL",text:"Apply now",url:"https://example.com/apply"},{type:"QUICK_REPLY",text:"Request a callback"}],
    examples:["Ananya","the 2027 batch","30%","15 Nov"]},
  {id:"fee_reminder",name:"fee_due_reminder",title:"Fee due reminder",category:"UTILITY",industry:"Education",
    body:"Dear parent, the {{1}} fee of ₹{{2}} for {{3}} is due on {{4}}. Kindly pay before the due date.",
    buttons:[{type:"URL",text:"Pay fees",url:"https://example.com/fees"}],examples:["term 2","18,000","Aarav (Class 6)","10 Nov"]},

  // Healthcare
  {id:"appointment_confirmation",name:"appointment_confirmation",title:"Appointment confirmation",category:"UTILITY",industry:"Healthcare",
    body:"Hi {{1}}, your appointment with {{2}} is confirmed for {{3}} at {{4}}. Please arrive 10 minutes early.",
    buttons:[{type:"QUICK_REPLY",text:"Reschedule"},{type:"QUICK_REPLY",text:"Cancel"}],examples:["Meena","Dr. Sharma","20 Oct","11:30 AM"]},
  {id:"appointment_reminder",name:"appointment_reminder",title:"Appointment reminder",category:"UTILITY",industry:"Healthcare",
    body:"Reminder: Hi {{1}}, you have an appointment with {{2}} tomorrow at {{3}}. Reply if you need to reschedule.",
    examples:["Meena","Dr. Sharma","11:30 AM"]},
  {id:"lab_report_ready",name:"lab_report_ready",title:"Lab report ready",category:"UTILITY",industry:"Healthcare",
    body:"Hi {{1}}, your {{2}} report is ready. You can download it securely using the link below.",
    buttons:[{type:"URL",text:"View report",url:"https://example.com/reports"}],examples:["Meena","blood test"]},
  {id:"health_checkup_offer",name:"health_checkup_offer",title:"Health check-up offer",category:"MARKETING",industry:"Healthcare",
    body:"Hi {{1}}, book a full body health check-up this month at just ₹{{2}} (worth ₹{{3}}). Home sample collection available.",
    buttons:[{type:"QUICK_REPLY",text:"Book now"},{type:"PHONE_NUMBER",text:"Call us",phone_number:"+919876543210"}],
    examples:["Meena","999","2,499"]},

  // Real estate
  {id:"site_visit",name:"site_visit_confirmation",title:"Site visit confirmation",category:"UTILITY",industry:"Real estate",
    body:"Hi {{1}}, your site visit to {{2}} is scheduled on {{3}} at {{4}}. Our executive will meet you at the site office.",
    buttons:[{type:"URL",text:"Get directions",url:"https://maps.google.com"}],examples:["Vikram","Green Meadows","26 Oct","11 AM"]},
  {id:"new_project_launch",name:"new_project_launch",title:"New project launch",category:"MARKETING",industry:"Real estate",
    header:"New launch 🏡",body:"Hi {{1}}, introducing {{2}} — premium 2 & 3 BHK homes starting at ₹{{3}}. Pre-launch prices are valid till {{4}} only.",
    buttons:[{type:"QUICK_REPLY",text:"Book a site visit"},{type:"URL",text:"View brochure",url:"https://example.com/brochure"}],
    examples:["Vikram","Green Meadows","65 Lakh","30 Nov"]},

  // Restaurants
  {id:"table_reservation",name:"table_reservation",title:"Table reservation",category:"UTILITY",industry:"Restaurants",
    body:"Hi {{1}}, your table for {{2}} at {{3}} is confirmed for {{4}}. We look forward to serving you!",
    examples:["Arjun","4","Spice Garden","8:00 PM today"]},
  {id:"weekend_special",name:"weekend_special_offer",title:"Weekend special",category:"MARKETING",industry:"Restaurants",
    body:"Hi {{1}}, this weekend enjoy {{2}} on all orders above ₹{{3}}. Order now on WhatsApp!",
    buttons:[{type:"QUICK_REPLY",text:"See menu"},{type:"QUICK_REPLY",text:"Order now"}],examples:["Arjun","20% off","499"]},

  // Travel
  {id:"booking_confirmation",name:"travel_booking_confirmation",title:"Booking confirmation",category:"UTILITY",industry:"Travel",
    body:"Hi {{1}}, your booking {{2}} for {{3}} on {{4}} is confirmed. Have a wonderful trip!",
    buttons:[{type:"URL",text:"View itinerary",url:"https://example.com/trips"}],examples:["Sneha","BK7781","Goa","2 Dec"]},
  {id:"holiday_package",name:"holiday_package_offer",title:"Holiday package offer",category:"MARKETING",industry:"Travel",
    header:"Holiday deals ✈️",body:"Hi {{1}}, explore {{2}} with our {{3}} package starting at ₹{{4}} per person. Limited seats available!",
    buttons:[{type:"QUICK_REPLY",text:"I'm interested"},{type:"URL",text:"View packages",url:"https://example.com/packages"}],
    examples:["Sneha","Kerala","5N/6D","24,999"]},

  // Events
  {id:"event_registration",name:"event_registration_confirmed",title:"Event registration",category:"UTILITY",industry:"Events",
    body:"Hi {{1}}, you're registered for {{2}} on {{3}} at {{4}}. Show this message at the entry desk.",
    examples:["Karan","Startup Summit 2026","15 Nov","Bengaluru"]},
  {id:"webinar_invite",name:"webinar_invitation",title:"Webinar invitation",category:"MARKETING",industry:"Events",
    body:"Hi {{1}}, join our free live webinar “{{2}}” on {{3}}. Seats are limited, so register today!",
    buttons:[{type:"URL",text:"Register free",url:"https://example.com/webinar"}],examples:["Karan","Grow sales with WhatsApp","Thursday, 7 PM"]},

  // Services
  {id:"service_booked",name:"service_booking_confirmed",title:"Service booking",category:"UTILITY",industry:"Services",
    body:"Hi {{1}}, your {{2}} service is booked for {{3}}. Our technician {{4}} will call you before arriving.",
    examples:["Neha","AC repair","tomorrow, 10 AM","Ramesh"]},
  {id:"subscription_renewal",name:"subscription_renewal",title:"Subscription renewal",category:"UTILITY",industry:"Services",
    body:"Hi {{1}}, your {{2}} subscription expires on {{3}}. Renew now to continue enjoying uninterrupted service.",
    buttons:[{type:"URL",text:"Renew now",url:"https://example.com/renew"}],examples:["Neha","Premium","31 Oct"]},

  // General
  {id:"welcome_message",name:"welcome_message",title:"Welcome message",category:"MARKETING",industry:"General",
    body:"Hi {{1}}, welcome to {{2}}! 🎉 We're glad to have you. Reply to this message anytime for help.",
    buttons:[{type:"QUICK_REPLY",text:"View offers"},{type:"QUICK_REPLY",text:"Talk to us"}],examples:["Priya","ZK Store"]},
  {id:"feedback_request",name:"feedback_request",title:"Feedback request",category:"MARKETING",industry:"General",
    body:"Hi {{1}}, how was your experience with {{2}}? Tap a rating below — it takes 2 seconds.",
    buttons:[{type:"QUICK_REPLY",text:"Excellent"},{type:"QUICK_REPLY",text:"Good"},{type:"QUICK_REPLY",text:"Needs improvement"}],
    examples:["Priya","our support team"]},
  {id:"opt_in_confirmation",name:"whatsapp_opt_in",title:"Opt-in confirmation",category:"UTILITY",industry:"General",
    body:"Hi {{1}}, thanks for subscribing to WhatsApp updates from {{2}}. You can reply STOP anytime to unsubscribe.",
    examples:["Priya","ZK Store"]},
  {id:"lead_follow_up",name:"lead_follow_up",title:"Lead follow-up",category:"MARKETING",industry:"General",
    body:"Hi {{1}}, thanks for your interest in {{2}}. Would you like a quick call with our team to know more?",
    buttons:[{type:"QUICK_REPLY",text:"Yes, call me"},{type:"QUICK_REPLY",text:"Not now"}],examples:["Priya","our premium plan"]},
]
