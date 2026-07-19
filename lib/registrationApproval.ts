import { createHmac, timingSafeEqual } from 'crypto'

type ApprovalPayload = {
  userId: string
  expiresAt: number
}

function signingSecret() {
  const secret = process.env.APPROVAL_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Freigabe-Link ist nicht konfiguriert.')
  return secret
}

function signature(payload: string) {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url')
}

export function createApprovalToken(userId: string) {
  const payload: ApprovalPayload = {
    userId,
    expiresAt: Date.now() + 48 * 60 * 60 * 1000
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyApprovalToken(token: string | null | undefined): ApprovalPayload | null {
  if (!token) return null
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return null

  const expectedSignature = signature(encoded)
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ApprovalPayload
    if (!payload.userId || !payload.expiresAt || payload.expiresAt < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function applicationUrl(requestUrl: string) {
  const configuredUrl = process.env.APP_URL?.trim()
  if (configuredUrl) return configuredUrl.replace(/\/$/, '')

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`

  return new URL(requestUrl).origin
}
