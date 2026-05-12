export type AuthEnforcementMode = 'strict' | 'legacy'

export function isProductionLikeEnvironment(env = process.env) {
  return env.NODE_ENV === 'production'
}

export function isStrictAuthEnforcementEnabled(env = process.env) {
  return env.QICU_AUTH_ENFORCEMENT === 'strict' || isProductionLikeEnvironment(env)
}

export function isDemoFallbackAllowed(env = process.env) {
  return !isStrictAuthEnforcementEnabled(env)
}

export function getAuthEnforcementMode(env = process.env): AuthEnforcementMode {
  return isStrictAuthEnforcementEnabled(env) ? 'strict' : 'legacy'
}
