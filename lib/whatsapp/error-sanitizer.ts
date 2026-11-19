export type SanitizedError = {
  rawCode: string | number
  title: string
  clientMessage: string
  actionLabel: string
  actionUrl?: string
  retryable: boolean
  suggestedStatus: "ACTION_REQUIRED" | "FAILED" | "MANUAL_REVIEW" | "SUSPENDED"
}

// Meta Graph API error code sanitizer.
// Converts technical error codes into actionable, friendly customer instructions
// while preserving technical codes for administrator diagnostics.
export function sanitizeMetaError(error: any): SanitizedError {
  const code = error?.code || error?.error_subcode || error?.status || "UNKNOWN"
  const message = String(error?.message || error?.error_user_msg || error || "").toLowerCase()
  const errorSubcode = error?.error_subcode

  // 1. Phone number already registered / in use
  if (code === 133010 || errorSubcode === 133010 || message.includes("already registered") || message.includes("in use")) {
    return {
      rawCode: 133010,
      title: "Phone Number Already In Use",
      clientMessage: "This phone number is currently active on WhatsApp or WhatsApp Business on a mobile phone. Please delete the account from WhatsApp on your device before connecting it to Cloud API.",
      actionLabel: "How to Delete Account from Mobile",
      actionUrl: "https://faq.whatsapp.com/543202573678077",
      retryable: true,
      suggestedStatus: "ACTION_REQUIRED",
    }
  }

  // 2. Two-Factor Authentication PIN error
  if (code === 133004 || errorSubcode === 133004 || message.includes("pin")) {
    return {
      rawCode: 133004,
      title: "Two-Step Verification PIN Mismatch",
      clientMessage: "The 6-digit registration PIN provided does not match the existing Two-Step PIN on this number, or requires reset in Meta WhatsApp Manager.",
      actionLabel: "Reset 6-Digit PIN",
      retryable: true,
      suggestedStatus: "ACTION_REQUIRED",
    }
  }

  // 3. Rate limiting / Too many attempts
  if (code === 133006 || code === 4 || code === 17 || message.includes("rate limit") || message.includes("too many")) {
    return {
      rawCode: 133006,
      title: "Meta Rate Limit Exceeded",
      clientMessage: "Too many requests sent to Meta servers within a short interval. Automated backoff is active. Please retry in 5 minutes.",
      actionLabel: "Retry in 5 Minutes",
      retryable: true,
      suggestedStatus: "ACTION_REQUIRED",
    }
  }

  // 4. Token expired / invalid OAuth
  if (code === 190 || message.includes("token expired") || message.includes("session")) {
    return {
      rawCode: 190,
      title: "Facebook Authorization Session Expired",
      clientMessage: "Your Facebook Login session has expired or permissions were updated. Please click Re-authorize with Facebook to refresh your connection.",
      actionLabel: "Re-authorize with Facebook",
      retryable: true,
      suggestedStatus: "ACTION_REQUIRED",
    }
  }

  // 5. Permissions / Advanced access required
  if (code === 200 || code === 10 || message.includes("permission") || message.includes("access")) {
    return {
      rawCode: 200,
      title: "Asset Permission Access Required",
      clientMessage: "Your Meta Business Portfolio administrator must grant 'Full control' over WhatsApp Accounts to ZKWAConnect.",
      actionLabel: "Open Meta Business Suite",
      actionUrl: "https://business.facebook.com/latest/settings/partners",
      retryable: true,
      suggestedStatus: "MANUAL_REVIEW",
    }
  }

  // 6. Display name rejected / pending review
  if (message.includes("display name") || message.includes("name review")) {
    return {
      rawCode: "DISPLAY_NAME_REJECTED",
      title: "Display Name Under Meta Review",
      clientMessage: "The WhatsApp display name submitted does not match Meta's Business Name guidelines. You can continue sending messages or submit an updated name in Meta WhatsApp Manager.",
      actionLabel: "Review Name Guidelines",
      actionUrl: "https://www.facebook.com/business/help/953112282217684",
      retryable: true,
      suggestedStatus: "ACTION_REQUIRED",
    }
  }

  // 7. Account suspended / restricted
  if (code === 368 || message.includes("restricted") || message.includes("suspended") || message.includes("policy")) {
    return {
      rawCode: 368,
      title: "Account Policy Review Required",
      clientMessage: "Meta has placed a temporary restriction on this business portfolio. Please check Meta Business Support Home for policy compliance.",
      actionLabel: "Meta Business Support Home",
      actionUrl: "https://business.facebook.com/business-support-home",
      retryable: false,
      suggestedStatus: "SUSPENDED",
    }
  }

  // Generic fallback
  return {
    rawCode: code,
    title: "Connection Setup Required",
    clientMessage: error?.message || "An unexpected response occurred while synchronizing with Meta. Our automated diagnostic retry is ready.",
    actionLabel: "Retry Diagnostics",
    retryable: true,
    suggestedStatus: "ACTION_REQUIRED",
  }
}
