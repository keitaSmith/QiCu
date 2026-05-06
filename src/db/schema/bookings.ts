import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { deletionGroups } from './deletionGroups'
import { patients } from './patients'
import { practitioners } from './practitioners'
import { services } from './services'

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    serviceDurationMinutes: integer('service_duration_minutes').notNull(),
    resource: text('resource'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: text('status').notNull(),
    statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }),
    notes: text('notes'),
    externalSource: text('external_source'),
    externalCalendarId: text('external_calendar_id'),
    externalEventId: text('external_event_id'),
    externalSyncStatus: text('external_sync_status'),
    externalLastSyncedAt: timestamp('external_last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    uniqueIndex('bookings_practitioner_code_unique').on(table.practitionerId, table.code),
    index('bookings_practitioner_time_idx').on(table.practitionerId, table.startAt, table.endAt),
    index('bookings_practitioner_status_deleted_idx').on(
      table.practitionerId,
      table.status,
      table.deletedAt,
    ),
    index('bookings_practitioner_patient_idx').on(table.practitionerId, table.patientId),
    index('bookings_external_event_idx').on(table.externalSource, table.externalEventId),
    index('bookings_availability_blocking_idx')
      .on(table.practitionerId, table.startAt, table.endAt)
      .where(sql`${table.deletedAt} is null and ${table.status} in ('confirmed', 'pending')`),
    check(
      'bookings_status_check',
      sql`${table.status} in ('confirmed', 'pending', 'in-progress', 'cancelled', 'completed', 'no-show')`,
    ),
    check(
      'bookings_external_source_check',
      sql`${table.externalSource} is null or ${table.externalSource} in ('google')`,
    ),
    check(
      'bookings_external_sync_status_check',
      sql`${table.externalSyncStatus} is null or ${table.externalSyncStatus} in ('imported', 'synced', 'pending', 'error')`,
    ),
    check('bookings_time_order_check', sql`${table.endAt} > ${table.startAt}`),
    check('bookings_service_duration_minutes_check', sql`${table.serviceDurationMinutes} > 0`),
    check(
      'bookings_deletion_type_check',
      sql`${table.deletionType} is null or ${table.deletionType} in ('patient-data', 'booking', 'session', 'service')`,
    ),
    check(
      'bookings_restore_window_check',
      sql`${table.restoreUntil} is null or ${table.deletedAt} is null or ${table.restoreUntil} > ${table.deletedAt}`,
    ),
  ],
)
