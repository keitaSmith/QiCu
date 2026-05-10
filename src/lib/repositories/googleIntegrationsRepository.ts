import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { googleIntegrations, oauthStates } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import {
  decryptGoogleToken,
  encryptGoogleToken,
} from '@/lib/google/googleTokenEncryption'
import {
  consumeGoogleOAuthState,
  createGoogleOAuthState,
  disconnectGoogleIntegration,
  getGoogleIntegration,
  saveGoogleIntegration,
} from '@/lib/google/store'
import type { GoogleIntegrationRecord } from '@/lib/google/types'

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const TOKEN_EXPIRY_SKEW_MS = 30_000

export type GoogleIntegrationStatus = {
  connected: boolean
  googleUserEmail?: string
  selectedCalendarId?: string
  selectedCalendarName?: string
  lastError: string | null
}

type OAuthStateRecord = {
  practitionerId: string
  createdAt: number
}

type OAuthStateOptions = {
  now?: Date
  ttlMs?: number
}

type GoogleIntegrationRow = typeof googleIntegrations.$inferSelect

function toDatabasePractitionerId(practitionerId: string) {
  return demoPractitionerIds[practitionerId as keyof typeof demoPractitionerIds] ?? practitionerId
}

function toPublicPractitionerId(practitionerId: string) {
  const publicId = Object.entries(demoPractitionerIds).find(
    ([, databaseId]) => databaseId === practitionerId,
  )?.[0]
  return publicId ?? practitionerId
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch (error) {
    if (isTokenSecurityError(error)) throw error
    return fallback()
  }
}

export function getIntegration(practitionerId: string) {
  return getGoogleIntegration(practitionerId)
}

function hasUsableRuntimeTokens(integration: GoogleIntegrationRecord) {
  return Boolean(integration.connected && integration.accessToken)
}

function isTokenSecurityError(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('GOOGLE_TOKEN_ENCRYPTION_KEY') ||
      error.message.includes('Google token ciphertext payload')
    )
  )
}

function dateFromTokenExpiry(tokenExpiry?: number | null) {
  return typeof tokenExpiry === 'number' ? new Date(tokenExpiry) : null
}

function tokenExpiryFromDate(tokenExpiry?: Date | null) {
  return tokenExpiry ? tokenExpiry.getTime() : undefined
}

function encryptedTokensLookUsable(row: GoogleIntegrationRow) {
  if (!row.connected || !row.accessTokenEncrypted) return false

  try {
    decryptGoogleToken(row.accessTokenEncrypted)
    const expiresSoon =
      row.tokenExpiry && row.tokenExpiry.getTime() <= Date.now() + TOKEN_EXPIRY_SKEW_MS
    if (expiresSoon) {
      if (!row.refreshTokenEncrypted) return false
      decryptGoogleToken(row.refreshTokenEncrypted)
    }
    return true
  } catch {
    return false
  }
}

function toRuntimeIntegrationFromDb(row: GoogleIntegrationRow): GoogleIntegrationRecord {
  if (!row.connected || !row.accessTokenEncrypted) {
    return {
      practitionerId: toPublicPractitionerId(row.practitionerId),
      connected: false,
      googleUserEmail: row.googleUserEmail ?? undefined,
      selectedCalendarId: row.selectedCalendarId ?? undefined,
      selectedCalendarName: row.selectedCalendarName ?? undefined,
      lastError: row.lastError ?? null,
      connectedAt: row.connectedAt?.toISOString(),
    }
  }

  return {
    practitionerId: toPublicPractitionerId(row.practitionerId),
    connected: true,
    googleUserEmail: row.googleUserEmail ?? undefined,
    accessToken: decryptGoogleToken(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted
      ? decryptGoogleToken(row.refreshTokenEncrypted)
      : undefined,
    tokenExpiry: tokenExpiryFromDate(row.tokenExpiry),
    selectedCalendarId: row.selectedCalendarId ?? undefined,
    selectedCalendarName: row.selectedCalendarName ?? undefined,
    lastError: row.lastError ?? null,
    connectedAt: row.connectedAt?.toISOString(),
  }
}

function statusFromRuntimeAndMetadata(
  runtimeIntegration: GoogleIntegrationRecord,
  metadata?: GoogleIntegrationRow | null,
): GoogleIntegrationStatus {
  const runtimeUsable = hasUsableRuntimeTokens(runtimeIntegration)
  const dbUsable = metadata ? encryptedTokensLookUsable(metadata) : false

  return {
    connected: runtimeUsable || dbUsable,
    googleUserEmail: runtimeIntegration.googleUserEmail ?? metadata?.googleUserEmail ?? undefined,
    selectedCalendarId: runtimeIntegration.selectedCalendarId ?? metadata?.selectedCalendarId ?? undefined,
    selectedCalendarName: runtimeIntegration.selectedCalendarName ?? metadata?.selectedCalendarName ?? undefined,
    lastError: runtimeIntegration.lastError ?? metadata?.lastError ?? null,
  }
}

export async function getStatus(practitionerId: string): Promise<GoogleIntegrationStatus> {
  const runtimeIntegration = getIntegration(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(googleIntegrations)
        .where(eq(googleIntegrations.practitionerId, toDatabasePractitionerId(practitionerId)))
        .limit(1)

      return statusFromRuntimeAndMetadata(runtimeIntegration, rows[0] ?? null)
    },
    () => statusFromRuntimeAndMetadata(runtimeIntegration),
  )
}

export async function getUsableIntegration(practitionerId: string) {
  const runtimeIntegration = getIntegration(practitionerId)
  if (hasUsableRuntimeTokens(runtimeIntegration)) return runtimeIntegration

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(googleIntegrations)
        .where(eq(googleIntegrations.practitionerId, toDatabasePractitionerId(practitionerId)))
        .limit(1)

      const row = rows[0]
      if (!row) return runtimeIntegration

      const dbIntegration = toRuntimeIntegrationFromDb(row)
      if (dbIntegration.connected && dbIntegration.accessToken) {
        saveGoogleIntegration(dbIntegration)
      }
      return dbIntegration
    },
    () => runtimeIntegration,
  )
}

export async function saveIntegration(
  practitionerId: string,
  input: Omit<GoogleIntegrationRecord, 'practitionerId'> & {
    practitionerId?: string
  },
) {
  const runtimeRecord = saveGoogleIntegration({
    ...input,
    practitionerId,
  })

  await runWithFallback(
    async () => {
      const now = new Date()
      const databasePractitionerId = toDatabasePractitionerId(practitionerId)
      const existingRows = await drizzleDb
        .select()
        .from(googleIntegrations)
        .where(eq(googleIntegrations.practitionerId, databasePractitionerId))
        .limit(1)
      const existing = existingRows[0]
      const accessTokenEncrypted = input.connected && input.accessToken
        ? encryptGoogleToken(input.accessToken)
        : null
      const refreshTokenEncrypted = input.connected
        ? input.refreshToken
          ? encryptGoogleToken(input.refreshToken)
          : existing?.refreshTokenEncrypted ?? null
        : null
      const metadata = {
        practitionerId: databasePractitionerId,
        connected: Boolean(input.connected),
        googleUserEmail: input.googleUserEmail ?? null,
        selectedCalendarId: input.selectedCalendarId ?? null,
        selectedCalendarName: input.selectedCalendarName ?? null,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiry: input.connected ? dateFromTokenExpiry(input.tokenExpiry) : null,
        lastError: input.lastError ?? null,
        connectedAt: input.connected
          ? input.connectedAt
            ? new Date(input.connectedAt)
            : now
          : null,
        updatedAt: now,
      }

      await drizzleDb
        .insert(googleIntegrations)
        .values(metadata)
        .onConflictDoUpdate({
          target: googleIntegrations.practitionerId,
          set: {
            connected: metadata.connected,
            googleUserEmail: metadata.googleUserEmail,
            selectedCalendarId: metadata.selectedCalendarId,
            selectedCalendarName: metadata.selectedCalendarName,
            accessTokenEncrypted: metadata.accessTokenEncrypted,
            refreshTokenEncrypted: metadata.refreshTokenEncrypted,
            tokenExpiry: metadata.tokenExpiry,
            lastError: metadata.lastError,
            connectedAt: metadata.connectedAt,
            updatedAt: metadata.updatedAt,
          },
        })
    },
    () => undefined,
  )

  return runtimeRecord
}

export async function saveSelectedCalendar(
  practitionerId: string,
  input: { calendarId: string; calendarName?: string },
) {
  const integration = await getUsableIntegration(practitionerId)
  return saveIntegration(practitionerId, {
    ...integration,
    connected: true,
    selectedCalendarId: input.calendarId,
    selectedCalendarName: input.calendarName?.trim() || input.calendarId,
  })
}

export function getSelectedCalendar(practitionerId: string) {
  const integration = getIntegration(practitionerId)
  if (!integration.selectedCalendarId) return null

  return {
    id: integration.selectedCalendarId,
    name: integration.selectedCalendarName ?? integration.selectedCalendarId,
  }
}

export async function disconnect(practitionerId: string) {
  disconnectGoogleIntegration(practitionerId)

  await runWithFallback(
    async () => {
      await drizzleDb
        .update(googleIntegrations)
        .set({
          connected: false,
          selectedCalendarId: null,
          selectedCalendarName: null,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenExpiry: null,
          lastError: null,
          connectedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(googleIntegrations.practitionerId, toDatabasePractitionerId(practitionerId)))
    },
    () => undefined,
  )
}

export async function createOAuthState(
  practitionerId: string,
  options: OAuthStateOptions = {},
) {
  const now = options.now ?? new Date()
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? OAUTH_STATE_TTL_MS))
  const state = crypto.randomUUID()

  return runWithFallback(
    async () => {
      await drizzleDb.transaction(async tx => {
        await tx
          .delete(oauthStates)
          .where(
            or(
              lt(oauthStates.expiresAt, now),
              isNotNull(oauthStates.consumedAt),
            ),
          )

        await tx.insert(oauthStates).values({
          state,
          practitionerId: toDatabasePractitionerId(practitionerId),
          createdAt: now,
          expiresAt,
          consumedAt: null,
        })
      })

      return state
    },
    () => createGoogleOAuthState(practitionerId, options),
  )
}

export async function consumeOAuthState(
  state: string,
  options: Pick<OAuthStateOptions, 'now'> = {},
): Promise<OAuthStateRecord | undefined> {
  const now = options.now ?? new Date()

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .update(oauthStates)
        .set({ consumedAt: now })
        .where(
          and(
            eq(oauthStates.state, state),
            isNull(oauthStates.consumedAt),
            gt(oauthStates.expiresAt, now),
          ),
        )
        .returning({
          practitionerId: oauthStates.practitionerId,
          createdAt: oauthStates.createdAt,
        })

      const consumed = rows[0]
      if (!consumed) return undefined

      return {
        practitionerId: toPublicPractitionerId(consumed.practitionerId),
        createdAt: consumed.createdAt.getTime(),
      }
    },
    () => consumeGoogleOAuthState(state, options),
  )
}
