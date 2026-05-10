import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { users } from './users'

export const practitioners = pgTable(
  'practitioners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    displayName: text('display_name').notNull(),
    email: text('email'),
    initials: text('initials'),
    avatarUrl: text('avatar_url'),
    icon: text('icon'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('practitioners_user_id_idx').on(table.userId),
    uniqueIndex('practitioners_user_id_unique').on(table.userId).where(sql`${table.userId} is not null`),
  ],
)
