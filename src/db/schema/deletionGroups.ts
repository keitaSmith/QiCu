import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { practitioners } from './practitioners'

export const deletionGroups = pgTable(
  'deletion_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    deletionType: text('deletion_type').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull(),
    restoreUntil: timestamp('restore_until', { withTimezone: true }).notNull(),
    deletedByPractitionerId: uuid('deleted_by_practitioner_id').references(
      () => practitioners.id,
    ),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('deletion_groups_practitioner_restore_until_idx').on(
      table.practitionerId,
      table.restoreUntil,
    ),
    check(
      'deletion_groups_deletion_type_check',
      sql`${table.deletionType} in ('patient-data', 'booking', 'session', 'service')`,
    ),
    check('deletion_groups_restore_window_check', sql`${table.restoreUntil} > ${table.deletedAt}`),
  ],
)
