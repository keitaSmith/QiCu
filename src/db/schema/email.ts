import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { bookings } from './bookings'
import { patients } from './patients'
import { practitioners } from './practitioners'

export const emailLogs = pgTable(
  'email_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    patientId: uuid('patient_id').references(() => patients.id),
    bookingId: uuid('booking_id').references(() => bookings.id),
    recipientEmail: text('recipient_email').notNull(),
    emailType: text('email_type').notNull(),
    status: text('status').notNull(),
    providerMessageId: text('provider_message_id'),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('email_logs_practitioner_created_at_idx').on(table.practitionerId, table.createdAt),
    index('email_logs_booking_id_idx').on(table.bookingId),
    check('email_logs_status_check', sql`${table.status} in ('pending', 'sent', 'failed', 'skipped')`),
  ],
)
