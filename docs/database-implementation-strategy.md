# QiCu Database Implementation Strategy

## Summary

QiCu currently uses in-memory stores for practitioners, patients, services, bookings, sessions, lifecycle/Trash metadata, and Google integration state. The persistence inventory and first-pass PostgreSQL schema design are documented in `docs/database-persistence-inventory.md` and `docs/database-schema-design.md`.

The database implementation should be incremental. Do not convert the whole app to database persistence in one risky pass. The goal is to build the persistence foundation first, introduce a repository/data-access layer, then migrate one domain at a time while preserving current API behavior and keeping tests green.

The safest path is: schema foundation, seed/demo data plan, repository seam, simple domains first, relational workflows next, lifecycle transactions after that, Google integration persistence, and auth later.

## Implementation principles

- Schema first, route rewrites later.
- Keep existing API response shapes stable where possible.
- Add a repository/data-access layer before moving route logic to the database.
- Do not scatter raw SQL across route handlers.
- Migrate simpler domains before relational workflows.
- Keep practitioner scoping explicit in every repository method.
- Preserve current lifecycle behavior: archive, Trash, restore, purge, and export.
- Use transactions for grouped lifecycle operations later.
- Keep tests passing after every step.
- Prefer small commits/branches per domain.
- Keep the dashboard and marketing site behavior unchanged unless a future task explicitly asks for UI work.

## Recommended implementation phases

### Phase A: Schema and migration foundation

Goal: create the database foundation without changing app behavior yet.

Tasks:

- Use Drizzle + PostgreSQL + Drizzle Kit migrations as the chosen database/migration approach.
- Create initial migrations for core tables from `docs/database-schema-design.md`.
- Include lifecycle fields on trash-enabled records.
- Include `deletion_groups`.
- Include `practitioners`.
- Include `patients`.
- Include `services`.
- Include `bookings`.
- Include `sessions`.
- Include Google integration tables if chosen for the first DB phase.
- Decide whether `audit_events` is created in the first migration or shortly after.
- Do not wire API routes to the database yet.

Important:

- This phase should be schema-only or nearly schema-only.
- Existing in-memory stores should remain the runtime source of truth during this phase.
- `/api/health` can continue using the existing PostgreSQL connection check, but this phase should not change patient, booking, session, service, Trash, or Google route behavior.

### Phase B: Seed/demo data plan

Goal: move current demo/sample data into deterministic seed helpers or fixtures.

Tasks:

- Identify demo practitioners from `src/lib/practitioners.ts`.
- Identify demo patients from `src/data/patients.ts`.
- Identify demo services from `src/data/services.ts`.
- Identify demo bookings from `src/data/bookings.ts`.
- Identify demo sessions from `src/data/sessionsStore.ts`.
- Decide how current string demo IDs map to database IDs.
- Decide whether to preserve current IDs during transition or map them to UUIDs.
- Create a seed plan that supports local development.
- Keep demo data separate from production logic.
- Avoid relative dynamic seed dates unless intentionally used for dev-only fixtures.

Output:

- Document how seed data should be loaded and reset in development.
- Define whether seeds are plain SQL, TypeScript scripts, ORM seed scripts, or test fixtures.
- Make seed/reset commands safe for local development only.

### Phase C: Repository layer foundation

Goal: introduce a data-access layer so API routes do not directly depend on raw SQL or in-memory stores.

Recommended folder:

```text
src/lib/repositories/
```

Recommended files:

- `practitionersRepository.ts`
- `patientsRepository.ts`
- `servicesRepository.ts`
- `bookingsRepository.ts`
- `sessionsRepository.ts`
- `lifecycleRepository.ts`
- `trashRepository.ts`
- `googleIntegrationsRepository.ts`

Repository principles:

- Every method should accept `practitionerId` where scoping is required.
- Repository methods should return data in shapes close to current API responses.
- Route handlers should call repositories instead of raw SQL.
- The repository layer may initially wrap in-memory stores, then later switch to database-backed implementations.
- The repository seam should reduce migration risk by allowing one domain at a time to move behind the same route behavior.

Important design option:

- Consider adapter-style modules such as `inMemoryPatientsRepository` and `postgresPatientsRepository`.
- Do not over-engineer if simple repository functions are enough.
- A practical middle path is to define repository function modules first, backed by in-memory stores, then replace internals domain-by-domain with PostgreSQL queries.

### Phase D: Persist practitioners, patients, and services first

Goal: start with simpler domains before relational booking/session workflows.

Why:

- Practitioners, patients, and services are simpler than bookings/sessions.
- They establish practitioner scoping, archive/active filters, and basic persistence.
- Services and patients are used by booking/session flows, so they should be stable first.

Tasks:

- Persist practitioners.
- Persist patients.
- Persist services.
- Preserve existing API behavior.
- Ensure archived patients are hidden from active workflows.
- Ensure disabled services are hidden from new booking workflows.
- Ensure trashed records are excluded from normal views.
- Keep full patient export behavior working, even if bookings/sessions remain temporarily in memory during transition.

Risks:

- Patient FHIR JSON mapping.
- Direct `practitioner_id` versus current FHIR practitioner extension.
- Current demo string IDs versus database UUIDs.
- Service snapshot behavior for historical records.
- Mixed persistence during transition if patients/services are in the database while bookings/sessions remain in memory.

### Phase E: Persist bookings and sessions next

Goal: move relational workflows after patients/services are stable.

Tasks:

- Persist bookings.
- Persist sessions.
- Use `sessions.booking_id` as the canonical database relationship.
- Do not add `bookings.session_id` to the first database schema.
- If the current UI expects `booking.sessionId`, repository/API code should return it as a computed field derived from `sessions.booking_id`.
- Preserve overlap validation.
- Preserve blocking statuses:
  - `confirmed`
  - `pending`
- Preserve non-blocking statuses:
  - `cancelled`
  - `no-show`
  - `completed`
  - trashed records
- Preserve cancelled-booking reschedule restriction.
- Preserve session creation with or without booking.
- Preserve task workflow around bookings and session notes.

Risks:

- Booking/session relationship migration.
- Availability and overlap queries.
- Google sync fields on bookings.
- Tasks derived from booking/session state.
- Mixed persistence if Google integration remains in memory while bookings move to the database.

### Phase F: Migrate lifecycle helpers

Goal: port archive/delete/restore/export behavior to repositories and database transactions.

Tasks:

- Move patient archive to repository/database-backed logic.
- Move patient data delete to a `deletion_groups` plus Trash metadata transaction.
- Move booking Trash delete to database-backed logic.
- Move session Trash delete to database-backed logic.
- Move service disable/delete to database-backed logic.
- Move `restoreDeletionGroup` to a transaction.
- Move `purgeExpiredTrash` to a database-backed helper/admin operation.
- Move full patient export to database reads.

Required transaction boundaries:

- Delete patient data to Trash.
- Restore patient data group.
- Delete booking and clear linked `sessions.booking_id`.
- Delete session and preserve booking state.
- Purge expired patient deletion group.
- Archive patient while optionally cancelling future bookings.

Important:

- Do not build a scheduler yet.
- Purge can remain a callable helper/admin job.
- Preserve the product rule that Archive is not Delete Patient Data.
- Preserve the product rule that Delete Patient Data is restorable for 30 days before purge.

### Phase G: Google integration persistence

Goal: move Google Calendar integration state out of memory.

Tasks:

- Persist one Google integration record per practitioner.
- Persist selected calendar.
- Persist token expiry and connected account email.
- Plan encrypted token storage before real production use.
- Persist OAuth states or use a short-lived cache strategy.
- Preserve imported/synced/error sync states on bookings.
- Ensure Google create/update/delete sync still does not break booking API behavior when Google fails.

Risks:

- Token encryption and key management.
- OAuth state expiry.
- Sync retry/error handling.
- Duplicate external event behavior.
- External API failure handling around local database transactions.

### Phase H: Auth later

Goal: replace demo practitioner header scoping after persistence works.

Tasks:

- Keep `x-qicu-practitioner-id` only during transition.
- Later replace it with auth/session-derived practitioner scope.
- Make sure repository methods already accept `practitionerId` so auth can swap the source of practitioner identity without rewriting everything.
- Plan the `users`/`practitioners` relationship.
- Do not implement auth during database persistence migration unless explicitly chosen.

## Repository naming and responsibilities

| Repository | Responsibility | Example methods | Current store/API equivalent |
| --- | --- | --- | --- |
| `practitionersRepository` | Practitioner lookup and profile persistence | `getById`, `listDemoOrSeededPractitioners`, `create`, `updateProfile` | `src/lib/practitioners.ts`, practitioner context/header helpers |
| `patientsRepository` | Patient list/detail/create/update/export reads | `listActiveByPractitioner`, `listByPractitionerIncludingArchived`, `getById`, `create`, `update`, `buildFullExport` | `patientsStore`, `/api/patients`, `/api/patients/[patientId]`, patient export route |
| `servicesRepository` | Service list/detail/create/update/disable reads | `listActiveByPractitioner`, `getById`, `create`, `update`, `disable`, `listIncludingDisabled` | `servicesStore`, `/api/services`, `/api/services/[serviceId]` |
| `bookingsRepository` | Booking list/detail/create/update/availability workflows | `listByPractitioner`, `listByPatient`, `getById`, `createWithOverlapCheck`, `updateWithOverlapCheck`, `findAvailabilityBlockingBookings`, `computeSessionIdForBookings` | `BOOKINGS`, `/api/bookings`, `/api/bookings/[bookingId]`, patient booking route, booking validation helpers |
| `sessionsRepository` | Session list/detail/create/update/link workflows | `listByPractitioner`, `listByPatient`, `getById`, `create`, `update`, `findByBookingId` | `sessionsStore`, `/api/sessions`, `/api/sessions/[sessionId]`, patient sessions route |
| `lifecycleRepository` | Archive, Trash, restore, purge, and export-sensitive lifecycle writes | `archivePatient`, `reactivatePatient`, `movePatientGraphToTrash`, `moveBookingToTrash`, `moveSessionToTrash`, `moveServiceToTrash`, `restoreDeletionGroup`, `purgeExpiredTrash` | `src/lib/dataLifecycle.ts`, archive/delete/restore API routes |
| `trashRepository` | Trash recovery view reads | `listRecoveryView`, `buildGroupedTrashView` | `/api/trash`, `src/lib/trashView.ts` if present, `listTrash` helper |
| `googleIntegrationsRepository` | Google integration state and OAuth state persistence | `getStatus`, `saveIntegration`, `disconnect`, `saveSelectedCalendar`, `createOAuthState`, `consumeOAuthState` | `src/lib/google/store.ts`, Google integration API routes |

## Database tooling decision

QiCu has chosen Drizzle + PostgreSQL + Drizzle Kit migrations for the first database implementation.

Drizzle is the preferred middle ground for QiCu because it gives strong TypeScript support while staying close to SQL and PostgreSQL. QiCu needs PostgreSQL-specific control for partial indexes, check constraints, JSONB, explicit transactions, lifecycle metadata, grouped restore behavior, and booking availability queries.

| Option | Strengths for QiCu | Tradeoffs / risks |
| --- | --- | --- |
| Raw `pg` + SQL migrations | Maximum PostgreSQL control; easy partial indexes and check constraints; explicit transactions; aligns with existing `src/lib/db.ts`; no ORM magic | More boilerplate; manual type mapping; more discipline needed to avoid SQL scattered through route handlers |
| Drizzle | Chosen approach. Strong TypeScript ergonomics; SQL-like mental model; good fit for repository pattern; supports incremental migration; closer to SQL than Prisma; can use raw SQL for PostgreSQL-specific constraints/indexes where needed | Adds new dependency/tooling; migrations need learning; advanced constraints may still require custom SQL migration statements |
| Prisma | Excellent developer experience; schema file is approachable; generated client is productive; common auth integration patterns | PostgreSQL-specific partial indexes/check constraints/exclusion strategies may require workarounds/raw SQL; can hide query details; may be heavier than QiCu needs right now |

Comparison against QiCu needs:

- PostgreSQL partial indexes: Drizzle can model many schema pieces, and raw SQL remains useful in Drizzle migrations when an index is easier to express directly.
- Check constraints: Drizzle is practical, and raw SQL remains useful if generated migrations do not express a constraint cleanly.
- JSONB: all three can support it, with raw SQL/Drizzle giving more direct control.
- Explicit transactions: all three can support transactions, but raw SQL makes boundaries most visible.
- Migration clarity: raw SQL is most explicit, Drizzle is balanced, Prisma is approachable but less PostgreSQL-native for some constraints.
- TypeScript ergonomics: Drizzle gives useful TypeScript support without moving as far away from SQL as Prisma.
- Future auth integration: Prisma has strong ecosystem patterns; Drizzle/raw SQL keep implementation thinner but require more manual wiring.
- Repository pattern: all three can work if route handlers only call repositories.
- Avoiding too much magic: raw SQL and Drizzle fit better than Prisma.
- Solo/junior developer experience: Prisma is easiest to start with, Drizzle is a good middle ground, raw SQL is clearest but more manual.
- Long-term maintainability: Drizzle or raw SQL likely fit QiCu's PostgreSQL-specific lifecycle and availability rules best.

Decision:

- Use Drizzle + PostgreSQL + Drizzle Kit migrations.
- Keep raw SQL available inside Drizzle migrations for partial indexes, check constraints, and other PostgreSQL-specific details when Drizzle's schema DSL is not the clearest expression.
- Do not choose Prisma for this phase because QiCu needs stronger PostgreSQL-specific control than simple CRUD and should avoid heavier ORM magic around lifecycle/availability behavior.
- Keep repository boundaries strict so Drizzle does not leak directly into route handlers.

## Testing strategy during migration

After every phase, run:

```bash
npm test
npx tsc --noEmit
npm run build
```

Test categories:

- Repository unit tests.
- API route behavior tests.
- Lifecycle transaction tests.
- Practitioner scoping tests.
- Availability/overlap tests.
- Trash/restore tests.
- Google sync fallback tests.
- Seed data tests.

Important:

- Current tests must remain passing while each domain migrates.
- Add repository tests before switching routes to database-backed repositories.
- Keep API behavior tests focused on current response shapes so frontend migration risk stays low.
- Lifecycle tests should verify both success and partial-failure rollback behavior once database transactions exist.

## Rollback and safety strategy

- Keep the in-memory implementation until repository replacement is tested.
- Migrate one domain at a time.
- Avoid changing API response shapes all at once.
- Use feature branches for each phase or domain.
- Commit after each stable phase.
- Keep docs updated when implementation decisions change.
- Preserve the ability to switch a repository back to the in-memory adapter during transition if a database-backed domain is not ready.
- Do not combine database persistence migration with auth, email, dashboard redesign, or marketing work.

## Open implementation decisions

- Drizzle package/config details for the first implementation task.
- Include `audit_events` in the first migration or create it in a near-follow-up migration.
- Include `email_logs` now or defer.
- Preserve current string IDs or convert/map to UUIDs.
- Token encryption approach.
- Database hosting and local development setup.
- Seed/reset command approach.
- Whether to use repository interfaces or simple concrete repositories.
- Whether to keep in-memory adapters temporarily.
- Whether Google integration persistence should be in the first database milestone or after bookings/sessions.
- Whether database availability checks should evolve beyond the current `/api/health` query.

## Recommended next task

Install and configure Drizzle/Drizzle Kit, create the initial schema files and first migration draft, but do not rewrite application routes yet.

The next Codex task should implement Phase A only: add Drizzle packages/configuration, create schema files, generate or draft the first migration, and preserve existing runtime behavior.

## Implementation note: Phase C patient/service repository foundation

Phase C introduced `src/lib/repositories/patientsRepository.ts` and `src/lib/repositories/servicesRepository.ts` as the first repository seam for simple domains.

These repositories currently wrap the existing in-memory stores and helpers. Runtime persistence is still not PostgreSQL, no Drizzle-backed repository internals were added, and the current app behavior remains backed by the existing demo stores.

The patient and service API routes now call the repository seam for direct list, create, read, and update access while lifecycle/Trash behavior continues to use the existing lifecycle helpers. This prepares those repository internals to move to Drizzle later without changing API response shapes now.

## Implementation note: Phase C.2 booking/session repository foundation

Phase C.2 introduced `src/lib/repositories/bookingsRepository.ts` and `src/lib/repositories/sessionsRepository.ts`.

These repositories currently wrap the existing in-memory booking and session stores. Runtime persistence is still not PostgreSQL, no Drizzle-backed repository internals were added, and route handlers do not import Drizzle for runtime data access.

The booking and session API routes now use the repository seam where safe while preserving existing validation, Google Calendar sync behavior, lifecycle/Trash helpers, status semantics, and response shapes. The booking time picker also now focuses the nearest future day with available slots when the initially selected day has no slots, while keeping day/time selection behavior explicit.

## Implementation note: Phase C.3 lifecycle/Trash repository foundation

Phase C.3 introduced `src/lib/repositories/lifecycleRepository.ts` and `src/lib/repositories/trashRepository.ts`.

These repositories currently wrap the existing in-memory lifecycle and Trash helpers. Runtime persistence is still not PostgreSQL, no Drizzle-backed repository internals were added, and grouped patient Trash behavior remains unchanged.

Lifecycle and Trash API routes now use the repository seam where safe while preserving archive, delete, restore, purge, export, Trash grouping, Google Calendar sync ordering, status codes, and response shapes.

## Implementation note: Phase C.4 Google integration repository foundation

Phase C.4 introduced `src/lib/repositories/googleIntegrationsRepository.ts`.

This repository currently wraps the existing in-memory Google integration and OAuth state helpers. Runtime persistence is still not PostgreSQL, no Google tokens are persisted to PostgreSQL, and no Drizzle-backed repository internals were added.

Google integration API routes and Google auth/sync helpers now use the repository seam where safe while preserving OAuth, selected calendar, status, import preview, reconcile, booking sync fallback behavior, practitioner scoping, and response shapes.

## Implementation note: Phase C completion audit

The Phase C repository seam audit confirmed that the expected repository files are in place for patients, services, bookings, sessions, lifecycle, Trash, and Google integrations.

All domain repositories currently wrap existing in-memory stores/helpers. Runtime persistence is still not PostgreSQL, no Drizzle-backed repository internals were added, and domain API routes do not import Drizzle directly. The existing `/api/health` endpoint remains a separate database connectivity probe through `src/lib/db.ts`; it is not used for domain runtime persistence.

As part of the audit, Google import preview/reconcile access was moved behind existing patient, service, and booking repository seams while preserving the previous in-memory filtering and reconcile behavior. Repository tests cover practitioner scoping, active/archived/disabled filtering, Trash exclusion/grouping, booking availability statuses, linked and walk-in sessions, lifecycle restore behavior, and Google public status/scoping behavior.

Phase D can begin with the simplest database-backed repository internals. Recommended order remains: practitioners first, then services, then patients. Remaining risks before deeper migrations are ID mapping consistency, preserving FHIR-like patient response shapes, service history snapshots on bookings/sessions, and keeping Google/lifecycle side effects isolated from early Drizzle-backed domains.

## Implementation note: Phase D local database preflight

Phase D preflight added a local Docker Compose PostgreSQL setup for development database work only, plus a non-destructive `db:check` script and local database setup documentation.

No runtime repositories were moved to Drizzle-backed persistence. Runtime data still comes from in-memory stores/helpers, API response shapes remain unchanged, and Docker is used only for local PostgreSQL rather than the Next.js app.

This preflight prepares the project to verify local migrations and deterministic development seeds before migrating repository internals. Phase D should still begin with practitioners, then services, then patients.

## Implementation note: Phase D.1 practitioner Drizzle runtime foundation

Phase D.1 introduced `src/lib/repositories/practitionersRepository.ts` as the first Drizzle-backed runtime repository.

Practitioner lookup now reads seeded practitioner rows through Drizzle when PostgreSQL is available, then maps deterministic database UUIDs back to the existing public demo IDs such as `prac-tom-cook` and `prac-keita-smith`. This preserves the current `x-qicu-practitioner-id` header behavior and keeps all existing in-memory patient, service, booking, session, lifecycle, Trash, and Google scoping stable during the transition.

The repository keeps a small demo compatibility fallback so normal tests and builds do not require a live database. Local runtime database-backed practitioner lookup requires the local database to be migrated and seeded first.

Patients, services, bookings, sessions, lifecycle, Trash, and Google integration runtime persistence remain backed by existing in-memory stores/helpers. API routes still do not import Drizzle directly.

## Implementation note: Phase D.2 services Drizzle runtime foundation

Phase D.2 moved `src/lib/repositories/servicesRepository.ts` to Drizzle-backed runtime persistence when PostgreSQL is available. Practitioners remain Drizzle-backed, while patients, bookings, sessions, lifecycle, Trash, and Google integration runtime persistence still use existing in-memory stores/helpers.

Services keep their existing public IDs such as `tom-acu-60` and `keita-cupping-30`. The database still uses UUID primary keys internally, with a `services.public_id` compatibility column for public app IDs and seeded ID mapping. This keeps current API response shapes stable and prevents booking/session service snapshots from exposing database UUIDs.

The service repository accepts public service IDs from routes and maps them to database rows internally. Active/disabled filtering, practitioner scoping, normal Trash exclusion, duplicate detection, create, update, and disable behavior remain compatible with the previous repository contract.

Because lifecycle/Trash helpers have not moved to Drizzle yet, service rows read or written through Drizzle are mirrored into the existing in-memory service store during this transition. This preserves service disable/delete impact behavior until lifecycle/Trash persistence is migrated.

API routes still do not import Drizzle directly. Local DB-backed services runtime requires the local database to be migrated and seeded first.

## Implementation note: Phase D.3 patients Drizzle runtime foundation

Phase D.3 moved `src/lib/repositories/patientsRepository.ts` to Drizzle-backed runtime persistence when PostgreSQL is available. Practitioners and services remain Drizzle-backed, while bookings, sessions, lifecycle, Trash, and Google integration runtime persistence still use existing in-memory stores/helpers.

Patients keep their existing public IDs such as `P-T-1001` and `P-K-2001`. The database still uses UUID primary keys internally, with a `patients.public_id` compatibility column for public app IDs and seeded ID mapping. The repository maps database rows back to the current FHIR-like patient response shape so patient profile fields, display/contact/search fields, and API response shapes remain stable.

Bookings and sessions continue to reference public patient IDs and remain in-memory. During the transition, DB-backed patient reads and writes are mirrored into `patientsStore`, and patient lifecycle operations narrowly sync archived/trashed/restored patient state back to the database. This keeps archive, delete, restore, export, and active workflow checks consistent until lifecycle/Trash internals move to Drizzle.

API routes still do not import Drizzle directly. Local DB-backed patients runtime requires the local database to be migrated and seeded first.

## Implementation note: Phase D completion audit

The Phase D completion audit confirmed that practitioners, services, and patients form the first Drizzle-backed runtime layer when PostgreSQL is available. Practitioners continue to map seeded database UUIDs back to public IDs such as `prac-tom-cook` and `prac-keita-smith`; services and patients use `public_id` compatibility columns so current public IDs such as `tom-acu-60`, `keita-cupping-30`, `P-T-1001`, and `P-K-2001` remain stable.

Bookings, sessions, lifecycle, Trash, and Google integration remain backed by existing in-memory stores/helpers. Service and patient repository reads/writes continue to mirror into the in-memory stores for transition safety, and patient lifecycle operations keep narrow archive/delete/restore sync points until lifecycle and Trash move fully to Drizzle.

API routes still do not import Drizzle directly, and route response shapes remain repository-owned rather than database-row-shaped. Phase E can begin after a manual browser smoke check of Patients, Services, Bookings, Sessions, Trash restore, Export, and Google import/reconcile flows.

## Implementation note: Phase E.0 booking/session readiness audit

The Phase E.0 readiness audit confirmed that bookings and sessions should not move directly to Drizzle runtime persistence until public ID compatibility is added. Current booking and session IDs are exposed through routes, UI state, Google sync metadata, lifecycle/Trash helpers, task prompts, and patient export, so `bookings.public_id` and `sessions.public_id` should be added and backfilled before repository internals move.

The current schema already has the core relational shape for Phase E: bookings store patient/service foreign keys, service snapshots, status, Google sync fields, lifecycle metadata, and availability indexes; sessions use nullable `sessions.booking_id` as the canonical booking relationship; and there is no physical `bookings.session_id` column. Future booking API responses may still compute a transitional `booking.sessionId` while the UI and task workflows depend on it.

Recommended Phase E order is: add booking/session public ID columns and seed backfills first, migrate bookingsRepository with in-memory mirroring second, then migrate sessionsRepository using `sessions.booking_id` as canonical. Lifecycle/Trash and Google should remain in-memory until later phases.

## Implementation note: Phase E.1 booking/session public ID compatibility

Phase E.1 added `bookings.public_id` and `sessions.public_id` to the Drizzle schema, plus deterministic seed values and migration backfills for the existing public booking/session IDs. These columns prepare future Drizzle-backed booking and session repositories to keep current API/UI IDs stable while database UUID primary keys remain internal.

No booking or session runtime repository was moved to Drizzle in this phase. `bookings.session_id` was not added, and `sessions.booking_id` remains the canonical database relationship for linked sessions.

## Implementation note: Phase E.2 bookings Drizzle runtime foundation

Phase E.2 moved `src/lib/repositories/bookingsRepository.ts` to Drizzle-backed runtime persistence when PostgreSQL is available. Practitioners, services, patients, and bookings are now the Drizzle-backed runtime layer; sessions, lifecycle, Trash, and Google integration still use existing in-memory stores/helpers.

Bookings keep their existing public IDs such as `b-tom-today-001`, `b-tom-live-003`, and newly generated public IDs from booking creation. The database UUID primary key remains internal, and repository mapping preserves public practitioner, patient, and service IDs in current booking response shapes.

During the transition, DB-backed booking reads/writes mirror into the existing `BOOKINGS` store. Lifecycle operations sync booking Trash state back to the database, Google sync/reconcile can persist external status fields, patient export can still combine booking data with in-memory sessions, and booking responses can still compute transitional `sessionId` from in-memory sessions. `bookings.session_id` was not added; `sessions.booking_id` remains canonical for Phase E.3.

API routes still do not import Drizzle directly. Local DB-backed booking runtime requires the local database to be migrated and seeded first.

### Phase E.2 follow-up: lifecycle/Trash restart persistence

Restart-persistent Trash recovery is intentionally deferred. Phase E.2 persists booking deleted state well enough that deleted bookings should not reappear in normal active booking lists, but lifecycle/Trash grouping still comes from in-memory helpers and is not expected to fully survive an app restart.

Do not treat missing Trash records after restart as a Phase E.2 blocker unless deleted records reappear in active/default views. Phase F should migrate lifecycle and Trash helpers to database-backed transactions so `deletion_groups`, Trash metadata, restore windows, restore, and purge behavior are persisted together.

## Implementation note: Phase E.3 sessions Drizzle runtime foundation

Phase E.3 moved `src/lib/repositories/sessionsRepository.ts` to Drizzle-backed runtime persistence when PostgreSQL is available. Practitioners, services, patients, bookings, and sessions are now Drizzle-backed at the repository layer; lifecycle, Trash, and Google integration still use existing in-memory helpers/stores.

Sessions keep their existing public IDs such as `S-T-1001` and `S-K-2001` through `sessions.public_id`. Database UUID primary keys remain internal, while the repository maps public practitioner, patient, service, booking, and session IDs to database rows and returns current API-compatible session shapes.

Linked sessions use nullable `sessions.booking_id` as the canonical database relationship. `bookings.session_id` was not added. During the transition, booking responses can still expose a computed/transitional `sessionId` using public session IDs so existing booking detail, task, and note workflows remain stable.

DB-backed session reads and writes mirror into `sessionsStore`, and lifecycle operations narrowly sync session Trash/link changes back to the sessions table during the running app session. Restart-persistent grouped Trash recovery remains deferred to Phase F. API routes still do not import Drizzle directly, and local DB-backed session runtime requires the local database to be migrated and seeded first.
