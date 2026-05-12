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

Phase H.0 readiness note:

- Auth has not been implemented yet. QiCu still uses the transition `x-qicu-practitioner-id` header through `getPractitionerIdFromRequest`, and the dashboard still sends that header from demo practitioner context.
- The repository layer is ready for auth because scoped methods already accept public practitioner IDs and keep database UUIDs internal.
- The existing schema already includes `users` and nullable `practitioners.user_id`, but it does not yet include app session or password credential tables.
- Recommended next direction is server-side opaque sessions in secure, HttpOnly cookies, backed by PostgreSQL, with auth-derived practitioner scope replacing the header in staged Phase H steps.
- See `docs/phase-h-auth-readiness.md` for the scoping inventory, proposed schema model, Phase H sub-phase plan, security considerations, and test plan.

Phase H.1 implementation note:

- Added additive `password_credentials` and `auth_sessions` schema plus a partial unique index on `practitioners.user_id` for the initial one-user-one-practitioner model.
- Password credentials store bcrypt password hashes and an explicit algorithm name; plaintext passwords are never stored or seeded.
- Auth sessions use opaque random tokens and persist only SHA-256 token hashes plus expiry/revocation metadata.
- Added low-level password, session-token, and internal auth repository helpers for future login/logout work.
- No login/logout routes, cookies, middleware enforcement, dashboard auth UI, API behavior changes, Google changes, or `x-qicu-practitioner-id` changes were added in H.1.

Phase H.2 implementation note:

- Added `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` as the first runtime auth/session-cookie foundation.
- Login verifies bcrypt password credentials, creates an opaque session token, stores only the SHA-256 token hash in `auth_sessions`, and sets a secure HttpOnly `qicu_session` cookie.
- Logout revokes the hashed session when present and clears the cookie while returning `{ ok: true }`.
- `/api/auth/me` returns safe public auth state only: authenticated flag, user email/name, and a public practitioner shape when safely resolvable. It does not expose DB UUIDs, password hashes, session token hashes, or cookie values.
- Login/logout POST routes reject clearly cross-origin requests when an `Origin` header does not match the request origin.
- Existing business/domain routes are not protected yet, and `getPractitionerIdFromRequest`, `x-qicu-practitioner-id`, dashboard practitioner context, Google behavior, and existing API response shapes remain unchanged until later Phase H steps.

Phase H.3 implementation note:

- Added a central authenticated request-scope seam in `src/lib/auth/requestScope.ts`.
- `getPractitionerIdFromRequest` now prefers valid session-derived practitioner scope when available, while preserving legacy header/default behavior unless `QICU_AUTH_ENFORCEMENT=strict` is set.
- In strict mode, missing/invalid/expired/revoked sessions do not fall back to `x-qicu-practitioner-id`; authenticated session scope wins over conflicting headers.
- The request-scope helper returns public practitioner IDs and safe user context only; DB UUIDs stay internal.
- Representative strict-mode handling was wired into `/api/bookings` and `/api/integrations/google/auth-url`. The Google callback continues to rely on the DB-backed OAuth state created by auth-url.
- Dashboard/client behavior is unchanged. `withPractitionerHeaders`, `PractitionerContext`, and manual practitioner selection remain until H.4. The legacy header fallback remains transitional and should be removed or locked down in H.5.

Phase H.4 implementation note:

- The dashboard/client practitioner context now loads `/api/auth/me` and uses the authenticated public practitioner as the current scope when a valid session exists.
- Authenticated/session-mode dashboard fetches include cookies and omit `x-qicu-practitioner-id`; demo-mode fetches continue to send the legacy header for local development and existing tests.
- Manual practitioner switching is now limited to demo mode. In session mode, the profile menu shows the authenticated practitioner identity without allowing arbitrary client-selected scope.
- The legacy server header fallback remains for H.5, and no dashboard auth UI, middleware, business API response shape change, Google behavior change, or domain workflow change was added.

Phase H.5 implementation note:

- Protected practitioner-scoped API routes now use a shared scope-or-auth-response helper so strict mode returns consistent `401`/`403` JSON auth errors instead of falling back to `x-qicu-practitioner-id`.
- `QICU_AUTH_ENFORCEMENT=strict` now treats authenticated session-derived practitioner scope as the trusted server path across bookings, patients, patient subroutes, services, sessions, Trash, and Google integration routes.
- A valid session wins over conflicting practitioner headers; missing/invalid/expired/revoked sessions return `401`; authenticated users without a linked practitioner return `403`.
- Default/demo mode still preserves the legacy header/default fallback for local development and tests. This fallback remains transitional and should not be the production authenticated path.
- Google callback remains compatible through DB-backed OAuth state and does not trust practitioner headers. No Google token behavior, business success response shape, schema, middleware, dashboard UI, signup, password reset, or email flow changed.

Phase H.6 completion audit note:

- Phase H is complete for the planned auth/session foundation and authenticated practitioner-scope transition.
- Password credentials store hashes only, auth sessions store opaque session token hashes only, login/logout/session cookie behavior is in place, and `/api/auth/me` returns safe public auth state.
- Dashboard session mode uses `/api/auth/me`, sends cookies, and omits `x-qicu-practitioner-id`; demo mode remains explicit for local development/tests.
- Strict mode now provides the authenticated production path: protected practitioner-scoped API routes resolve session-derived public practitioner scope and return clean `401`/`403` errors when auth scope is missing or invalid.
- Production should set `QICU_AUTH_ENFORCEMENT=strict`, use HTTPS, avoid demo fallback, set `GOOGLE_TOKEN_ENCRYPTION_KEY` before Google token paths are used, and consider CSRF-token hardening if QiCu needs stronger protection than SameSite cookies plus the shared origin/fetch-metadata guard.
- The production operator runbook now lives in `docs/production-operator-runbook.md` and covers deployment, provisioning, smoke testing, Google setup, and recovery.
- Remaining auth work is product/UX hardening: login page/redirects, signup/invite, password reset, email verification, optional CSRF token strategy, optional middleware redirects, and production runbooks.

Strict browser login flow note:

- `/login` now provides a minimal email/password form backed by `POST /api/auth/login`; successful login uses the server-set HttpOnly `qicu_session` cookie and redirects to the dashboard.
- The dashboard layout reads `/api/auth/me` and redirects unauthenticated strict-mode visitors to `/login`, while preserving demo/header fallback behavior when strict auth is not enabled.
- The dashboard profile menu includes a minimal logout action backed by `POST /api/auth/logout`.
- Signup, invite flow, password reset, email verification, broad middleware redirects, schema changes, and business/domain response shape changes remain out of scope.

Local development auth fixture note:

- `npm run db:seed:auth-dev` seeds a local-only password user for manual strict-mode browser testing.
- The fixture refuses to run in production, hashes the password with the existing auth helper, and links `dev@qicu.local` to the existing seeded practitioner `prac-keita-smith`.
- The local-only password is documented in the H readiness doc for development testing only. Production user creation still needs a real signup, invite, or admin provisioning flow.

Post-auth strict-mode checkpoint note:

- The strict browser flow was smoke-tested locally: `/dashboard` redirects to `/login` when logged out in strict mode, the dev fixture account logs in, dashboard domain pages load without `401`, and logout returns to `/login`.
- Production readiness is now tracked in `docs/auth-production-readiness-checklist.md`.
- Production must keep `QICU_AUTH_ENFORCEMENT=strict`, use HTTPS, configure production PostgreSQL, set `GOOGLE_TOKEN_ENCRYPTION_KEY` before Google token paths are used, and avoid the dev auth fixture/demo fallback.
- Remaining production auth work includes signup/invite/admin provisioning, password reset/email verification, optional CSRF token hardening, optional middleware/page redirects, and production operator runbooks.

Admin auth provisioning note:

- `npm run auth:create-user` now provides an explicit operator/admin path for creating or updating a password-backed user and linking that user to an existing practitioner by public practitioner ID.
- The command requires `DATABASE_URL`, `QICU_CREATE_USER_EMAIL`, `QICU_CREATE_USER_PASSWORD`, `QICU_CREATE_USER_NAME`, and `QICU_CREATE_USER_PRACTITIONER_ID`.
- It hashes passwords through the existing auth helper, stores no plaintext password, prints only safe public fields, and rejects unsafe practitioner relinking by default.
- `QICU_CREATE_USER_ALLOW_RELINK=true` is required for intentional practitioner/user relinking.
- The local dev auth fixture remains separate under `npm run db:seed:auth-dev` and still refuses in production.

Admin UI provisioning note:

- `/dashboard/admin/users` and `POST /api/admin/users` provide a minimal authenticated operator UI/API for creating practitioner login accounts without public signup.
- Admin access now supports a persisted DB `admin` role in `user_roles`. `QICU_ADMIN_EMAILS` remains as a comma-separated bootstrap fallback for authenticated user emails.
- The admin API reuses the same provisioning helper as `npm run auth:create-user`, so password hashing, public practitioner ID lookup, safe output, and relink guardrails stay aligned.
- `npm run auth:grant-admin` and `npm run auth:revoke-admin` manage the persisted admin role for existing users by email.
- `/api/admin/practitioners` returns safe public practitioner fields for the admin UI, and `/dashboard/admin/users` now uses a searchable QiCu-styled practitioner picker instead of requiring manual public ID entry.
- No signup, invite email delivery, password reset, email verification, organization model, business response shape change, or Google behavior change was added.

Production auth hardening note:

- Production no longer allows accidental demo/header practitioner fallback.
- `QICU_AUTH_ENFORCEMENT=strict` remains the explicit production setting and should still be configured in deployed environments.
- As a safety backstop, `NODE_ENV=production` now behaves as strict auth by default even if `QICU_AUTH_ENFORCEMENT` is missing or misconfigured.
- Local development and test mode still preserve demo/header fallback when strict auth is not enabled.

Mutating route origin guard note:

- Protected `POST`, `PATCH`, and `DELETE` API handlers now use a shared origin guard.
- Clearly cross-origin requests with a mismatched `Origin` header return `403` with a simple `{ "error": "Forbidden" }` body.
- Strict/production mode also rejects requests without `Origin` when browser fetch metadata explicitly reports `Sec-Fetch-Site: cross-site`.
- Missing `Origin` without cross-site browser metadata remains allowed for non-browser clients, tests, and local tooling.
- Read-only `GET` routes and the Google OAuth callback flow remain compatible.

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

## Implementation note: Phase E completion audit

The Phase E completion audit confirmed that practitioners, services, patients, bookings, and sessions are now Drizzle-backed at the repository layer when PostgreSQL is available. Public IDs remain stable across all migrated domains, and database UUID primary keys remain internal to repository mapping code.

Booking/session compatibility remains aligned with the Phase E design: `bookings.public_id` and `sessions.public_id` preserve current app IDs, `sessions.booking_id` is the canonical nullable database relationship, and `bookings.session_id` was not added. Booking responses can still expose transitional computed `sessionId` values as public session IDs where current UI and task flows need them.

Lifecycle/Trash and Google integration remain deferred. Lifecycle/Trash uses in-memory helpers plus transition mirroring/sync for running-session behavior, while grouped Trash restart persistence remains a Phase F responsibility. Google integration state remains in-memory and no Google tokens are persisted to PostgreSQL.

API routes still do not import Drizzle directly. Phase F can begin after manual browser smoke testing of booking/session creation, linked sessions, patient export, and same-session Trash restore flows.

## Implementation note: Phase F.0 lifecycle/Trash readiness audit

Phase F.0 audited the remaining lifecycle and Trash transition boundary before moving `lifecycleRepository` or `trashRepository` to Drizzle-backed transactional behavior. Practitioners, services, patients, bookings, and sessions remain Drizzle-backed at the repository layer; lifecycle/Trash still uses in-memory helpers with narrow transition sync; Google integration remains in-memory.

The current schema already includes the main lifecycle persistence building blocks: `deletion_groups`, lifecycle metadata columns on patients/services/bookings/sessions, restore-window checks, deletion-type checks, and `audit_events`. Phase F.1 should review whether additional child-table indexes on `deletion_group_id` and `restore_until` are needed for Trash grouping and purge efficiency, but no broad product-field migration is required before starting.

Recommended Phase F order is: build the DB-backed deletion group/Trash read model first, then migrate patient archive/reactivate and grouped Delete Patient Data transactions, then individual booking/session/service Trash transactions, then DB-backed purge, then lifecycle-aware patient export. Grouped Trash restart persistence remains the core Phase F goal, and API routes should continue to call repositories rather than importing Drizzle directly.

## Implementation note: Phase F.1 DB-backed Trash read model

Phase F.1 moved the Trash recovery read model in `trashRepository` to Drizzle/PostgreSQL when the database is available. The `/api/trash` route still returns the same raw Trash payload shape, while the repository maps persisted patient, booking, session, and service Trash metadata back to public IDs and current UI-compatible objects.

The DB read model is anchored on `deletion_groups`, preserves patient-data grouping semantics, suppresses grouped child records from top-level individual records, and keeps individual booking/session/service Trash records visible as individual restore items. Lifecycle write operations were not migrated yet; non-production/test fallback behavior still preserves current same-session in-memory Trash records during the transition.

No schema or index migration was added in this phase. Phase F.2 can now move patient archive/reactivate and grouped Delete Patient Data writes to database transactions.

## Implementation note: Phase F.2 patient lifecycle transactions

Phase F.2 moved patient archive/reactivate and grouped Delete Patient Data writes into Drizzle-backed `lifecycleRepository` transactions when PostgreSQL is available. Archive remains distinct from Delete Patient Data: it updates archive state, can still cancel future bookings when requested, and does not set `deleted_at` or `deletion_group_id`.

Delete Patient Data now persists one `deletion_groups` row plus matching Trash metadata on the patient, linked bookings, and linked sessions. Grouped patient restore verifies practitioner scope and restore windows, then clears the group metadata atomically. Public IDs remain the API/UI identifiers, and database UUIDs stay internal to repository logic.

Individual booking/session/service Trash write migrations remain deferred to Phase F.3, purge remains deferred to Phase F.4, and Google integration remains in-memory. API routes continue to call repositories/helpers rather than importing Drizzle directly.

## Implementation note: Phase F.3 individual lifecycle transactions

Phase F.3 moved individual booking, session, and service Trash delete/restore writes into Drizzle-backed `lifecycleRepository` transactions when PostgreSQL is available. Each individual delete creates one `deletion_groups` row with the matching deletion type and persists Trash metadata on the affected record.

Booking Trash delete preserves current relationship behavior by unlinking active linked sessions without deleting session records. Session Trash delete preserves the database canonical `sessions.booking_id` relationship on the trashed session row while clearing the transitional runtime booking/session link where current behavior expects it. Service Trash delete remains separate from service disable, and restoring a service does not change its disabled/active state.

The DB-backed Trash read model can now reconstruct individual booking/session/service recovery items after restart. Patient-data grouped children remain suppressed from top-level individual records. Purge remains deferred to Phase F.4, patient export remains deferred to Phase F.5, and Google integration remains in-memory.

## Implementation note: Phase F.4 DB-backed purge helper

Phase F.4 moved `purgeExpiredTrash` to a Drizzle-backed helper/admin operation when PostgreSQL is available. No scheduler, cron, dashboard UI, public route, or destructive reset script was added.

The purge helper permanently removes only expired Trash records whose deletion group restore window has passed. Patient-data groups are purged atomically in foreign-key-safe order: grouped sessions, grouped bookings, grouped patient, then the deletion group. Individual booking, session, and service groups are purged independently after their child restore windows are verified as expired.

Deletion groups are removed only after their child records are purged, and expired orphan deletion groups are cleaned up. Service purge preserves historical booking/session snapshots because service references are nullable while snapshot names/durations remain on historical rows. Public IDs remain stable for remaining records, and DB UUIDs stay internal. Patient export remains the main Phase F.5 follow-up.

## Implementation note: Phase F.5 DB-backed patient export

Phase F.5 moved full patient export reads to Drizzle/PostgreSQL when the database is available. The export response shape remains unchanged and includes the FHIR-like patient profile plus linked bookings and sessions for the scoped practitioner/patient.

Exported records use public IDs, not database UUIDs. Booking and session service snapshots remain readable even if services are disabled, trashed, or purged because snapshot fields remain on booking/session rows. Lifecycle-aware export now reflects persisted archive, Trash, restore, and purge state after app restart: existing linked rows are exported, while purged rows are omitted because they no longer exist.

Non-production/test fallback still supports existing in-memory export behavior for test fixtures and custom runtime data. Phase F completion audit can run next.

## Implementation note: Phase F completion audit

The Phase F completion audit confirmed that lifecycle/Trash persistence is DB-backed where intended. Patient archive/reactivate, grouped Delete Patient Data, grouped restore, individual booking/session/service Trash delete and restore, expired Trash purge, and patient export now use Drizzle/PostgreSQL when available.

The Trash read model remains DB-backed and reconstructs grouped patient Trash items plus individual booking/session/service recovery records from persisted lifecycle metadata. Purge remains a callable/admin-only helper; no scheduler, cron, public purge route, dashboard purge UI, reset script, truncate script, or drop script was added.

Public IDs remain stable, DB UUIDs remain internal, API response/export shapes remain stable, and API routes still do not import Drizzle directly. Google integration remains in-memory and should be handled in Phase G.

Remaining transition mirrors in `patientsStore`, `BOOKINGS`, `sessionsStore`, and `servicesStore` still support test/non-production fallback and compatibility paths. A future cleanup can reduce those mirrors after the remaining Google/auth persistence boundaries are addressed.

## Implementation note: Phase G.0 Google persistence readiness

The Phase G.0 readiness audit documented the remaining Google integration persistence boundary in `docs/phase-g-google-persistence-readiness.md`. Google integration state, selected calendar state, and OAuth state still use the in-memory `googleIntegrationsRepository` wrapper today; no Google runtime state was migrated to PostgreSQL in this audit.

The existing schema already includes `google_integrations`, `oauth_states`, and booking external sync fields. A minimal Phase G implementation can use those tables, but encrypted token handling must be implemented before real access or refresh tokens are persisted. OAuth states should become short-lived, practitioner-scoped, one-time DB records, and selected calendar/status/disconnect behavior should move behind the repository without changing response shapes.

Google booking create/update/delete fallback behavior, import preview, reconcile, public API response shapes, public IDs, and the no-token-public-response rule must remain stable. No scheduler, cron sync job, dashboard purge/sync UI, auth, email, or real token seed data was added.

## Implementation note: Phase G.1 Google token encryption preflight

Phase G.1 added a standalone Google token encryption utility using AES-256-GCM with versioned payloads suitable for future `google_integrations.access_token_encrypted` and `google_integrations.refresh_token_encrypted` storage. The utility validates `GOOGLE_TOKEN_ENCRYPTION_KEY` only when encryption/decryption is called, so normal app boot and current in-memory Google behavior do not require the key yet.

`GOOGLE_TOKEN_ENCRYPTION_KEY` must be a strong 32-byte secret encoded as base64 or base64url. A suitable local generation command is `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Losing or rotating this key without a migration plan will make persisted encrypted tokens undecryptable once token persistence is enabled.

No Google runtime persistence was added in Phase G.1. OAuth state remains in-memory, OAuth routes and Google sync behavior are unchanged, real Google tokens are not persisted to PostgreSQL, API response shapes are unchanged, and no schema migration was needed because the existing Google tables already have encrypted token text columns and OAuth state expiry/consumption fields.

## Implementation note: Phase G.2 DB-backed OAuth state

Phase G.2 moved Google OAuth state creation and consumption behind DB-backed `googleIntegrationsRepository` internals when PostgreSQL is available. `createOAuthState` now persists short-lived practitioner-scoped rows in `oauth_states`, and `consumeOAuthState` atomically consumes only unexpired, unconsumed state rows while returning the same public practitioner ID shape expected by the callback flow.

OAuth route behavior and response shapes remain unchanged. Expired, missing, and already consumed states are rejected, and opportunistic cleanup of expired/consumed OAuth state rows happens during state creation without adding a scheduler, cron job, cleanup route, or UI.

Real Google access/refresh/ID tokens are still not persisted, `googleTokenEncryption` is not wired into runtime token storage yet, and Google integration status, selected calendar, connected account metadata, and token state remain in-memory until later Phase G work. No schema migration was needed because the existing `oauth_states` table already has practitioner scoping, expiry, and consumed timestamp fields.

## Implementation note: Phase G.3 Google integration metadata

Phase G.3 moved non-secret Google integration metadata behind DB-backed `googleIntegrationsRepository` internals when PostgreSQL is available. The repository now persists practitioner-scoped connected account email, selected calendar ID/name, connected metadata, last error, and timestamps to `google_integrations` while preserving the existing in-memory token-bearing runtime record for actual Google API operations.

Selected calendar saves are now mirrored to `google_integrations` for the scoped practitioner, and disconnect marks DB metadata disconnected while clearing selected calendar metadata, token encrypted columns, token expiry, last error, and connected timestamp. Disconnect also clears the in-memory runtime integration so the current process becomes disconnected immediately.

No real access tokens, refresh tokens, ID tokens, authorization codes, encrypted tokens, token refresh responses, or authorization headers are persisted in Phase G.3. Public status shape is unchanged and does not expose tokens. To avoid a misleading connected-after-restart state before encrypted token persistence exists, status only reports `connected: true` when the current runtime still has a usable in-memory token-bearing integration; full restart-persistent usable Google connection remains Phase G.4.

OAuth state remains DB-backed from Phase G.2. OAuth routes, Google sync behavior, calendar list behavior, import/reconcile response shapes, dashboard UI, and booking workflows remain unchanged. No schema migration, PKCE, scheduler, cron job, or cleanup UI was added.

## Implementation note: Phase G.4 encrypted Google token persistence

Phase G.4 wired the existing Google token encryption utility into `googleIntegrationsRepository`. When PostgreSQL is available, Google access and refresh tokens are persisted only as encrypted AES-256-GCM payloads in `google_integrations.access_token_encrypted` and `google_integrations.refresh_token_encrypted`; plaintext tokens are not written to database columns, public status/API responses, logs, or docs.

`GOOGLE_TOKEN_ENCRYPTION_KEY` is now mandatory for token persistence/decryption paths, but normal app boot still does not require it unless a Google token path is used. Public status shape remains unchanged and can report `connected: true` after restart only when the DB row is connected, encrypted token payloads are present as needed, the encryption key is valid, and tokens can be decrypted. Metadata-only or undecryptable rows are treated as not connected to avoid a misleading usable connection state.

Internal Google helper paths can now load/decrypt DB-backed tokens through repository internals. Successful refresh persists the newly encrypted access token and updated expiry while preserving the existing encrypted refresh token if Google does not return a replacement. Disconnect clears runtime token state plus encrypted token columns, token expiry, selected calendar metadata, last error, and connected timestamp.

OAuth state remains DB-backed from Phase G.2, and non-secret metadata/selected calendar state remains DB-backed from Phase G.3. Google sync fallback behavior, calendar list behavior, import preview, reconcile response shapes, dashboard UI, booking workflows, public IDs, and API response shapes remain unchanged. No schema migration, PKCE, scheduler, cron job, background sync, or token refresh UI was added.

## Implementation note: Phase G.5 Google workflow verification

Phase G.5 verified the main Google workflows against DB-backed encrypted integration state. Calendar list, selected calendar save, events preview, reconcile, and booking create/update/delete sync can use encrypted `google_integrations` tokens internally after the in-memory Google runtime store is cleared.

The downstream token refresh path was verified through a calendar workflow: expired encrypted access tokens are refreshed with the encrypted refresh token, the new access token and expiry are persisted encrypted, and the refresh token is preserved when Google does not return a replacement. Booking local workflow fallback remains unchanged when Google/token operations fail; local booking mutations still survive and record sync error state.

Public status/API responses continue to hide plaintext tokens, encrypted token payloads, authorization headers, and refresh payloads. The calendar-selection route now strips internal token-bearing fields from its JSON response. API response shapes used by the dashboard remain stable, API routes still do not import Drizzle directly, and no schema migration, scheduler, cron job, background sync, PKCE, token refresh UI, dashboard UI change, or Google network dependency was added.

The DB-backed G.5 workflow tests require local PostgreSQL and a test `GOOGLE_TOKEN_ENCRYPTION_KEY`; they use mocked Google network responses and fake token strings only. Existing full-suite `DATABASE_URL` test-isolation limitations remain separate hygiene work because some route tests still mutate in-memory fixtures while DB-mode repositories read/write PostgreSQL.

## Implementation note: Phase G completion audit

The Phase G completion audit confirmed that Google persistence is DB-backed where intended. OAuth state creation/consumption uses short-lived, practitioner-scoped, one-time `oauth_states` rows; Google metadata, selected calendar, disconnect state, encrypted token persistence, token refresh updates, and downstream Google workflows now use `google_integrations` through repository/helper seams when PostgreSQL is available.

Google access and refresh tokens are stored only as encrypted AES-256-GCM payloads. `GOOGLE_TOKEN_ENCRYPTION_KEY` is required only for token persistence/decryption paths, not normal app boot. Public status/API responses do not return plaintext tokens, encrypted token payloads, authorization headers, refresh payloads, or database UUIDs. Missing/invalid encryption configuration fails closed for token paths, and disconnect clears encrypted token columns plus runtime token state.

Calendar list, selected calendar save, events preview, reconcile, booking create/update/delete sync, and downstream token refresh were verified against DB-backed encrypted integration state after clearing the in-memory Google runtime store. Local booking workflow fallback remains unchanged when Google/token operations fail.

Phase G did not add schema migrations, scheduler/cron/background sync, PKCE, auth, email, token refresh UI, dashboard UI changes, or real Google token seed data. API routes continue to call repositories/helpers rather than importing Drizzle directly. The remaining full-suite `DATABASE_URL` route-test isolation issue is future test hygiene only: some older route tests mutate in-memory fixtures while DB-mode repositories read/write PostgreSQL.
