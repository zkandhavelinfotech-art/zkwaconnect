import { Resend } from 'resend'

function getClient() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not configured')
  return new Resend(key)
}

export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
  from?: string
}) {
  const client = getClient()
  const from   = opts.from || process.env.RESEND_FROM_EMAIL || 'noreply@zkwaconnect.in'
  return client.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html })
}

export async function sendInvoiceEmail(opts: {
  to: string
  invoiceNumber: string
  amount: string
  pdfUrl?: string
}) {
  return sendEmail({
    to: opts.to,
    subject: `Invoice ${opts.invoiceNumber} — ZKWAConnect`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#00C853">Your invoice is ready</h2>
        <p>Invoice <strong>${opts.invoiceNumber}</strong> for <strong>${opts.amount}</strong> has been generated.</p>
        ${opts.pdfUrl ? `<p><a href="${opts.pdfUrl}" style="background:#00C853;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px">Download Invoice PDF</a></p>` : ''}
        <p style="color:#64748b;font-size:13px">ZKandhavel Infotech Pvt. Ltd. | GST: 33AABCZ1234A1Z5</p>
      </div>
    `,
  })
}
