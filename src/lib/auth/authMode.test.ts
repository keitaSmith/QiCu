import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getAuthEnforcementMode,
  isDemoFallbackAllowed,
  isProductionLikeEnvironment,
  isStrictAuthEnforcementEnabled,
} from './authMode'

test('production defaults to strict auth even when QICU_AUTH_ENFORCEMENT is missing', () => {
  const env = {
    NODE_ENV: 'production',
  } as NodeJS.ProcessEnv

  assert.equal(isProductionLikeEnvironment(env), true)
  assert.equal(isStrictAuthEnforcementEnabled(env), true)
  assert.equal(isDemoFallbackAllowed(env), false)
  assert.equal(getAuthEnforcementMode(env), 'strict')
})

test('development keeps legacy/demo fallback when strict auth is not enabled', () => {
  const env = {
    NODE_ENV: 'development',
  } as NodeJS.ProcessEnv

  assert.equal(isProductionLikeEnvironment(env), false)
  assert.equal(isStrictAuthEnforcementEnabled(env), false)
  assert.equal(isDemoFallbackAllowed(env), true)
  assert.equal(getAuthEnforcementMode(env), 'legacy')
})

test('strict auth env disables demo fallback outside production too', () => {
  const env = {
    NODE_ENV: 'test',
    QICU_AUTH_ENFORCEMENT: 'strict',
  } as NodeJS.ProcessEnv

  assert.equal(isProductionLikeEnvironment(env), false)
  assert.equal(isStrictAuthEnforcementEnabled(env), true)
  assert.equal(isDemoFallbackAllowed(env), false)
  assert.equal(getAuthEnforcementMode(env), 'strict')
})
