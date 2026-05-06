import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { bookings } from './bookings'
import { deletionGroups } from './deletionGroups'
import { patients } from './patients'
import { practitioners } from './practitioners'
import { services } from './services'

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    serviceName: text('service_name'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    chiefComplaint: text('chief_complaint').notNull(),
    treatmentSummary: text('treatment_summary'),
    outcome: text('outcome'),
    treatmentNotes: text('treatment_notes'),
    painScore: integer('pain_score'),
    tcmDiagnosis: text('tcm_diagnosis'),
    tcmFindings: jsonb('tcm_findings').$type<Record<string, unknown>>(),
    pointsUsed: text('points_used').array(),
    techniques: text('techniques').array(),
    basicVitals: jsonb('basic_vitals').$type<Record<string, unknown>>(),
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
    index('sessions_practitioner_patient_idx').on(table.practitionerId, table.patientId),
    index('sessions_practitioner_booking_idx').on(table.practitionerId, table.bookingId),
    index('sessions_practitioner_deleted_at_idx').on(table.practitionerId, table.deletedAt),
    check('sessions_pain_score_check', sql`${table.painScore} is null or ${table.painScore} between 0 and 10`),
    check(
      'sessions_deletion_type_check',
      sql`${table.deletionType} is null or ${table.deletionType} in ('patient-data', 'booking', 'session', 'service')`,
    ),
    check(
      'sessions_restore_window_check',
      sql`${table.restoreUntil} is null or ${table.deletedAt} is null or ${table.restoreUntil} > ${table.deletedAt}`,
    ),
  ],
)
