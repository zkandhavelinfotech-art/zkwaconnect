import { metaGraph } from "@/lib/meta/graph"

type SubscribedApps = { data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] }

// Meta only delivers a WABA's message webhooks to apps subscribed to that WABA.
export async function isWabaSubscribed(wabaId: string, accessToken: string) {
  const result = await metaGraph<SubscribedApps>(`${wabaId}/subscribed_apps`, accessToken)
  const appId = process.env.META_APP_ID
  const apps = (result.data || []).map(item => item.whatsapp_business_api_data).filter(Boolean)
  return { subscribed: apps.some(app => app?.id === appId), apps: apps.map(app => ({ id: app?.id || "", name: app?.name || "" })) }
}

export async function subscribeWaba(wabaId: string, accessToken: string) {
  await metaGraph<{ success?: boolean }>(`${wabaId}/subscribed_apps`, accessToken, { method: "POST" })
}
