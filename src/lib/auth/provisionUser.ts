export type CreateAuthUserInput = {
  email: string
  password: string
  name: string
  practitionerId: string
  allowRelink: boolean
}

export type ProvisionedAuthUser = {
  email: string
  name: string
  practitionerId: string
  practitionerName: string
}

export async function provisionAuthUser(input: CreateAuthUserInput): Promise<ProvisionedAuthUser> {
  const [{ and, eq, ne }, client, schema, password, ids] = await Promise.all([
    import('drizzle-orm'),
    import('@/db/client'),
    import('@/db/schema'),
    import('@/lib/auth/password'),
    import('@/db/seeds/ids'),
  ])

  const normalizedInput = {
    ...input,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    practitionerId: input.practitionerId.trim(),
  }

  const targetPractitionerDatabaseId =
    ids.demoPractitionerIds[normalizedInput.practitionerId as keyof typeof ids.demoPractitionerIds]

  if (!targetPractitionerDatabaseId) {
    throw new Error(`Unknown practitioner public ID: ${normalizedInput.practitionerId}`)
  }

  const { drizzleDb } = client
  const { passwordCredentials, practitioners, users } = schema

  const passwordResult = await password.hashPassword(normalizedInput.password)
  const now = new Date()

  return drizzleDb.transaction(async (tx) => {
    const [targetPractitioner] = await tx
      .select()
      .from(practitioners)
      .where(eq(practitioners.id, targetPractitionerDatabaseId))
      .limit(1)

    if (!targetPractitioner) {
      throw new Error(`Practitioner ${normalizedInput.practitionerId} was not found in the database.`)
    }

    const existingUsers = await tx
      .select()
      .from(users)
      .where(eq(users.email, normalizedInput.email))
      .limit(1)

    const existingUser = existingUsers[0] ?? null

    if (existingUser) {
      const [existingUserPractitioner] = await tx
        .select()
        .from(practitioners)
        .where(eq(practitioners.userId, existingUser.id))
        .limit(1)

      if (
        existingUserPractitioner &&
        existingUserPractitioner.id !== targetPractitionerDatabaseId &&
        !normalizedInput.allowRelink
      ) {
        throw new Error(
          `User ${normalizedInput.email} is already linked to practitioner ${
            existingUserPractitioner.displayName ?? existingUserPractitioner.id
          }. Re-run with QICU_CREATE_USER_ALLOW_RELINK=true to move the link.`,
        )
      }
    }

    if (
      targetPractitioner.userId &&
      targetPractitioner.userId !== existingUser?.id &&
      !normalizedInput.allowRelink
    ) {
      throw new Error(
        `Practitioner ${normalizedInput.practitionerId} is already linked to another user. Re-run with QICU_CREATE_USER_ALLOW_RELINK=true to relink it.`,
      )
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: normalizedInput.email,
        name: normalizedInput.name,
        authProvider: 'password',
        authProviderUserId: normalizedInput.email,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: normalizedInput.name,
          authProvider: 'password',
          authProviderUserId: normalizedInput.email,
          updatedAt: now,
        },
      })
      .returning()

    if (!user) {
      throw new Error('Failed to create or update the auth user.')
    }

    await tx
      .insert(passwordCredentials)
      .values({
        userId: user.id,
        passwordHash: passwordResult.hash,
        passwordAlgorithm: passwordResult.algorithm,
        passwordChangedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: passwordCredentials.userId,
        set: {
          passwordHash: passwordResult.hash,
          passwordAlgorithm: passwordResult.algorithm,
          passwordChangedAt: now,
          updatedAt: now,
        },
      })

    if (normalizedInput.allowRelink) {
      await tx
        .update(practitioners)
        .set({ userId: null, updatedAt: now })
        .where(and(eq(practitioners.userId, user.id), ne(practitioners.id, targetPractitionerDatabaseId)))

      await tx
        .update(practitioners)
        .set({ userId: null, updatedAt: now })
        .where(and(eq(practitioners.id, targetPractitionerDatabaseId), ne(practitioners.userId, user.id)))
    }

    await tx
      .update(practitioners)
      .set({ userId: user.id, updatedAt: now })
      .where(eq(practitioners.id, targetPractitionerDatabaseId))

    return {
      email: user.email,
      name: user.name ?? normalizedInput.name,
      practitionerId: normalizedInput.practitionerId,
      practitionerName: targetPractitioner.displayName,
    }
  })
}
