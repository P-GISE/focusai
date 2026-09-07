export const PASSWORD_POLICY_MESSAGE =
  'Password must be 10-72 characters and include at least two of lowercase, uppercase, number, or symbol.'

const COMMON_WEAK_PATTERNS = [
  /^password\d*$/,
  /^qwerty\d*$/,
  /^letmein\d*$/,
  /^admin\d*$/,
  /^welcome\d*$/,
  /^(focusai)+$/,
]

function countCharacterClasses(password: string) {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length
}

export function validatePasswordStrength(password: string) {
  const normalized = password.trim()
  const comparable = normalized.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (normalized.length < 10 || normalized.length > 72) {
    return { valid: false, message: PASSWORD_POLICY_MESSAGE }
  }

  if (!normalized || new Set(normalized).size === 1) {
    return { valid: false, message: PASSWORD_POLICY_MESSAGE }
  }

  if (countCharacterClasses(normalized) < 2) {
    return { valid: false, message: PASSWORD_POLICY_MESSAGE }
  }

  if (COMMON_WEAK_PATTERNS.some((pattern) => pattern.test(comparable))) {
    return { valid: false, message: PASSWORD_POLICY_MESSAGE }
  }

  return { valid: true, message: PASSWORD_POLICY_MESSAGE }
}
