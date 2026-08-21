import { Twilio } from 'twilio'

function getClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio credentials not configured')
  return new Twilio(sid, token)
}

export async function sendSMS(to: string, body: string): Promise<string> {
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) throw new Error('TWILIO_PHONE_NUMBER not configured')
  const client = getClient()
  const msg = await client.messages.create({ to, from, body })
  return msg.sid
}

export async function sendLeadAlert(opts: {
  ownerPhone: string
  leadName: string
  phone: string
  category: string
  message: string
}) {
  const body = [
    `🎯 New Lead — ZKWAConnect`,
    `Name: ${opts.leadName || 'Unknown'}`,
    `Phone: ${opts.phone}`,
    `Category: ${opts.category}`,
    `Message: ${opts.message?.substring(0, 100) || '—'}`,
  ].join('\n')
  return sendSMS(opts.ownerPhone, body)
}
