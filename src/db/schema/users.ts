import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    authProvider: text('auth_provider'),
    authProviderUserId: text('auth_provider_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_auth_provider_user_id_unique').on(
      table.authProvider,
      table.authProviderUserId,
    ),
  ],
)
