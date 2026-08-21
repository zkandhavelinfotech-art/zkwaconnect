import axios from 'axios'

const GRAPH = 'https://graph.facebook.com'

function client(version = 'v20.0') {
  return axios.create({ baseURL: `${GRAPH}/${version}` })
}

export async function sendTextMessage(phoneId: string, token: string, to: string, text: string, version = 'v20.0') {
  const { data } = await client(version).post(
    `/${phoneId}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data
}

export async function sendTemplateMessage(
  phoneId: string, token: string, to: string,
  templateName: string, languageCode: string,
  components: any[] = [], version = 'v20.0'
) {
  const { data } = await client(version).post(
    `/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data
}

export async function markMessageRead(phoneId: string, token: string, messageId: string, version = 'v20.0') {
  const { data } = await client(version).post(
    `/${phoneId}/messages`,
    { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data
}

export async function getPhoneNumberInfo(phoneId: string, token: string, version = 'v20.0') {
  const { data } = await client(version).get(
    `/${phoneId}?fields=display_phone_number,verified_name,quality_rating,status`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data
}

export async function submitTemplate(
  wabaId: string, token: string,
  name: string, category: string, language: string,
  components: any[], version = 'v20.0'
) {
  const { data } = await client(version).post(
    `/${wabaId}/message_templates`,
    { name, category, language, components },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data
}
