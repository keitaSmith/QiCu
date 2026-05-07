# Phase E Booking/Session Readiness

## Summary

Phase D made practitioners, services, and patients Drizzle-backed when PostgreSQL is available. Bookings and sessions are still in-memory and still expose public string IDs throughout routes, UI state, Google sync, task prompts, lifecycle helpers, and exports.

Phase E should not move bookings or sessions directly to Drizzle until public ID compatibility, relationship mapping, transition mirroring, and lifecycle/Google behavior are planned. The safest next step is a schema-only compatibility phase for booking and session public IDs, followed by bookings, then sessions.

## Current runtime state

- Practitioners: Drizzle-backed through `practitionersRepository`, mapped back to public practitioner IDs.
- Services: Drizzle-backed through `servicesRepository`, using `services.public_id`, mirrored into `servicesStore`.
- Patients: Drizzle-backed through `patientsRepository`, using `patients.public_id`, mirrored/synced with `patientsStore`.
- Bookings: in-memory through `BOOKINGS` and `bookingsRepository`.
- Sessions: in-memory through `sessionsStore` and `sessionsRepository`.
- Lifecycle/Trash: still in-memory, with narrow patient/service transition sync.
- Google integration: still in-memory through Google repository/store helpers.

API routes call repositories/helpers and do not import Drizzle directly.

## Booking data flow

Current booking objects expose public IDs directly as `booking.id`. Demo IDs include `b-tom-today-001`, `b-tom-live-003`, and `b-keita-past-201`. Some newly created booking paths use `crypto.randomUUID()` as the public runtime ID, but the API/UI still treats the value as an opaque public route ID rather than a database primary key.

Bookings are exposed in:

- `/api/bookings`
- `/api/bookings/[bookingId]`
- `/api/patients/[patientId]/bookings`
- dashboard booking pages, calendar page, booking dialogs, tasks menu, and session dialog booking selectors
- Google sync descriptions and private extended properties
- Google import preview/reconcile duplicate detection
- lifecycle/Trash helpers and patient export

Booking availability and overlap are calculated by `bookingValidation.ts` over repository-returned booking objects. Confirmed and pending bookings block availability. Cancelled, no-show, completed, and trashed bookings do not block availability. Cancelled bookings cannot be rescheduled unless their status is changed in the same update.

Bookings currently store service snapshots with `serviceName` and `serviceDurationMinutes`. Phase E must preserve these snapshots so historical booking/session display does not depend on current service rows.

Google sync mutates booking external fields in memory:

- `externalSource`
- `externalCalendarId`
- `externalEventId`
- `externalSyncStatus`
- `externalLastSyncedAt`

Sync failures set `externalSyncStatus = 'error'` but keep local create/update/delete behavior successful.

## Session data flow

Current session objects expose public IDs directly as `session.id`. Demo IDs include `S-T-1001` and `S-K-2001`; newly created sessions currently use `S-${Date.now()}`.

Sessions are exposed in:

- `/api/sessions`
- `/api/sessions/[sessionId]`
- `/api/patients/[patientId]/sessions`
- dashboard sessions pages and session dialogs
- booking-linked session note flows
- lifecycle/Trash helpers and patient export

Sessions always belong to a patient and may link to a booking using `session.bookingId`. Walk-in/no-booking sessions use `bookingId = null` or no booking ID.

The database design correctly makes `sessions.booking_id` the canonical relationship. The current runtime also exposes `booking.sessionId` as a transitional/computed convenience used by tasks, booking menus, and session-link checks. The database should not add `bookings.session_id`; future DB-backed booking responses may compute `booking.sessionId` from sessions.

## Public ID compatibility decision

Bookings and sessions need public ID compatibility columns before runtime persistence moves to Drizzle:

- `bookings.public_id`
- `sessions.public_id`

Reasons:

- Current route params use booking/session public IDs.
- Current tests and UI state refer to IDs like `b-tom-today-001` and `S-T-1001`.
- Google descriptions and extended properties include `booking.id`.
- Session dialogs and tasks use `booking.id`, `booking.sessionId`, and `session.bookingId`.
- Lifecycle/Trash and patient export currently link records by public IDs.

Recommended Phase E.1 schema change:

- Add nullable `bookings.public_id text`.
- Add nullable `sessions.public_id text`.
- Add unique indexes scoped by practitioner:
  - `bookings_practitioner_public_id_unique` on `(practitioner_id, public_id)`
  - `sessions_practitioner_public_id_unique` on `(practitioner_id, public_id)`
- Backfill deterministic seed rows from `demoBookingIds` and `demoSessionIds`.
- Update `demoBookings` and `demoSessions` seed rows to include public IDs.
- Keep DB UUID primary keys internal.

## Booking migration risks

Before `bookingsRepository` becomes Drizzle-backed, these must be solved:

- Map public practitioner IDs to practitioner UUIDs.
- Map public patient IDs to patient UUIDs.
- Map public service IDs to service UUIDs.
- Return public booking IDs, public patient IDs, and public service IDs from repository methods.
- Preserve `code`, `resource`, `notes`, `start`, `end`, `status`, and `statusUpdatedAt` response fields.
- Preserve service snapshots (`serviceName`, `serviceDurationMinutes`).
- Preserve Google external fields and local fallback behavior when sync fails.
- Preserve imported Google booking behavior so imported bookings do not create duplicate outbound Google events.
- Preserve overlap validation and availability blocking statuses.
- Preserve cancelled booking reschedule restriction.
- Preserve lifecycle metadata and Trash exclusion from normal views.
- Keep patient archive checks and disabled service checks in route/service boundaries.
- Preserve task/session-note prompts that depend on booking status, dates, and `booking.sessionId`.

The largest transition risk is that lifecycle/Trash and Google sync still mutate in-memory booking objects. A DB-backed booking repository should mirror returned and mutated booking rows into `BOOKINGS` until those workflows move to Drizzle.

## Session migration risks

Before `sessionsRepository` becomes Drizzle-backed, these must be solved:

- Map public practitioner IDs to practitioner UUIDs.
- Map public patient IDs to patient UUIDs.
- Map public service IDs to service UUIDs when present.
- Map public booking IDs to booking UUIDs when present.
- Return public session IDs and public relationship IDs.
- Use `sessions.booking_id` as the canonical DB relationship.
- Do not add or rely on a physical `bookings.session_id` database column.
- Compute transitional `booking.sessionId` from linked sessions where the current API/UI still needs it.
- Preserve linked booking session behavior and walk-in/no-booking sessions.
- Preserve session detail routes and patient session lists.
- Preserve booking delete behavior that unlinks active sessions.
- Preserve session delete behavior that clears the active booking link.
- Preserve lifecycle metadata, Trash restore behavior, patient export, and patient archive/Trash checks.
- Preserve task/session-note workflows that depend on booking/session linkage.

The largest transition risk is split ownership of booking/session links. If bookings move first, `booking.sessionId` must remain stable from in-memory sessions. If sessions move later, booking responses should compute `sessionId` from DB sessions while still mirroring for lifecycle/Trash until those internals migrate.

## Mixed persistence transition strategy

Options considered:

- Move bookings first and keep sessions in-memory temporarily.
- Move sessions first and keep bookings in-memory temporarily.
- Add public ID columns first, then move bookings and sessions together.
- Move each repository to DB but mirror into in-memory lifecycle/Google/task stores during transition.

Recommended order:

1. Add `bookings.public_id` and `sessions.public_id`, backfill seeds, update seed files, and verify migrations/seeds.
2. Move `bookingsRepository` to Drizzle-backed runtime while mirroring DB rows into `BOOKINGS`.
3. Keep `sessionsRepository` in-memory until booking migration is stable.
4. Move `sessionsRepository` to Drizzle-backed runtime using `sessions.booking_id` as canonical, while mirroring into `sessionsStore`.
5. Compute transitional `booking.sessionId` from sessions where needed.
6. Only later move lifecycle/Trash to real DB transactions.

This order keeps availability, overlap validation, Google sync, and booking task behavior stable before changing session persistence.

## Schema readiness

The current schema already includes most booking/session fields needed for Phase E:

- `bookings` has practitioner, patient, service, service snapshot, resource, start/end, status, notes, Google sync fields, lifecycle metadata, status checks, external field checks, time order checks, service duration checks, practitioner/time indexes, external event index, and an availability partial index.
- `sessions` has practitioner, patient, nullable `booking_id`, nullable service, service snapshot, start, clinical note fields, arrays/JSON fields, lifecycle metadata, patient/booking/deleted indexes, and pain score/lifecycle checks.
- `bookings` has no physical `session_id`, which matches the design decision.
- `sessions.booking_id` is nullable, which supports walk-in/no-booking sessions.

Missing before runtime migration:

- `bookings.public_id`
- `sessions.public_id`
- seed public ID values for bookings and sessions
- repository mapping helpers for public ID to DB UUID and DB UUID to public ID

## Required tests

Phase E.1 schema/public ID tests:

- Booking seed rows include `public_id`.
- Session seed rows include `public_id`.
- Public IDs are unique per practitioner.
- `db:generate`, `db:migrate`, `db:check`, and `db:seed` pass.

Phase E.2 booking runtime tests:

- Booking list/detail routes preserve response shape.
- Booking public IDs remain stable and DB UUIDs do not leak.
- Booking create works with public patient/service IDs.
- Booking update works with public service IDs and preserves snapshots.
- Confirmed/pending bookings block availability.
- Cancelled/no-show/completed/trashed bookings do not block availability.
- Cancelled booking reschedule restriction remains.
- Google create failure does not break local create.
- Google update failure does not break local update.
- Google delete failure does not break local delete.
- Imported Google bookings do not trigger duplicate outbound Google events.
- Booking delete moves booking to Trash and unlinks active sessions.
- Patient detail linked bookings still work.
- Patient export includes linked bookings.

Phase E.3 session runtime tests:

- Session list/detail routes preserve response shape.
- Session public IDs remain stable and DB UUIDs do not leak.
- Session creation supports booking-linked sessions.
- Session creation supports walk-in/no-booking sessions.
- Session update can link/unlink bookings.
- Session delete clears active booking linkage.
- Booking responses compute transitional `sessionId` where needed.
- Patient detail linked sessions still work.
- Patient export includes linked sessions.
- Trash grouped patient delete/restore still works.
- Session-note task workflows remain stable.

## Manual browser checklist

- Bookings page list, filters, status actions, and task menu.
- Booking create/edit with patient and service dropdowns.
- Booking overlap/availability and time picker disabled-day behavior.
- Cancelled booking reschedule restriction.
- Google create/update/delete fallback if test credentials/mocks are available.
- Google import preview and reconcile.
- Sessions page list and detail.
- Create session from a booking.
- Create walk-in/no-booking session.
- Edit session booking link and service.
- Patient detail bookings and sessions tabs.
- Patient export with linked bookings/sessions.
- Trash grouped patient delete/restore.
- Individual booking/session delete/restore.

## Recommended next task

Implement Phase E.1 as a schema/seed compatibility step only: add `bookings.public_id` and `sessions.public_id`, deterministic backfill migrations, seed updates, and public ID mapping tests. Do not move bookings or sessions runtime persistence in that task.
