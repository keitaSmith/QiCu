# QiCu Database Schema Design

## Summary

This document defines QiCu's first durable PostgreSQL schema plan. The current app still uses in-memory TypeScript stores for patients, bookings, sessions, services, Google integration state, and Trash metadata. This design does not implement the database, migrations, repositories, authentication, or email behavior yet.

The schema is intentionally shaped for small practice management rather than enterprise hospital software. It preserves the current QiCu workflow: practitioners manage patients, services, bookings, session notes, Google Calendar workflows, and recoverable lifecycle actions from one scoped practice workspace.

## Design principles

- Practitioner-scoped data: every core record should either have `practitioner_id` directly or be clearly related to a practitioner-owned record.
- Archive is not delete: archive/disable removes a record from active workflow while preserving history.
- Trash is recoverable for 30 days: delete actions should set Trash metadata instead of hard-deleting immediately.
- Patient data deletion groups restore together: patient, booking, and session records moved to Trash together must restore transactionally.
- Historical records remain readable: bookings and sessions keep patient, service, and calendar context even when related records are archived, disabled, or trashed.
- Future auth must map cleanly to practitioner ownership: header-based prototype scoping should become auth/session-derived practitioner access without rewriting every table.
- Google sync identifiers must persist: external calendar IDs, event IDs, token metadata, and sync status must survive restarts.
- Transactions are required for grouped lifecycle operations: patient graph delete/restore, booking/session unlinking, and Trash purge must not partially apply.

## Entity overview

| Entity | Purpose | Notes |
| --- | --- | --- |
| `users` | Future authentication identity | Planned now so auth can map to practitioner ownership later. Not used by the prototype yet. |
| `practitioners` | Practice owner/profile | Replaces demo practitioners later. Owns patients, services, bookings, sessions, integrations, Trash, and audit records. |
| `patients` | FHIR-inspired patient profile | Stores direct indexed ownership and search fields plus richer FHIR JSON for the current flexible model. |
| `services` | Treatments/services offered by a practitioner | Disabled services stop appearing in new bookings; historical records keep snapshots. |
| `bookings` | Appointments | Stores service snapshots, booking status, patient relationship, and Google Calendar sync identifiers. Booking-to-session state is derived from `sessions.booking_id`. |
| `sessions` | Session records and clinical notes | Belongs to a patient and can optionally link to a booking through nullable canonical `booking_id`. |
| `deletion_groups` | Recoverable grouped Trash operations | Required for patient data deletion groups and transaction-safe group restore. |
| `google_integrations` | Google Calendar connection state | Stores selected calendar, encrypted tokens later, connection state, and sync errors. |
| `oauth_states` | Short-lived Google OAuth state | Protects OAuth callback flow. Could be a database table or short-lived cache. |
| `audit_events` | Lifecycle and workflow audit trail | Strongly recommended for archive, delete, restore, export, status, and sync actions. |
| `email_logs` | Future outbound email tracking | Planned as optional/future. Do not implement email behavior yet. |

## Proposed tables

### 1. `users`

Purpose: future authentication identity. This table is planned so a later auth phase does not require rethinking practitioner ownership.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `email` | `text` | Yes | Unique normalized email. |
| `name` | `text` | No | Display name from auth profile or local profile. |
| `auth_provider` | `text` | No | Example: `google`, `email`, `passwordless`. |
| `auth_provider_user_id` | `text` | No | Provider-specific stable subject. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |

Foreign keys: none.

Indexes and constraints:

- `primary key (id)`
- `unique (email)`
- Optional later: `unique (auth_provider, auth_provider_user_id)` where both are not null.

Future migration notes:

- Do not implement auth in the first persistence migration unless that phase is explicitly chosen.
- Existing `x-qicu-practitioner-id` scoping can continue during a transitional database phase.

### 2. `practitioners`

Purpose: practitioner/practice profile. This replaces `DEMO_PRACTITIONERS` when the app moves away from in-memory demo scoping.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. Current demo IDs can be mapped during seed import. |
| `user_id` | `uuid` | No | References `users(id)`. Nullable until auth exists. |
| `display_name` | `text` | Yes | Current demo field `name`. |
| `email` | `text` | No | Current demo field `email`; may duplicate user email during transition. |
| `initials` | `text` | No | Current demo UI field. |
| `avatar_url` | `text` | No | Current demo UI field. |
| `icon` | `text` | No | Current demo-only fallback icon such as `sparkles`. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |

Foreign keys:

- `user_id references users(id)` nullable.

Indexes and constraints:

- `primary key (id)`
- `index practitioners_user_id_idx (user_id)`
- Optional: `unique (user_id)` if one user owns one practitioner profile in the first auth model.

Future migration notes:

- `icon` is UI-friendly and may remain seed/dev only. Keep it nullable rather than designing UI state into auth.
- All core tables should reference `practitioners(id)`.

### 3. `patients`

Purpose: FHIR-inspired patient profile with direct practitioner ownership, lifecycle state, and indexed fields for normal app workflows.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. Existing string IDs can be mapped or preserved with a transitional import strategy. |
| `practitioner_id` | `uuid` | Yes | Direct owner. Replaces relying only on FHIR extension. |
| `active` | `boolean` | Yes | Defaults to `true`. `false` means archived/inactive, not trashed. |
| `first_name` | `text` | No | Indexed/display extraction from current FHIR `name`. |
| `last_name` | `text` | No | Indexed/display extraction from current FHIR `name`. |
| `display_name` | `text` | Yes | Current `displayName()` result. |
| `birth_date` | `date` | No | Current FHIR `birthDate`. |
| `gender` | `text` | No | Current FHIR gender values include `male`, `female`, `other`, `prefer_not_to_say`. |
| `phone` | `text` | No | Primary phone/mobile extracted from `telecom`. |
| `email` | `text` | No | Primary email extracted from `telecom`. |
| `preferred_language` | `text` | No | Extracted from `communication` when useful. |
| `fhir_json` | `jsonb` | No | Stores richer FHIR-like payload: meta, identifiers, address, communication, contact, extensions, etc. |
| `search_text` | `text` | No | Denormalized search field for name/email/phone. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |
| `archived_at` | `timestamptz` | No | Set when `active=false` through archive flow. |
| `deleted_at` | `timestamptz` | No | Trash metadata equivalent of `trashMetadata.deletedAt`. |
| `restore_until` | `timestamptz` | No | 30-day restore window end. |
| `deleted_by_practitioner_id` | `uuid` | No | References `practitioners(id)`. |
| `deletion_group_id` | `uuid` | No | References `deletion_groups(id)`. |
| `deletion_type` | `text` | No | Usually `patient-data` for patient graph deletes. |
| `deletion_reason` | `text` | No | Current optional `deletionReason`. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `deleted_by_practitioner_id references practitioners(id)`
- `deletion_group_id references deletion_groups(id)`

Indexes and constraints:

- `primary key (id)`
- `index patients_practitioner_id_idx (practitioner_id)`
- `index patients_practitioner_active_idx (practitioner_id, active)`
- `index patients_practitioner_deleted_at_idx (practitioner_id, deleted_at)`
- Optional later: full-text or trigram index on `search_text`.
- Check constraint: `deleted_at is null and restore_until is null and deletion_group_id is null` or all required Trash fields are present. This can be implemented after lifecycle writes are stable.

Future migration notes:

- Keep direct columns for app-critical fields and `fhir_json` for the flexible current FHIR model.
- Patient ownership should not depend only on the FHIR practitioner extension in the database.

### 4. `services`

Purpose: treatments/services used across bookings and sessions.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Owner. |
| `name` | `text` | Yes | Current service name. |
| `duration_minutes` | `integer` | Yes | Current duration field. |
| `description` | `text` | No | Current optional description. |
| `active` | `boolean` | Yes | Defaults to `true`. `false` means disabled for new bookings. |
| `price_cents` | `integer` | No | Future optional field; current app does not use pricing. |
| `currency` | `text` | No | Future optional field; pair with `price_cents` if pricing is introduced. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |
| `archived_at` | `timestamptz` | No | Set when disabled/archive action occurs. |
| `deleted_at` | `timestamptz` | No | Trash metadata. |
| `restore_until` | `timestamptz` | No | 30-day restore window end. |
| `deleted_by_practitioner_id` | `uuid` | No | References `practitioners(id)`. |
| `deletion_group_id` | `uuid` | No | References `deletion_groups(id)`. |
| `deletion_type` | `text` | No | Usually `service`. |
| `deletion_reason` | `text` | No | Optional lifecycle reason. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `deleted_by_practitioner_id references practitioners(id)`
- `deletion_group_id references deletion_groups(id)`

Indexes and constraints:

- `primary key (id)`
- `index services_practitioner_active_idx (practitioner_id, active)`
- `index services_practitioner_deleted_at_idx (practitioner_id, deleted_at)`
- Recommended duplicate prevention for active services: unique lowercased name plus duration per practitioner where `deleted_at is null`, if product rules keep that behavior.
- Check `duration_minutes > 0`.
- Check `price_cents is null or price_cents >= 0`.

Future migration notes:

- Disabled services should not appear in new booking flows.
- Bookings and sessions store `service_name` snapshots so history remains readable after service edits, disable, or Trash.

### 5. `bookings`

Purpose: appointments and calendar workflow records.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `code` | `text` | Yes | Human-friendly booking code. |
| `practitioner_id` | `uuid` | Yes | Owner and availability scope. |
| `patient_id` | `uuid` | Yes | References patient. |
| `service_id` | `uuid` | No | References service. Nullable so historical records survive service Trash/purge. |
| `service_name` | `text` | Yes | Snapshot at booking time. |
| `service_duration_minutes` | `integer` | Yes | Snapshot at booking time. |
| `resource` | `text` | No | Current optional room/practitioner/resource text. |
| `start_at` | `timestamptz` | Yes | Current model field `start`. |
| `end_at` | `timestamptz` | Yes | Current model field `end`. |
| `status` | `text` | Yes | Current booking statuses. |
| `status_updated_at` | `timestamptz` | No | Current `statusUpdatedAt`. |
| `notes` | `text` | No | Practitioner/reception notes. |
| `external_source` | `text` | No | Current value is `google` or null. |
| `external_calendar_id` | `text` | No | Google calendar ID. |
| `external_event_id` | `text` | No | Google event ID. |
| `external_sync_status` | `text` | No | Current values: `imported`, `synced`, `pending`, `error`. |
| `external_last_synced_at` | `timestamptz` | No | Current sync timestamp. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |
| `deleted_at` | `timestamptz` | No | Trash metadata. |
| `restore_until` | `timestamptz` | No | 30-day restore window end. |
| `deleted_by_practitioner_id` | `uuid` | No | References `practitioners(id)`. |
| `deletion_group_id` | `uuid` | No | References `deletion_groups(id)`. |
| `deletion_type` | `text` | No | `patient-data` for patient graph deletes or `booking` for individual booking delete. |
| `deletion_reason` | `text` | No | Optional lifecycle reason. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `patient_id references patients(id)`
- `service_id references services(id)` nullable. Prefer `on delete set null` if services can be purged after Trash.
- `deleted_by_practitioner_id references practitioners(id)`
- `deletion_group_id references deletion_groups(id)`

Indexes and constraints:

- `primary key (id)`
- `unique (practitioner_id, code)`
- `index bookings_practitioner_time_idx (practitioner_id, start_at, end_at)`
- `index bookings_practitioner_status_deleted_idx (practitioner_id, status, deleted_at)`
- `index bookings_practitioner_patient_idx (practitioner_id, patient_id)`
- `index bookings_external_event_idx (external_source, external_event_id)`
- Partial index for availability: `index bookings_availability_blocking_idx on bookings (practitioner_id, start_at, end_at) where deleted_at is null and status in ('confirmed', 'pending')`
- Check `end_at > start_at`.
- Check `service_duration_minutes > 0`.
- Check `status in ('confirmed', 'pending', 'in-progress', 'cancelled', 'completed', 'no-show')`.

Future migration notes:

- Only `confirmed` and `pending` block availability.
- `cancelled`, `no-show`, `completed`, and trashed bookings must not block availability.
- Cancelled bookings should not be rescheduled unless an explicit status-change flow is included in the same operation.
- Do not include `bookings.session_id` in the first database schema. Derive booking-to-session state from `sessions.booking_id` in repository queries. The API can still return a computed `sessionId` field during transition to avoid breaking current UI code.
- For stronger overlap enforcement later, consider a PostgreSQL range column or expression index with GiST/exclusion constraints scoped to blocking statuses. This is powerful but should be introduced carefully after the repository layer exists.

### 6. `sessions`

Purpose: session records and notes linked to patients and optionally bookings/services.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Owner. |
| `patient_id` | `uuid` | Yes | References patient. |
| `booking_id` | `uuid` | No | Nullable canonical link to booking. Null represents walk-in/no-booking sessions. Current direct booking delete clears this link unless the session is trashed in the same patient data group. |
| `service_id` | `uuid` | No | Optional service reference. |
| `service_name` | `text` | No | Snapshot for historical readability. |
| `start_at` | `timestamptz` | Yes | Current model field `startDateTime`. |
| `chief_complaint` | `text` | Yes | Current required session field. |
| `treatment_summary` | `text` | No | Current optional note field. |
| `outcome` | `text` | No | Current optional note field. |
| `treatment_notes` | `text` | No | Current optional note field. |
| `pain_score` | `integer` | No | Current optional pain score. |
| `tcm_diagnosis` | `text` | No | Current optional TCM diagnosis. |
| `tcm_findings` | `jsonb` | No | Current tongue/pulse findings object. |
| `points_used` | `text[]` | No | Current optional array. |
| `techniques` | `text[]` | No | Current optional array. |
| `basic_vitals` | `jsonb` | No | Current BP/heart rate/temperature object. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |
| `deleted_at` | `timestamptz` | No | Trash metadata. |
| `restore_until` | `timestamptz` | No | 30-day restore window end. |
| `deleted_by_practitioner_id` | `uuid` | No | References `practitioners(id)`. |
| `deletion_group_id` | `uuid` | No | References `deletion_groups(id)`. |
| `deletion_type` | `text` | No | `patient-data` or `session`. |
| `deletion_reason` | `text` | No | Optional lifecycle reason. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `patient_id references patients(id)`
- `booking_id references bookings(id)` nullable. Prefer `on delete set null` for eventual hard purge.
- `service_id references services(id)` nullable. Prefer `on delete set null` for eventual hard purge.
- `deleted_by_practitioner_id references practitioners(id)`
- `deletion_group_id references deletion_groups(id)`

Indexes and constraints:

- `primary key (id)`
- `index sessions_practitioner_patient_idx (practitioner_id, patient_id)`
- `index sessions_practitioner_booking_idx (practitioner_id, booking_id)`
- `index sessions_practitioner_deleted_at_idx (practitioner_id, deleted_at)`
- Check `pain_score between 0 and 10` when not null.

Future migration notes:

- Session belongs to a patient and can optionally link to a booking.
- `sessions.booking_id` is the physical database source of truth for booking/session linkage.
- Walk-in, after-hours, and no-booking visits are represented by `sessions.booking_id = null`.
- Preserve `service_name` even if `service_id` becomes null after service purge.
- Do not add `bookings.session_id` to the first schema. Repository/API code may compute a transitional booking `sessionId` field by querying sessions where `sessions.booking_id = bookings.id`.

### 7. `deletion_groups`

Purpose: top-level record for grouped recoverable Trash actions.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Owner/scope of the group. |
| `deletion_type` | `text` | Yes | Usually `patient-data`; may also support individual action groups if useful. |
| `deleted_at` | `timestamptz` | Yes | When group was moved to Trash. |
| `restore_until` | `timestamptz` | Yes | Usually `deleted_at + interval '30 days'`. |
| `deleted_by_practitioner_id` | `uuid` | No | Actor practitioner. |
| `reason` | `text` | No | Optional reason. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `deleted_by_practitioner_id references practitioners(id)`

Indexes and constraints:

- `primary key (id)`
- `index deletion_groups_practitioner_restore_until_idx (practitioner_id, restore_until)`
- Check `restore_until > deleted_at`.
- Check `deletion_type in ('patient-data', 'booking', 'session', 'service')`.

Future migration notes:

- Patient data delete should create one deletion group, then update patient, linked bookings, and linked sessions with that group ID in the same transaction.
- Restore should verify the group has not expired before restoring all linked records transactionally.

### 8. `google_integrations`

Purpose: durable Google Calendar connection and selected calendar state.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Unique owner. |
| `connected` | `boolean` | Yes | Defaults to `false`. |
| `google_user_email` | `text` | No | Current connected account email. |
| `selected_calendar_id` | `text` | No | Currently chosen calendar. |
| `selected_calendar_name` | `text` | No | Display name for selected calendar. |
| `access_token_encrypted` | `text` | No | Store encrypted token, not plaintext. |
| `refresh_token_encrypted` | `text` | No | Store encrypted refresh token, not plaintext. |
| `token_expiry` | `timestamptz` | No | Current `tokenExpiry` converted from milliseconds. |
| `last_error` | `text` | No | Last integration/sync error. |
| `connected_at` | `timestamptz` | No | Current connection time. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Yes | Maintained by app or trigger. |

Foreign keys:

- `practitioner_id references practitioners(id)`

Indexes and constraints:

- `primary key (id)`
- `unique (practitioner_id)`
- `index google_integrations_practitioner_id_idx (practitioner_id)`

Future migration notes:

- Encryption strategy must be chosen before storing real tokens.
- Consider provider table if non-Google integrations are added later; this design keeps the first schema focused.

### 9. `oauth_states`

Purpose: short-lived state records for Google OAuth.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `state` | `text` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Practitioner that started OAuth. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |
| `expires_at` | `timestamptz` | Yes | Short expiry. |
| `consumed_at` | `timestamptz` | No | Set on callback consume. |

Foreign keys:

- `practitioner_id references practitioners(id)`

Indexes and constraints:

- `primary key (state)`
- `index oauth_states_expires_at_idx (expires_at)`
- Check `expires_at > created_at`.

Future migration notes:

- A cache such as Redis can replace this table later. PostgreSQL is acceptable for the first durable implementation.

### 10. `audit_events`

Purpose: append-only audit trail for important lifecycle and workflow actions.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Practice scope. |
| `actor_user_id` | `uuid` | No | Future auth actor. |
| `actor_practitioner_id` | `uuid` | No | Current/future practitioner actor. |
| `entity_type` | `text` | Yes | Example: `patient`, `booking`, `session`, `service`, `deletion_group`. |
| `entity_id` | `uuid` | Yes | Target entity ID. |
| `action` | `text` | Yes | Action value. |
| `metadata` | `jsonb` | No | Impact counts, status changes, export metadata, sync details. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `actor_user_id references users(id)`
- `actor_practitioner_id references practitioners(id)`

Indexes and constraints:

- `primary key (id)`
- `index audit_events_practitioner_created_at_idx (practitioner_id, created_at)`
- `index audit_events_entity_idx (entity_type, entity_id)`

Planned actions:

- `patient_created`
- `patient_updated`
- `patient_archived`
- `patient_reactivated`
- `patient_data_moved_to_trash`
- `patient_exported`
- `deletion_group_restored`
- `booking_created`
- `booking_updated`
- `booking_status_changed`
- `booking_moved_to_trash`
- `session_created`
- `session_updated`
- `session_moved_to_trash`
- `service_created`
- `service_updated`
- `service_disabled`
- `service_moved_to_trash`
- `google_connected`
- `google_disconnected`
- `google_sync_error`

Future migration notes:

- Include this table in the schema plan. Its implementation can follow the core tables/repositories if the first migration scope must stay smaller, but lifecycle-sensitive actions should not be considered complete until audit writes exist.

### 11. `email_logs`

Purpose: future outbound email tracking. This is a planned table only; do not implement email behavior yet.

| Column | Type | Required? | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Yes | Primary key. |
| `practitioner_id` | `uuid` | Yes | Owner/scope. |
| `patient_id` | `uuid` | No | Optional recipient-related patient. |
| `booking_id` | `uuid` | No | Optional related booking. |
| `recipient_email` | `text` | Yes | Destination address. |
| `email_type` | `text` | Yes | Example future values: confirmation, cancellation, reminder. |
| `status` | `text` | Yes | `pending`, `sent`, `failed`, `skipped`. |
| `provider_message_id` | `text` | No | External provider ID. |
| `error_message` | `text` | No | Failure details. |
| `sent_at` | `timestamptz` | No | When sent. |
| `created_at` | `timestamptz` | Yes | Defaults to `now()`. |

Foreign keys:

- `practitioner_id references practitioners(id)`
- `patient_id references patients(id)`
- `booking_id references bookings(id)`

Indexes and constraints:

- `primary key (id)`
- `index email_logs_practitioner_created_at_idx (practitioner_id, created_at)`
- `index email_logs_booking_id_idx (booking_id)`
- Check `status in ('pending', 'sent', 'failed', 'skipped')`.

Future migration notes:

- Optional/future. It is useful to plan now because booking lifecycle events often need email auditability later, but QiCu should not add email behavior in the first database task.

## Enums / status values

Recommendation: use `text` columns with check constraints for early iteration. PostgreSQL enums are stricter but harder to change during product discovery. QiCu is still evolving status and sync vocabulary, so check constraints offer a good balance.

Recommended values:

- Booking status: `confirmed`, `pending`, `in-progress`, `cancelled`, `completed`, `no-show`
- Booking availability blocking statuses: `confirmed`, `pending`
- Booking availability non-blocking statuses: `cancelled`, `completed`, `no-show`, plus trashed records; `in-progress` should be reviewed before enforcing final availability semantics
- Deletion type: `patient-data`, `booking`, `session`, `service`
- External source: `google`; null means native/manual QiCu booking in the current model
- External sync status: `imported`, `synced`, `pending`, `error`
- Email status: `pending`, `sent`, `failed`, `skipped`
- Audit actions: use the planned action list in `audit_events`

Notes:

- Do not introduce `fulfilled` unless migrating legacy data that already uses it. Current QiCu uses `completed`.
- If PostgreSQL enums are chosen later, keep a migration playbook for adding values without downtime.

## Indexes

Required first-pass indexes:

- `patients(practitioner_id)`
- `patients(practitioner_id, active)`
- `patients(practitioner_id, deleted_at)`
- `bookings(practitioner_id, start_at, end_at)`
- `bookings(practitioner_id, status, deleted_at)`
- `bookings(practitioner_id, patient_id)`
- `bookings(external_source, external_event_id)`
- `sessions(practitioner_id, patient_id)`
- `sessions(practitioner_id, booking_id)`
- `services(practitioner_id, active)`
- `services(practitioner_id, deleted_at)`
- `deletion_groups(practitioner_id, restore_until)`
- `google_integrations(practitioner_id)`
- `audit_events(practitioner_id, created_at)`

Overlap query strategy:

- First implementation: query bookings by `practitioner_id`, overlapping `start_at/end_at`, `deleted_at is null`, and `status in ('confirmed', 'pending')`.
- Recommended partial index:

```sql
create index bookings_availability_blocking_idx
  on bookings (practitioner_id, start_at, end_at)
  where deleted_at is null and status in ('confirmed', 'pending');
```

- Later option: use `tstzrange(start_at, end_at, '[)')` with a GiST index or exclusion constraint. This should be introduced only once repository logic and transaction behavior are stable.

## Relationship rules

- A practitioner owns many patients, services, bookings, sessions, deletion groups, Google integrations, audit events, and email logs.
- A patient has many bookings.
- A patient has many sessions.
- A service can be referenced by bookings and sessions, but bookings and sessions also store service snapshots.
- A booking belongs to one patient and can have zero or one linked session in current product behavior.
- A session belongs to one patient and can link to zero or one booking through nullable `sessions.booking_id`.
- A deletion group can contain patients, bookings, sessions, and services through shared `deletion_group_id`.
- Google integration is one active integration record per practitioner for the first schema.
- Users are planned auth identities; practitioners may initially have nullable `user_id`.

## Architecture decision: booking/session relationship

Decision:

- Use `sessions.booking_id` as the canonical database relationship.
- Do not store `bookings.session_id` in the first database schema.
- Do not create a hard circular foreign key between bookings and sessions.

Reasoning:

- A session always belongs to a patient, but it may or may not come from a scheduled booking.
- Normal booked appointment flow: booking exists first, then the practitioner starts a session note from that booking.
- Walk-in, after-hours, and no-booking visits: practitioner creates a session directly for the patient with `sessions.booking_id = null`.
- Storing optional booking context on the session keeps the relationship with the record that needs it and avoids duplicated relationship state.

Current prototype compatibility:

- Current in-memory models include `booking.sessionId` and `session.bookingId`.
- Treat `booking.sessionId` as a prototype/API convenience field, not a database schema requirement.
- During migration, repository methods can return a computed `sessionId` field on booking API responses by looking up a session where `sessions.booking_id = bookings.id`.

Database implementation rule:

- The physical source of truth is `sessions.booking_id nullable references bookings(id)`.
- A booking can have zero or one linked session in current product behavior.
- A session can link to zero or one booking.
- If the product later supports multiple sessions per booking, `sessions.booking_id` supports that more naturally than a single `bookings.session_id` column.

API transition strategy:

- Keep the API shape stable where needed by computing `booking.sessionId` until the frontend is migrated to query linked sessions directly.
- Repository queries can expose a derived `sessionId` with a left join or a small lookup against `sessions`.
- Do not add a physical `bookings.session_id` column only to match the prototype shape.

Future flexibility:

- The canonical `sessions.booking_id` model supports walk-in sessions without special cases.
- It avoids duplicated state where `bookings.session_id` and `sessions.booking_id` disagree.
- It leaves room for future multiple-session-per-booking behavior with less schema churn.

Later tests needed:

- Session can be created with no `booking_id`.
- Session can be created with a valid `booking_id`.
- Booking API response can include computed `sessionId` when needed.
- Deleting/trashing a booking safely handles linked `sessions.booking_id`.
- Deleting/trashing a session does not corrupt the booking.
- Walk-in sessions remain valid and visible in patient/session history.

## Lifecycle field decisions

This section hardens the lifecycle design before database implementation. The table definitions above include the columns; these notes define how the fields should behave.

### Archive

- Archive is not delete and must not set `deleted_at`.
- Patients use `active = false` plus `archived_at` to represent archive state.
- Services use `active = false` plus `archived_at` to represent disabled/archive state.
- Archived patients are hidden from active patient workflows, but their profile remains readable for historical bookings, sessions, exports, and patient history views.
- Disabled services are hidden from new booking/service dropdown workflows, but the service definition remains available for historical context.
- Past bookings and sessions must remain meaningful when a patient is archived or a service is disabled.
- Do not add `archived_by_practitioner_id` or `archive_reason` columns in the first schema. Defer archive actor/reason details to `audit_events.metadata` so the core tables stay small while archive activity remains auditable.

### Trash metadata

Trash-enabled core records are `patients`, `bookings`, `sessions`, and `services`.

Each trashed record should carry:

- `deleted_at`
- `restore_until`
- `deleted_by_practitioner_id`
- `deletion_group_id`
- `deletion_type`
- `deletion_reason` where useful

Rules:

- Trashed records are hidden from default active API responses.
- Trashed records are shown through Trash/recovery queries only.
- `deleted_at is null` is the main default filter for excluding Trash records.
- `restore_until` controls whether restore is still allowed.
- `deleted_by_practitioner_id`, `deletion_type`, and `deletion_reason` support clear recovery/audit behavior without requiring a polymorphic trash table.

### Deletion groups

- `deletion_groups` should be its own table.
- Patient data deletion groups are a core QiCu product behavior, not an edge-case cleanup mechanism.
- Delete Patient Data must create one `deletion_groups` row and move the patient plus linked bookings and linked sessions to Trash with the same `deletion_group_id`.
- Grouped restore must be transaction-safe and restore all records in the patient data group or none.
- Grouped purge must be transaction-safe and permanently delete all expired records in the group consistently.
- QiCu v1 should use `deletion_groups` plus trash metadata on core records. This keeps default queries simple, supports grouped patient recovery, and avoids needing a generic `trash_items` table for the first implementation.

### Decision: no generic `trash_items` table for v1

Do not use a generic `trash_items` table in the first schema.

Reason:

- Current product behavior needs straightforward active filters on each core table.
- `deleted_at`, `restore_until`, and `deletion_group_id` on each core table make normal application queries and Trash exclusion easy to reason about.
- `deletion_groups` handles grouped recovery for patient data deletion.
- A generic polymorphic `trash_items` table can be reconsidered later if QiCu needs broader Trash behavior across many unrelated entity types.

### Restore

- Restore clears trash metadata by setting `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, `deletion_type`, and `deletion_reason` to null.
- Restore only works before `restore_until`.
- Restoring a patient deletion group restores the patient, linked bookings, and linked sessions in that group together.
- Individual booking, session, and service restores restore only that item.
- Restore must run inside database transactions.
- Restore must always respect `practitioner_id` scope.

### Purge

- Purge is permanent deletion after `restore_until`.
- Do not build a scheduler in the current database phase.
- Prepare purge as an explicit helper/admin job later.
- Purge order must respect foreign keys and nullable relationships such as `sessions.booking_id` and service references.
- Patient data groups should purge consistently as a group.
- Purge should eventually be carefully tested and audited because it is the point where recovery is no longer possible.

### Audit events

Include `audit_events` in the schema plan. Implementation can follow the core tables/repositories if the first database migration must stay small, but the table is part of the durable lifecycle design.

Audit events should track:

- Patient archive and reactivate
- Patient data group move to Trash
- Patient data group restore
- Individual booking/session/service move to Trash
- Individual booking/session/service restore
- Purge
- Patient export
- Booking status changes
- Google sync events and errors
- Service disable/archive and service delete

Use `audit_events.metadata` for impact counts, archive/delete reasons, restore results, export metadata, and sync error details. This is why `archived_by_practitioner_id` and `archive_reason` are deferred from the core patient/service tables in v1.

### Export

- Patient export is a database-read operation, not a UI-state operation.
- Export should read from `patients`, `bookings`, and `sessions`.
- Export should include service snapshots stored on bookings and sessions, especially `service_name` and `service_duration_minutes` where available.
- Export should include Google sync identifiers on bookings where relevant, such as `external_source`, `external_calendar_id`, `external_event_id`, `external_sync_status`, and `external_last_synced_at`.
- Export should respect practitioner scope and should be audited with a `patient_exported` audit event.

### Default query filters

Default active patient queries:

- `patients.practitioner_id` matches the scoped practitioner.
- `patients.deleted_at is null`.
- `patients.active = true`, unless archived records are explicitly requested.

Historical patient views:

- May include archived patients.
- Should still exclude `deleted_at is not null` records unless the Trash view is requested.

Booking availability queries:

- `bookings.practitioner_id` matches the scoped practitioner.
- `bookings.deleted_at is null`.
- `bookings.status in ('confirmed', 'pending')`.

Trash queries:

- `deleted_at is not null`.
- `practitioner_id` matches the scoped practitioner.
- Group by `deletion_group_id` where patient data groups should appear as one recovery item.

Service dropdown queries:

- `services.practitioner_id` matches the scoped practitioner.
- `services.active = true`.
- `services.deleted_at is null`.

## Lifecycle rules in database terms

### Archive patient

Affected tables: `patients`, optionally `audit_events`.

Transaction:

- Required if writing audit event with the archive.

Fields updated:

- `patients.active = false`
- `patients.archived_at = now()`
- `patients.updated_at = now()`

Rules:

- Do not set `deleted_at`.
- Do not modify past bookings or sessions.
- Historical bookings and sessions remain readable through `patient_id`.

### Reactivate patient

Affected tables: `patients`, optionally `audit_events`.

Fields updated:

- `patients.active = true`
- `patients.archived_at = null`
- `patients.updated_at = now()`

Rules:

- Only allowed when `deleted_at is null`.

### Archive patient with future booking decision

Affected tables: `patients`, optionally `bookings`, optionally `audit_events`.

Transaction:

- Required, especially when cancelling future bookings.

Fields updated:

- Always archive patient as above.
- If practitioner chooses "keep upcoming bookings active", future bookings are unchanged.
- If practitioner chooses "cancel upcoming bookings", set future non-trashed active bookings for that patient/practitioner to:
  - `bookings.status = 'cancelled'`
  - `bookings.status_updated_at = now()`
  - `bookings.updated_at = now()`

Rules:

- Do not delete future bookings.
- Do not change past bookings.
- Do not delete sessions.

### Delete patient data to Trash

Affected tables: `deletion_groups`, `patients`, `bookings`, `sessions`, optionally `audit_events`.

Transaction:

- Required. This is the most important lifecycle transaction.

Fields updated:

- Insert one `deletion_groups` row with `deletion_type = 'patient-data'`, `deleted_at`, `restore_until`.
- Update the patient row with `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, `deletion_type = 'patient-data'`.
- Update linked non-trashed bookings with the same Trash metadata.
- Update linked non-trashed sessions with the same Trash metadata.

Rules:

- No immediate hard-delete.
- Normal app views filter out records where `deleted_at is not null`.
- Grouped Trash UI should show this as one patient data group.

### Restore patient data group

Affected tables: `deletion_groups`, `patients`, `bookings`, `sessions`, optionally `services`, optionally `audit_events`.

Transaction:

- Required.

Fields updated:

- For scoped records with matching `deletion_group_id`, set `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, `deletion_type`, and `deletion_reason` to null.

Rules:

- Check `deletion_groups.restore_until >= now()` before restoring.
- Restore all records in the group or none.
- Practitioner scope must match the group and records.

### Delete booking to Trash

Affected tables: `deletion_groups`, `bookings`, `sessions`, optionally `audit_events`.

Transaction:

- Required because linked active sessions must be safely unlinked.

Fields updated:

- Insert deletion group with `deletion_type = 'booking'`.
- Update booking Trash metadata.
- Clear `sessions.booking_id` for active, non-trashed sessions that reference the booking, unless the session is also moved to Trash in the same patient data deletion group.

Rules:

- Do not delete the session unless the session is part of the same patient data deletion group.
- Do not update `bookings.session_id`; it is not part of the first database schema.

### Restore booking

Affected tables: `bookings`, optionally `audit_events`.

Fields updated:

- Clear booking Trash metadata before `restore_until`.

Rules:

- Restore only the booking for individual booking deletes.
- Do not automatically relink sessions unless a future restore relationship table records the previous link.

### Delete session to Trash

Affected tables: `deletion_groups`, `sessions`, `bookings`, optionally `audit_events`.

Transaction:

- Required because linked booking references must be safely cleared.

Fields updated:

- Insert deletion group with `deletion_type = 'session'`.
- Update session Trash metadata.

Rules:

- Do not delete the booking unless it is part of the same patient data deletion group.
- Do not update `bookings.session_id`; booking API responses should derive linkage from non-trashed sessions.

### Restore session

Affected tables: `sessions`, optionally `audit_events`.

Fields updated:

- Clear session Trash metadata before `restore_until`.

Rules:

- Restore only the session for individual session deletes.
- Do not automatically relink `booking_id` unless the relationship is still valid or future relationship-history metadata exists.

### Disable service

Affected tables: `services`, optionally `audit_events`.

Fields updated:

- `services.active = false`
- `services.archived_at = now()`
- `services.updated_at = now()`

Rules:

- Not a Trash action.
- Historical bookings/sessions keep service snapshots.
- Disabled services should not appear in new booking creation.

### Delete service to Trash

Affected tables: `deletion_groups`, `services`, optionally `audit_events`.

Fields updated:

- Insert deletion group with `deletion_type = 'service'`.
- Update service Trash metadata.

Rules:

- Historical bookings/sessions keep `service_name` and duration snapshots where available.
- Do not modify historical booking/session rows unless a future product decision requires service reference cleanup.

### Purge expired Trash

Affected tables: all trash-enabled tables and `deletion_groups`.

Transaction:

- Required per batch/group.

Fields updated/deleted:

- Permanently delete records where `restore_until < now()`.
- For patient data groups, purge all group records consistently.
- Delete or mark completed matching `deletion_groups` rows after children are purged.

Rules:

- This can be an explicit helper/admin job first, not a background scheduler in the initial database implementation.
- Purge order must respect foreign keys or use nullable `on delete set null` relationships.

## API-to-repository mapping

| Current route | Future repository method |
| --- | --- |
| `GET /api/patients` | `patientsRepository.listActiveByPractitioner(practitionerId)` |
| `POST /api/patients` | `patientsRepository.create(practitionerId, input)` |
| `PATCH /api/patients/[patientId]` | `patientsRepository.update(practitionerId, patientId, input)` |
| `DELETE /api/patients/[patientId]` | `lifecycleRepository.movePatientGraphToTrash(practitionerId, patientId)` |
| `POST /api/patients/[patientId]/archive` | `lifecycleRepository.archivePatient(practitionerId, patientId, options)` |
| `POST /api/patients/[patientId]/reactivate` | `lifecycleRepository.reactivatePatient(practitionerId, patientId)` |
| `GET /api/patients/[patientId]/export` | `patientsRepository.buildFullExport(practitionerId, patientId)` |
| `POST /api/patients/[patientId]/bookings` | `bookingsRepository.createForPatientWithOverlapCheck(practitionerId, patientId, input)` |
| `GET /api/patients/[patientId]/sessions` | `sessionsRepository.listByPatient(practitionerId, patientId)` |
| `POST /api/patients/[patientId]/sessions` | `sessionsRepository.createForPatient(practitionerId, patientId, input)` |
| `GET /api/bookings` | `bookingsRepository.listByPractitioner(practitionerId, filters)` |
| `POST /api/bookings` | `bookingsRepository.createWithOverlapCheck(practitionerId, input)` |
| `PATCH /api/bookings/[bookingId]` | `bookingsRepository.updateWithOverlapAndSyncFields(practitionerId, bookingId, input)` |
| `DELETE /api/bookings/[bookingId]` | `lifecycleRepository.moveBookingToTrash(practitionerId, bookingId)` |
| `GET /api/sessions` | `sessionsRepository.listByPractitioner(practitionerId, filters)` |
| `GET /api/sessions/[sessionId]` | `sessionsRepository.getById(practitionerId, sessionId)` |
| `PATCH /api/sessions/[sessionId]` | `sessionsRepository.update(practitionerId, sessionId, input)` |
| `DELETE /api/sessions/[sessionId]` | `lifecycleRepository.moveSessionToTrash(practitionerId, sessionId)` |
| `GET /api/services` | `servicesRepository.listByPractitioner(practitionerId, filters)` |
| `POST /api/services` | `servicesRepository.create(practitionerId, input)` |
| `GET /api/services/[serviceId]` | `servicesRepository.getById(practitionerId, serviceId)` |
| `PATCH /api/services/[serviceId]` | `servicesRepository.updateOrDisable(practitionerId, serviceId, input)` |
| `DELETE /api/services/[serviceId]` | `lifecycleRepository.moveServiceToTrash(practitionerId, serviceId)` |
| `GET /api/trash` | `trashRepository.listRecoveryView(practitionerId, filters)` |
| `POST /api/trash/[deletionGroupId]/restore` | `lifecycleRepository.restoreDeletionGroup(practitionerId, deletionGroupId)` |
| `GET /api/integrations/google/auth-url` | `googleIntegrationRepository.createOAuthStateAndAuthUrl(practitionerId)` |
| `GET /api/integrations/google/callback` | `googleIntegrationRepository.consumeOAuthStateAndSaveTokens(state, code)` |
| `GET /api/integrations/google/status` | `googleIntegrationRepository.getStatus(practitionerId)` |
| `GET /api/integrations/google/calendars` | `googleIntegrationRepository.listCalendars(practitionerId)` |
| `POST /api/integrations/google/calendar-selection` | `googleIntegrationRepository.setSelectedCalendar(practitionerId, input)` |
| `POST /api/integrations/google/disconnect` | `googleIntegrationRepository.disconnect(practitionerId)` |
| `GET /api/integrations/google/events-preview` | `googleImportRepository.buildPreview(practitionerId, input)` |
| `POST /api/integrations/google/reconcile` | `googleSyncRepository.reconcileImportedBooking(practitionerId, input)` |

Repository notes:

- Booking repository read methods may return a computed `sessionId` field during migration by deriving it from `sessions.booking_id`.
- Session repository write methods own the canonical booking/session link by setting or clearing `sessions.booking_id`.
- Lifecycle repository methods should clear `sessions.booking_id` when an individual booking moves to Trash, and should not depend on a physical `bookings.session_id` column.

## Migration order recommendation

1. Use Drizzle + PostgreSQL + Drizzle Kit migrations as the chosen migration approach.
2. Add schema/migrations only, with no route behavior changes.
3. Add deterministic seed data for demo practitioners, patients, services, bookings, and sessions.
4. Add a repository layer behind the current API response shapes, including computed booking `sessionId` where the frontend still expects it.
5. Move services first because they are relatively simple and already practitioner-scoped.
6. Move patients next, including direct `practitioner_id` plus FHIR JSON.
7. Move bookings and sessions next, using `sessions.booking_id` as canonical and covering walk-in sessions with null `booking_id`.
8. Move lifecycle/Trash operations with explicit transactions.
9. Move Google integrations and OAuth states with encrypted token strategy.
10. Add audit events around lifecycle operations.
11. Add auth later and replace `x-qicu-practitioner-id` header scoping with auth/session-derived practitioner access.

## Open decisions

- Patient storage strategy: mostly normalized columns plus `fhir_json`, or more JSON-heavy with fewer direct fields.
- UUID generation location: application-generated IDs vs database `gen_random_uuid()`.
- Whether to preserve current string demo IDs during transition or map them to UUIDs in seeds.
- Google token encryption strategy and key management.
- Whether `audit_events` is created in the first migration or a follow-up migration. The design decision is to keep it in the schema plan either way.
- Whether `email_logs` ships in the first DB migration or remains a documented future table.
- Whether Trash metadata should live on each entity table, in `deletion_groups` only, or both. This design recommends both.
- Whether to use text check constraints or PostgreSQL enums for statuses.
- Whether availability overlap should eventually use a GiST exclusion constraint.
- Whether `in-progress` bookings should block future availability in database constraints or only in UI/business rules.

## Major deviations from suggested schema

- Added `patients.fhir_json` because the current patient model is FHIR-inspired and includes fields such as `meta`, `identifier`, `telecom`, `address`, `communication`, `contact`, and app-specific extensions.
- Added direct patient columns such as `display_name`, `phone`, `email`, and `search_text` because the UI needs fast list/search behavior and patient ownership should not depend on parsing FHIR JSON.
- Added `patients.archived_at` and `services.archived_at` because archive/disable is distinct from Trash and should be auditable separately from `deleted_at`.
- Added `deletion_type` and `deletion_reason` columns to trash-enabled entity tables because current `trashMetadata` embeds these fields per record.
- Kept `deletion_groups` in addition to per-record Trash columns because current grouped patient deletion restores records by shared `deletionGroupId`, while normal views need efficient `deleted_at is null` filters.
- Included booking `external_sync_status = 'imported'` because the current model uses `imported`, `synced`, `pending`, and `error`.
- Did not introduce `qicu/manual` as a required `external_source` value because current native bookings use null external source.
- Included session clinical/note fields from the current model: `pain_score`, `tcm_diagnosis`, `tcm_findings`, `points_used`, `techniques`, and `basic_vitals`.
- Marked service `price_cents` and `currency` as optional/future because the current service model has no pricing.
- Decided `sessions.booking_id` is the canonical booking/session link even though the current booking model also has `sessionId`; the database should not include `bookings.session_id` in the first schema.
- Kept `practitioners.user_id` nullable because the project does not implement authentication yet.
- Marked `email_logs` optional/future because email behavior is not part of the current app, but booking lifecycle workflows often need email auditability later.

## Recommended next step

Review this schema design manually, then choose the database and migration implementation approach before writing migrations. The next task should be database schema implementation planning, not route rewrites.
