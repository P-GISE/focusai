const SESSION_CREATED_AT_MAX_FUTURE_MS = 5 * 60 * 1000
const SESSION_CREATED_AT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function parseClientDate(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : Number.NaN,
  )

  return Number.isNaN(parsed.valueOf()) ? null : parsed
}

export function resolveSessionCreatedAt(value: unknown, now = new Date()) {
  const parsed = parseClientDate(value)

  if (!parsed) {
    return now
  }

  const deltaMs = parsed.getTime() - now.getTime()

  if (deltaMs > SESSION_CREATED_AT_MAX_FUTURE_MS) {
    return now
  }

  if (Math.abs(deltaMs) > SESSION_CREATED_AT_MAX_AGE_MS) {
    return now
  }

  return parsed
}
