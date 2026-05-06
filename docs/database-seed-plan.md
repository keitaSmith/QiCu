# QiCu Database Seed Plan

## Summary

QiCu currently uses in-memory demo and sample data for practitioners, patients, services, bookings, sessions, lifecycle/Trash examples, and Google integration state. Drizzle Phase A has added the schema and migration foundation under `src/db/`, but the running app still uses the existing TypeScript stores.

This document plans seed/demo data migration only. It does not move runtime data to PostgreSQL, does not change API routes, does not add repositories, and does not change dashboard or marketing behavior.

The current demo data should eventually become deterministic development seeds and/or test fixtures. It must not become production logic. Runtime data remains unchanged for now until a later repository migration explicitly moves each domain to database-backed persistence.

## Current demo data inventory

| File path | Entity/data type | Approximate records | Mutable at runtime? | Classification | Future recommendation |
| --- | --- | ---: | --- | --- | --- |
| `src/lib/practitioners.ts` | Demo practitioner identities, header scoping helpers, practitioner ownership helpers | 2 demo practitioners | Practitioner array is not mutated; helper logic is runtime app logic | Mixed: demo data plus app scoping logic | Move demo practitioners to development seed data later; keep header/helper constants as runtime until auth/repository migration; replace demo header scoping during auth phase |
| `src/data/patients.ts` | FHIR-like demo patients for Tom and Keita | 8 patients | Source array is not directly mutated after module load | True demo data | Development seed later; preserve richer FHIR shape in `patients.fhir_json` plus extracted indexed columns |
| `src/data/patientsStore.ts` | Mutable in-memory patient store initialized from `PATIENTS` | 8 initial records | Yes | Runtime store backed by demo seed data | Keep as runtime until repository migration; remove later after database-backed patient repository is live |
| `src/data/services.ts` | Demo service definitions, including one disabled service | 8 services | Source array is not directly mutated after module load | True demo data | Development seed later; one disabled service is useful for local workflows and tests |
| `src/data/servicesStore.ts` | Mutable in-memory service store initialized from `INITIAL_SERVICES` | 8 initial records | Yes | Runtime store backed by demo seed data | Keep as runtime until repository migration; remove later after database-backed service repository is live |
| `src/data/bookings.ts` | Demo bookings using relative date helpers and human-readable booking codes | 9 bookings | Yes, the exported `BOOKINGS` array is mutated by routes, lifecycle helpers, and tests | Runtime store backed by demo seed data | Development seed later, but replace hidden relative dates with intentional seed-date strategy |
| `src/data/sessionsStore.ts` | Demo session records and mutable session store | 2 sessions | Yes | Runtime store backed by demo seed data | Development seed later; include one linked session and at least one no-booking/walk-in session in future seed data |
| `src/lib/google/store.ts` | In-memory Google integration map and pending OAuth state map | 0 initial records | Yes | Runtime integration state, not demo seed data | Keep as runtime until Google repository migration; do not seed real tokens; use test fixtures for fake integrations |
| `src/**/*.test.ts` | Inline test fixtures for bookings, lifecycle, Trash, CSV import, Google mapping/sync, session route behavior, time picker slots | Many small fixtures across 8 test files | Mutated inside test setup/teardown only | Test fixture data | Keep separate from development seeds; consider extracting repeated lifecycle, booking overlap, and Google fixtures under `src/test/fixtures/` later |

Notes:

- No standalone `src/test/fixtures/`, `test/`, `tests/`, or `__tests__/` fixture directory is present right now.
- Google integration state has no committed demo tokens. Tests use fake values such as `test-access-token`, `invalid-token`, `calendar-primary`, and `event-123`.
- Some source text currently contains mojibake in patient names, for example the Muller sample. The seed migration should preserve current runtime behavior until a later data-cleanup task intentionally normalizes display text.

## ID strategy

Current demo IDs are human-readable strings, not UUIDs:

- Practitioners: `prac-tom-cook`, `prac-keita-smith`.
- Patients: `P-T-1001` through `P-T-1004`, and `P-K-2001` through `P-K-2004`.
- Services: examples include `tom-acu-60`, `tom-acu-45`, `keita-cupping-30`, and `keita-moxa-45`.
- Bookings: examples include `b-tom-today-001`, `b-tom-live-003`, and `b-keita-past-201`.
- Sessions: `S-T-1001` and `S-K-2001`.
- Test-only records use additional readable IDs such as `b-life-delete`, `S-LIFE-delete`, `trash-session-link-test`, `group-patient-data`, and `google-event-2`.

The Drizzle schema currently expects UUID primary keys for `users`, `practitioners`, `patients`, `services`, `bookings`, `sessions`, `deletion_groups`, `google_integrations`, `audit_events`, and `email_logs`. These columns use `uuid(...).primaryKey().defaultRandom()`. `oauth_states.state` is text because OAuth state values are not entity IDs.

Referenced IDs that must be mapped consistently:

- `practitionerId`: present on practitioners, patients through a FHIR extension today, services, bookings, sessions, Google integration records, deletion metadata, and test fixtures.
- `patientId`: referenced by bookings and sessions.
- `serviceId`: referenced by bookings and sessions, with service snapshots also stored as names/durations.
- `bookingId`: referenced by sessions. Current booking objects may also carry `sessionId`, but the database design makes `sessions.booking_id` canonical.
- `sessionId`: present in current booking runtime objects as an optional transitional field only. It should not become a database column.
- `deletionGroupId`: referenced by Trash metadata on patients, bookings, sessions, and services, and represented by the future `deletion_groups.id` table.

Changing IDs is risky because relationships are spread across multiple arrays and fixtures. A partial ID migration could break practitioner scoping, booking-to-patient links, service snapshots, session links, Trash restore grouping, Google sync/import duplicate detection, and tests that assert concrete IDs.

Recommended v1 seed ID strategy:

- Do not change current runtime IDs in this task.
- For database seeds, use stable deterministic UUIDs.
- Create a future mapping from current demo string IDs to stable UUIDs.
- Keep all relationships intact by applying the mapping consistently across related records.
- Preserve the original human-readable IDs only as comments, mapping keys, fixture labels, booking codes, or optional metadata where useful.

Documentation-only mapping concept:

| Current demo ID | Future deterministic UUID concept |
| --- | --- |
| `prac-tom-cook` | fixed UUID for Tom Cook |
| `prac-keita-smith` | fixed UUID for Keita Smith |
| `P-T-1001` | fixed UUID for Alice demo patient |
| `tom-acu-60` | fixed UUID for Tom's 60 minute acupuncture service |
| `b-tom-today-001` | fixed UUID for first Tom demo booking |
| `S-T-1001` | fixed UUID for Tom linked demo session |

The actual UUID constants should be implemented later, for example in `src/db/seeds/ids.ts`, after this plan is reviewed.

## Seed categories

### 1. Development seeds

Data useful for local demo and development work:

- Demo practitioners from `src/lib/practitioners.ts`.
- Demo patients from `src/data/patients.ts`.
- Demo services from `src/data/services.ts`, including active and disabled examples.
- Demo bookings from `src/data/bookings.ts`, including today/upcoming/past/status examples if the seed script intentionally supports demo freshness.
- Demo sessions from `src/data/sessionsStore.ts`, including linked and no-booking examples.

### 2. Test fixtures

Data used only by tests:

- Overlap validation fixtures from booking route and time-picker tests.
- Lifecycle fixtures for archive, reactivate, Trash, restore, purge, and export behavior.
- Trash/restore view fixtures.
- CSV import fixtures.
- Google import/sync fixtures with fake events, fake tokens, fake calendars, and mocked `fetch`.
- Session route fixtures for archived patients and trashed booking links.

These should stay separate from development seeds so tests do not depend on a mutable local demo database.

### 3. Runtime constants

Data that should remain as constants:

- Booking status values and labels.
- Trash and lifecycle status helpers.
- Filter/sort options such as Trash sort labels.
- UI copy/constants.
- Service categories, if added later as true product taxonomy rather than practitioner-created services.
- Practitioner header names and helper constants until auth replaces demo scoping.

### 4. Future production data

Future production data should be created by real users and application workflows. No current demo data should be treated as production data.

## Seed table order

Based on the Drizzle schema, future seed inserts should use this order:

1. `users`, if included for development seed.
2. `practitioners`.
3. `deletion_groups`, only if testing trashed records.
4. `patients`.
5. `services`.
6. `bookings`.
7. `sessions`.
8. `google_integrations`, only for dev/test if safe.
9. `oauth_states`, normally not seeded.
10. `audit_events`, optional for lifecycle demos.
11. `email_logs`, optional/future only.

This order follows foreign key dependencies. Practitioners can reference users. Patients, services, bookings, sessions, Google integrations, deletion groups, audit events, and email logs all depend on practitioners. Bookings need patients, services, and practitioners. Sessions need patients and practitioners, and may reference bookings and services. Deletion groups are only needed before inserting trashed demo records that point to a group. OAuth states are short-lived security records and should normally be generated by the OAuth flow rather than seeded.

## Seed data shape by table

### Practitioners

Seed data should include:

- Stable UUID `id`.
- `display_name`.
- `email`.
- `initials`.
- Optional `avatar_url` or `icon`.
- Nullable `user_id` until auth exists.

### Patients

Seed data should include:

- Stable UUID `id`.
- `practitioner_id`.
- `active` state.
- `display_name`.
- Name/contact fields such as `first_name`, `last_name`, `phone`, `email`, `birth_date`, `gender`, and `preferred_language` where available.
- `fhir_json` when preserving the current FHIR-like source payload is useful.
- Archived or trashed examples only if they are intentionally useful for local development, and only with consistent lifecycle metadata.

### Services

Seed data should include:

- Stable UUID `id`.
- `practitioner_id`.
- `name`.
- `duration_minutes`.
- Active and disabled examples.
- Optional `description`.
- Optional future pricing fields only after the product actually uses pricing.

### Bookings

Seed data should include:

- Stable UUID `id`.
- `code`.
- `practitioner_id`.
- `patient_id`.
- `service_id`.
- `service_name` snapshot.
- `service_duration_minutes` snapshot.
- `start_at` and `end_at`.
- `status`.
- Optional `resource`, `notes`, and `status_updated_at`.
- Google sync fields only if useful for fake local demo scenarios.

Bookings should not contain `session_id` in database seeds because `sessions.booking_id` is canonical in the schema.

### Sessions

Seed data should include:

- Stable UUID `id`.
- `practitioner_id`.
- `patient_id`.
- Nullable `booking_id`.
- Optional `service_id`.
- `service_name` snapshot.
- `start_at`.
- Clinical/note fields such as `chief_complaint`, `treatment_summary`, `outcome`, `treatment_notes`, `pain_score`, `tcm_diagnosis`, `tcm_findings`, `points_used`, `techniques`, and `basic_vitals` where useful.
- At least one no-booking/walk-in session in future seed data by setting `booking_id = null`.

### Deletion Groups / Trash

Seed Trash data only if needed to demo Trash recovery. If seeded, keep patients, bookings, and sessions grouped consistently:

- One `deletion_groups` row per recoverable group.
- Matching `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, `deletion_type`, and optional `deletion_reason` on every trashed child row.
- Patient data deletion groups should include the patient plus linked bookings and sessions that were moved together.

### Google Integrations

Do not seed real tokens. Use fake/dev-only values only if a future local demo requires them. Never commit real Google access tokens, refresh tokens, client secrets, or calendar credentials.

If fake integration rows are ever seeded, they should use clearly fake encrypted-token placeholders and should not cause automatic network calls.

## Relative date strategy

Current booking and session samples use relative dates:

- `src/data/bookings.ts` uses `atOffset(...)` and `minuteOffsetToday(...)` to create today, live, upcoming, and past bookings based on the current date/time.
- `src/data/sessionsStore.ts` uses `new Date().setDate(...)` to create sessions relative to today.
- Some lifecycle tests intentionally use relative future/past dates to exercise archive behavior.

Relative dates make the dashboard feel fresh in local demo mode, but they are poor default database seed data because they can make tests flaky, hide data changes in production-like paths, and make seed reruns produce different rows.

Recommended direction for QiCu:

- For normal database seeds, prefer deterministic fixed dates.
- For UI demo freshness, relative dates may be useful but should be explicitly dev-only.
- If relative dates are kept for local demo mode, generate them inside a named seed script option such as `seedDev({ floatingDates: true })` rather than hiding them in production logic.
- Test fixtures should use fixed dates unless a test specifically validates relative-date behavior.

## Seed implementation options

### 1. TypeScript Drizzle seed script

Example future path:

- `src/db/seed.ts`
- Uses the Drizzle client.
- Imports deterministic UUID mapping constants.
- Inserts demo practitioners, patients, services, bookings, and sessions in schema order.
- Can reset a local database safely when explicitly requested.

Strengths:

- Keeps relationships readable in TypeScript.
- Can reuse ID mapping constants across dev seeds and fixtures.
- Can derive patient display/search fields from the current FHIR-like source shape.
- Can support an explicit dev-only floating-date option if QiCu keeps fresh dashboard demos.

Tradeoffs:

- Requires careful environment guardrails around reset behavior.
- Must avoid importing runtime stores in a way that causes accidental app behavior coupling.

### 2. SQL seed file

Example future path:

- `src/db/seeds/dev.sql`

Strengths:

- Very explicit database writes.
- Easy to inspect without running TypeScript.

Tradeoffs:

- Harder to maintain mapping constants and relationships.
- Harder to derive fields from FHIR-like payloads.
- More duplication with TypeScript fixtures.

### 3. Test fixtures only

Keep test data separate from development seeds.

Strengths:

- Tests stay deterministic and fast.
- Avoids coupling product demos to edge-case tests.

Tradeoffs:

- Does not provide a local demo database for manual development.

Recommended option:

Use a TypeScript Drizzle seed script later because QiCu already has TypeScript domain models, Drizzle schema files, and relationship-heavy seed data. Keep test fixtures separate from development seeds.

Do not implement the seed script in this task.

## Proposed future file structure

Recommended future structure:

```text
src/db/seeds/
  ids.ts
  demoPractitioners.ts
  demoPatients.ts
  demoServices.ts
  demoBookings.ts
  demoSessions.ts
  seedDev.ts

src/test/fixtures/
  bookings.ts
  lifecycle.ts
  google.ts
```

Purpose:

- `ids.ts`: deterministic UUID mapping from current demo string IDs to database UUIDs.
- `demoPractitioners.ts`: database-ready practitioner rows.
- `demoPatients.ts`: database-ready patient rows and FHIR JSON mapping.
- `demoServices.ts`: database-ready service rows.
- `demoBookings.ts`: database-ready booking rows with service snapshots.
- `demoSessions.ts`: database-ready session rows with optional booking links.
- `seedDev.ts`: local development seed orchestration and safety checks.
- `src/test/fixtures/*`: test-only builders and fixed records for overlap, lifecycle, Trash, import, and Google sync tests.

A simpler structure is acceptable if the first implementation is small, but keep development seeds and test fixtures separate.

## Local seed/reset commands

Future scripts could include:

- `db:seed`: run the local development seed script.
- `db:reset`: reset a local development database and rerun migrations/seeds.
- `db:push`: use Drizzle Kit for local schema pushing only if intentionally chosen.
- `db:migrate`: run Drizzle migrations.

Current scripts already include `db:generate`, `db:migrate`, and `db:studio`. Do not add seed/reset scripts until the seed implementation task.

Guardrails for any future reset command:

- The command must be clearly local/dev-only.
- It must never run against production accidentally.
- Check `NODE_ENV` and block when `NODE_ENV === 'production'`.
- Require an explicit confirmation flag such as `--confirm-local-reset`.
- Check `DATABASE_URL` for a local/dev database pattern when practical, for example localhost or a known local database name.
- Print the target database host/name before destructive actions.
- Avoid destructive reset behavior in migrations themselves.

## Migration safety notes

Risks and guardrails:

- Changing IDs can break relationships unless every related record uses the same mapping.
- Relative dates can make tests flaky and make seed reruns non-deterministic.
- Demo data should not leak into production.
- Seeded Google tokens must never be real.
- Archived and trashed seed examples must respect lifecycle metadata, including `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, and `deletion_type`.
- `sessions.booking_id` is canonical, so seeded linked sessions should use `booking_id`.
- Bookings should not contain `session_id` in database seeds.
- Patient practitioner ownership should be inserted through `patients.practitioner_id`; the current FHIR extension can remain in `fhir_json` if useful.
- Service snapshots on bookings and sessions should be preserved so history remains readable after service edits or deletion.
- Google integration seeds, if ever added, should use fake/dev-only values and should not trigger external API calls.
- OAuth states should normally not be seeded because they are short-lived security records.
- Reset commands must be local-only and must not be added as destructive production-capable scripts.

## Recommended next implementation task

Review this seed plan manually, then create deterministic seed ID mapping constants and a development seed script using Drizzle. The seed script should insert development data in schema order and keep test fixtures separate, but it should not wire app routes to database persistence yet.

## Implementation note: Phase B seed foundation

Drizzle Phase B seed foundation added deterministic UUID mappings and development seed files under `src/db/seeds/`:

- `ids.ts`
- `demoPractitioners.ts`
- `demoPatients.ts`
- `demoServices.ts`
- `demoBookings.ts`
- `demoSessions.ts`
- `seedDev.ts`
- `README.md`

The `db:seed` package script runs the development seed script with `tsx`. The script is non-destructive, uses idempotent inserts where existing IDs are skipped, blocks `NODE_ENV=production`, and requires `DATABASE_URL`.

Current runtime behavior remains unchanged. The app still uses in-memory stores, no API routes were rewritten, no repository layer was added, and no reset/destructive command was added.
