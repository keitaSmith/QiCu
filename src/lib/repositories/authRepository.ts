import { and, eq, gt, isNull } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { authSessions, passwordCredentials, practitioners, users } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'

type SessionMetadata = {
  userAgent?: string | null
  ipHash?: string | null
}

const databasePractitionerIdToPublicId = Object.fromEntries(
  Object.entries(demoPractitionerIds).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>

export async function getUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const rows = await drizzleDb
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)

  return rows[0] ?? null
}

export async function createPasswordCredential(userId: string, passwordHash: string, algorithm: string) {
  const rows = await drizzleDb
    .insert(passwordCredentials)
    .values({
      userId,
      passwordHash,
      passwordAlgorithm: algorithm,
      passwordChangedAt: new Date(),
    })
    .returning()

  return rows[0] ?? null
}

export async function getPasswordCredentialByUserId(userId: string) {
  const rows = await drizzleDb
    .select()
    .from(passwordCredentials)
    .where(eq(passwordCredentials.userId, userId))
    .limit(1)

  return rows[0] ?? null
}

export async function createAuthSession(
  userId: string,
  sessionTokenHash: string,
  expiresAt: Date,
  metadata: SessionMetadata = {},
) {
  const rows = await drizzleDb
    .insert(authSessions)
    .values({
      userId,
      sessionTokenHash,
      expiresAt,
      userAgent: metadata.userAgent ?? null,
      ipHash: metadata.ipHash ?? null,
      lastSeenAt: new Date(),
    })
    .returning()

  return rows[0] ?? null
}

export async function getValidAuthSessionByTokenHash(sessionTokenHash: string, now = new Date()) {
  const rows = await drizzleDb
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.sessionTokenHash, sessionTokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

export async function getValidAuthSessionContextByTokenHash(sessionTokenHash: string, now = new Date()) {
  const rows = await drizzleDb
    .select({
      session: authSessions,
      user: users,
      practitionerId: practitioners.id,
      practitionerName: practitioners.displayName,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .leftJoin(practitioners, eq(practitioners.userId, users.id))
    .where(
      and(
        eq(authSessions.sessionTokenHash, sessionTokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return {
    session: row.session,
    user: row.user,
    practitioner: row.practitionerId
      ? {
          id: databasePractitionerIdToPublicId[row.practitionerId] ?? null,
          name: row.practitionerName ?? '',
        }
      : null,
  }
}

export async function touchAuthSession(sessionTokenHash: string) {
  await drizzleDb
    .update(authSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(authSessions.sessionTokenHash, sessionTokenHash))
}

export async function revokeAuthSession(sessionTokenHash: string) {
  const rows = await drizzleDb
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.sessionTokenHash, sessionTokenHash), isNull(authSessions.revokedAt)))
    .returning()

  return rows[0] ?? null
}

export async function revokeAllUserSessions(userId: string) {
  return drizzleDb
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
    .returning()
}
