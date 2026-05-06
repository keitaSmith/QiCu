import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { practitioners } from './practitioners'

export const googleIntegrations = pgTable(
  'google_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    connected: boolean('connected').notNull().default(false),
    googleUserEmail: text('google_user_email'),
    selectedCalendarId: text('selected_calendar_id'),
    selectedCalendarName: text('selected_calendar_name'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiry: timestamp('token_expiry', { withTimezone: true }),
    lastError: text('last_error'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('google_integrations_practitioner_id_unique').on(table.practitionerId),
    index('google_integrations_practitioner_id_idx').on(table.practitionerId),
  ],
)

export const oauthStates = pgTable(
  'oauth_states',
  {
    state: text('state').primaryKey(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  table => [
    index('oauth_states_expires_at_idx').on(table.expiresAt),
    check('oauth_states_expires_at_check', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
)
