import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { deletionGroups } from './deletionGroups'
import { practitioners } from './practitioners'

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: text('public_id'),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    name: text('name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    priceCents: integer('price_cents'),
    currency: text('currency'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    restoreUntil: timestamp('restore_until', { withTimezone: true }),
    deletedByPractitionerId: uuid('deleted_by_practitioner_id').references(
      () => practitioners.id,
    ),
    deletionGroupId: uuid('deletion_group_id').references(() => deletionGroups.id),
    deletionType: text('deletion_type'),
    deletionReason: text('deletion_reason'),
  },
  table => [
    uniqueIndex('services_public_id_unique').on(table.publicId),
    index('services_practitioner_active_idx').on(table.practitionerId, table.active),
    index('services_practitioner_deleted_at_idx').on(table.practitionerId, table.deletedAt),
    check('services_duration_minutes_check', sql`${table.durationMinutes} > 0`),
    check('services_price_cents_check', sql`${table.priceCents} is null or ${table.priceCents} >= 0`),
    check(
      'services_deletion_type_check',
      sql`${table.deletionType} is null or ${table.deletionType} in ('patient-data', 'booking', 'session', 'service')`,
    ),
    check(
      'services_restore_window_check',
      sql`${table.restoreUntil} is null or ${table.deletedAt} is null or ${table.restoreUntil} > ${table.deletedAt}`,
    ),
  ],
)
