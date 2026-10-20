import nodemailer from "nodemailer"

// Transactional email over SMTP (Gmail/Google Workspace, Zoho Mail, Amazon SES, Brevo, Hostinger/GoDaddy mail …).
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM; without them, email is simply not available.

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
}

let transport: nodemailer.Transporter | null = null
function transporter() {
  if (transport) return transport
  const port = Number(process.env.SMTP_PORT || 587)
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  })
  return transport
}

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)

// Simple branded email: a heading, paragraphs and an optional button.
export async function sendEmail(input: { to: string; subject: string; heading: string; paragraphs: string[]; button?: { text: string; url: string }; footer?: string }) {
  if (!emailConfigured()) throw new Error("Email is not set up (SMTP_HOST / SMTP_FROM).")
  const text = [input.heading, "", ...input.paragraphs, ...(input.button ? ["", `${input.button.text}: ${input.button.url}`] : []), ...(input.footer ? ["", input.footer] : [])].join("\n")
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="font-weight:700;font-size:18px;color:#075e54;margin-bottom:18px">ZKWAConnect</div>
  <h1 style="font-size:20px;margin:0 0 12px">${escape(input.heading)}</h1>
  ${input.paragraphs.map(item => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escape(item)}</p>`).join("")}
  ${input.button ? `<p style="margin:20px 0"><a href="${escape(input.button.url)}" style="background:#075e54;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${escape(input.button.text)}</a></p>` : ""}
  ${input.footer ? `<p style="font-size:12px;color:#64748b;margin-top:24px">${escape(input.footer)}</p>` : ""}
</div>`
  await transporter().sendMail({ from: process.env.SMTP_FROM, to: input.to, subject: input.subject, text, html })
}
