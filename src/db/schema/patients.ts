import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { deletionGroups } from './deletionGroups'
import { practitioners } from './practitioners'

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: text('public_id'),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    active: boolean('active').notNull().default(true),
    firstName: text('first_name'),
    lastName: text('last_name'),
    displayName: text('display_name').notNull(),
    birthDate: date('birth_date'),
    gender: text('gender'),
    phone: text('phone'),
    email: text('email'),
    preferredLanguage: text('preferred_language'),
    fhirJson: jsonb('fhir_json').$type<Record<string, unknown>>(),
    searchText: text('search_text'),
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
    uniqueIndex('patients_practitioner_public_id_unique').on(table.practitionerId, table.publicId),
    index('patients_practitioner_id_idx').on(table.practitionerId),
    index('patients_practitioner_active_idx').on(table.practitionerId, table.active),
    index('patients_practitioner_deleted_at_idx').on(table.practitionerId, table.deletedAt),
    check(
      'patients_gender_check',
      sql`${table.gender} is null or ${table.gender} in ('male', 'female', 'other', 'prefer_not_to_say')`,
    ),
    check(
      'patients_deletion_type_check',
      sql`${table.deletionType} is null or ${table.deletionType} in ('patient-data', 'booking', 'session', 'service')`,
    ),
    check(
      'patients_restore_window_check',
      sql`${table.restoreUntil} is null or ${table.deletedAt} is null or ${table.restoreUntil} > ${table.deletedAt}`,
    ),
  ],
)
