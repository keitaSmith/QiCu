import { jsonb, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { practitioners } from './practitioners'
import { users } from './users'

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorPractitionerId: uuid('actor_practitioner_id').references(() => practitioners.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('audit_events_practitioner_created_at_idx').on(table.practitionerId, table.createdAt),
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
  ],
)
