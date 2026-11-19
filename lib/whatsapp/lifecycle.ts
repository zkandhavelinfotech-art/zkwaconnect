import { prisma } from "@/lib/db/prisma"
import { sanitizeMetaError, type SanitizedError } from "./error-sanitizer"

export type OnboardingStatus =
  | "NOT_STARTED"
  | "INITIATED"
  | "META_AUTH_PENDING"
  | "BUSINESS_SELECTION"
  | "WABA_CREATION_PENDING"
  | "PHONE_NUMBER_PENDING"
  | "OTP_VERIFICATION_PENDING"
  | "REGISTRATION_PENDING"
  | "DISPLAY_NAME_PENDING"
  | "CONNECTED"
  | "ACTION_REQUIRED"
  | "FAILED"
  | "MANUAL_REVIEW"
  | "SUSPENDED"

export type LifecycleSnapshot = {
  status: OnboardingStatus
  stepNumber: number // 1 to 6
  progressPercentage: number // 0 to 100
  title: string
  description: string
  nextAction: string
  isComplete: boolean
  hasError: boolean
  errorDetail: SanitizedError | null
  lastUpdated: Date
}

// Computes the authoritative 14-state lifecycle status for a customer workspace.
export async function getOnboardingLifecycle(organizationId: string): Promise<LifecycleSnapshot> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      wabas: {
        include: { phoneNumbers: true },
        orderBy: { createdAt: "desc" },
      },
      metaConnection: true,
      onboarding: true,
    },
  })

  if (!org) {
    return {
      status: "NOT_STARTED",
      stepNumber: 0,
      progressPercentage: 0,
      title: "Workspace Not Found",
      description: "Organization could not be loaded.",
      nextAction: "Sign in to your workspace.",
      isComplete: false,
      hasError: true,
      errorDetail: null,
      lastUpdated: new Date(),
    }
  }

  const activeWaba = org.wabas.find(w => w.status === "CONNECTED") || org.wabas[0] || null
  const activePhone = activeWaba?.phoneNumbers.find(p => p.status === "CONNECTED") || activeWaba?.phoneNumbers[0] || null
  const metaConn = org.metaConnection

  // 1. Fully Connected
  if (activeWaba?.status === "CONNECTED" && activePhone?.status === "CONNECTED") {
    const isDisplayNamePending = activePhone.verificationStatus === "CODE_VERIFIED" && !activePhone.displayName
    return {
      status: isDisplayNamePending ? "DISPLAY_NAME_PENDING" : "CONNECTED",
      stepNumber: 6,
      progressPercentage: 100,
      title: isDisplayNamePending ? "Display Name Under Review" : "WhatsApp Business API Connected",
      description: `Active phone ${activePhone.phoneNumber} is registered and verified on Meta Cloud API.`,
      nextAction: "You can start sending campaign broadcasts and live chats.",
      isComplete: true,
      hasError: false,
      errorDetail: null,
      lastUpdated: activePhone.updatedAt || new Date(),
    }
  }

  // 2. Phone Registered but PIN pending
  if (activeWaba && activePhone) {
    return {
      status: "REGISTRATION_PENDING",
      stepNumber: 5,
      progressPercentage: 80,
      title: "Phone Number Registration Pending",
      description: `Phone ${activePhone.phoneNumber} verified via OTP. Final 2-Step PIN registration pending.`,
      nextAction: "Click 'Register with 6-Digit PIN' to complete setup.",
      isComplete: false,
      hasError: false,
      errorDetail: null,
      lastUpdated: activePhone.updatedAt || new Date(),
    }
  }

  // 3. WABA created, phone pending
  if (activeWaba) {
    return {
      status: "PHONE_NUMBER_PENDING",
      stepNumber: 4,
      progressPercentage: 60,
      title: "Phone Number Verification Required",
      description: `WABA ${activeWaba.name} created. Enter a phone number to verify via SMS/Voice OTP.`,
      nextAction: "Complete phone OTP verification in Meta Embedded Signup.",
      isComplete: false,
      hasError: false,
      errorDetail: null,
      lastUpdated: activeWaba.updatedAt || new Date(),
    }
  }

  // 4. Meta OAuth Authorized, WABA pending
  if (metaConn?.status === "CONNECTED") {
    return {
      status: "BUSINESS_SELECTION",
      stepNumber: 2,
      progressPercentage: 35,
      title: "Business Portfolio & WABA Selection",
      description: "Facebook Login verified. Create or select a Business Portfolio.",
      nextAction: "Continue in Meta Embedded Signup.",
      isComplete: false,
      hasError: false,
      errorDetail: null,
      lastUpdated: metaConn.updatedAt || new Date(),
    }
  }

  // 5. Default Not Started
  return {
    status: "NOT_STARTED",
    stepNumber: 1,
    progressPercentage: 10,
    title: "Connect WhatsApp Business Account",
    description: "Launch Meta Embedded Signup v4 to connect in 5 minutes.",
    nextAction: "Click 'Connect WhatsApp Number'.",
    isComplete: false,
    hasError: false,
    errorDetail: null,
    lastUpdated: org.createdAt,
  }
}

// Records an immutable audit log entry for state transitions, diagnostics, and errors.
export async function recordLifecycleLog(input: {
  organizationId: string
  eventType: string
  statusFrom?: string
  statusTo: string
  rawError?: any
  sanitizedMessage?: string
}) {
  try {
    const errorInfo = input.rawError ? sanitizeMetaError(input.rawError) : null
    const payload = {
      eventType: input.eventType,
      statusFrom: input.statusFrom || "UNKNOWN",
      statusTo: input.statusTo,
      rawError: input.rawError ? JSON.stringify(input.rawError) : null,
      sanitizedMessage: input.sanitizedMessage || errorInfo?.clientMessage || null,
      timestamp: new Date().toISOString(),
    }

    // Record as audit event
    await prisma.webhookEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: `ONBOARDING_${input.eventType}`,
        payload,
      },
    })
  } catch (err: any) {
    console.error("[RECORD_LIFECYCLE_LOG_ERROR]", err?.message)
  }
}
