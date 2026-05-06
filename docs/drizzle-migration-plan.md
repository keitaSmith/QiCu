# QiCu Drizzle Migration Plan

## Summary

QiCu has chosen Drizzle for PostgreSQL persistence. This document does not implement the database yet.

The first implementation should be schema/migration foundation only. Existing in-memory stores remain the runtime source of truth until repositories are introduced and migrated domain by domain.

Phase A should install/configure Drizzle later, define schema files, generate the first migration draft, and preserve current application behavior.

## Why Drizzle

Drizzle is a practical fit for QiCu because it is:

- TypeScript-friendly.
- SQL-like and relatively transparent.
- A good fit for repository-based data access.
- Less magical than Prisma.
- Less manual than raw `pg`.
- Flexible enough to use PostgreSQL-specific custom SQL where needed.

QiCu needs PostgreSQL-specific control for lifecycle metadata, grouped restore behavior, partial indexes, check constraints, JSONB, explicit transactions, and booking availability queries. Drizzle gives us typed schema and query ergonomics while keeping the database model close to PostgreSQL.

## Packages to add later

Likely packages:

- `drizzle-orm`
- `drizzle-kit`
- `pg`
- `@types/pg` if needed

Current package note:

- `pg` already exists in `dependencies`.
- `@types/pg` already exists in `devDependencies`.

Important:

- Inspect `package.json` again before implementation.
- Do not add packages during documentation tasks.
- The implementation task should add only the Drizzle packages that are actually needed.

## Proposed file structure

Recommended structure:

```text
src/db/
  client.ts
  schema/
    users.ts
    practitioners.ts
    deletionGroups.ts
    patients.ts
    services.ts
    bookings.ts
    sessions.ts
    google.ts
    audit.ts
    email.ts
    index.ts
  migrations/
```

Compatibility with existing code:

- The project already has `src/lib/db.ts`.
- Preserve `/api/health` during transition.
- Recommended implementation path: create `src/db/client.ts` for the Drizzle client, then update `src/lib/db.ts` only when safe to re-export or wrap the new client.
- Do not break the existing `db.query('SELECT 1 as ok')` health-check behavior during Phase A.

Why `src/db/`:

- It separates database infrastructure from domain libraries in `src/lib/`.
- It gives Drizzle schema/migration code a clear home.
- Repositories can live separately under `src/lib/repositories/` and import the Drizzle client/schema.

## Drizzle config plan

Plan a root-level config file:

```text
drizzle.config.ts
```

Config should document:

- Schema path: `src/db/schema/index.ts`
- Migrations output folder: `src/db/migrations`
- Dialect: PostgreSQL
- Connection string from `DATABASE_URL`
- Environment loading behavior for local development
- No production secrets committed to source control

Implementation notes:

- Do not create `drizzle.config.ts` until the implementation task.
- Confirm how Drizzle Kit reads environment variables in this Next.js project.
- Keep `.env.local` out of source control.
- Avoid hardcoding database URLs in config files.

## Schema module plan

Prefer split schema files for QiCu.

Recommended files:

- `src/db/schema/users.ts`
- `src/db/schema/practitioners.ts`
- `src/db/schema/deletionGroups.ts`
- `src/db/schema/patients.ts`
- `src/db/schema/services.ts`
- `src/db/schema/bookings.ts`
- `src/db/schema/sessions.ts`
- `src/db/schema/google.ts`
- `src/db/schema/audit.ts`
- `src/db/schema/email.ts`
- `src/db/schema/index.ts`

Reason:

- The schema is broad enough that one giant `schema.ts` would get noisy quickly.
- Lifecycle fields repeat across several tables and are easier to review when grouped consistently.
- Split files make future Codex tasks easier to scope.

Guardrail:

- Do not over-split into tiny helper abstractions before the first migration. Keep table definitions readable and close to the schema design document.

## Table implementation order

Safest Drizzle table order:

1. `users`
2. `practitioners`
3. `deletion_groups`
4. `patients`
5. `services`
6. `bookings`
7. `sessions`
8. `google_integrations`
9. `oauth_states`
10. `audit_events`
11. `email_logs`, optional/future

Ordering reasons:

- `practitioners` can reference `users`.
- Core records need `practitioners`.
- Trash-enabled records reference `deletion_groups`.
- `bookings` depend on patients, services, and practitioners.
- `sessions` depend on patients, bookings, services, and practitioners.
- Google integration and OAuth state depend on practitioners.
- Audit and email logs reference core entities after they exist.

## Drizzle schema decisions

Represent these schema concepts as follows:

- UUID primary keys: use Drizzle UUID columns with database defaults if the implementation chooses database-generated IDs, or app-supplied UUIDs if preserving current ID generation.
- `timestamptz`: use PostgreSQL timestamp columns with timezone semantics.
- `jsonb`: use JSONB for `patients.fhir_json`, `sessions.tcm_findings`, `sessions.basic_vitals`, and `audit_events.metadata`.
- Text arrays: use PostgreSQL text arrays for `sessions.points_used` and `sessions.techniques`.
- Status values: use `text` plus check constraints, not PostgreSQL enums, for early iteration.
- Nullable foreign keys: use nullable references for optional relationships such as `sessions.booking_id`, `bookings.service_id`, and `sessions.service_id`.
- Lifecycle columns: add `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, `deletion_type`, and `deletion_reason` to patients, services, bookings, and sessions.
- Archive columns: add `active` and `archived_at` to patients and services.
- Deletion groups: define `deletion_groups` as its own table.
- Google tokens: define encrypted token text fields, not plaintext token fields.
- Audit events: use JSONB metadata for impact counts, reasons, export metadata, and sync details.

Keep the schema design decision:

- Use text + check constraints rather than PostgreSQL enums for the first implementation.

## PostgreSQL-specific SQL notes

Some schema details may require custom SQL migrations even with Drizzle.

Likely custom SQL:

- Partial index for booking availability:
  - `bookings` where `deleted_at is null` and `status in ('confirmed', 'pending')`
- Check constraints for booking status values.
- Check constraints for deletion type values.
- Check constraints for external sync status values.
- Check constraint for `restore_until > deleted_at` where both are present.
- Check constraint for `bookings.end_at > bookings.start_at`.
- Check constraint for positive service/booking durations.
- Optional future trigram or full-text search indexes.
- Possible future GiST/range availability constraint.

Plan:

- Use Drizzle for table definitions.
- Use custom SQL in migration files when PostgreSQL-specific constraints or indexes are clearer in SQL.
- Keep custom SQL documented near the corresponding table schema.

## Repository transition plan with Drizzle

Drizzle should sit behind repositories, not route handlers.

Rules:

- Route handlers should not import Drizzle tables directly.
- Route handlers should call repositories.
- Repositories should use Drizzle.
- Repository methods should accept `practitionerId` explicitly where scoping is required.
- API response shapes should stay stable during transition.
- `booking.sessionId` can be computed from `sessions.booking_id` in repository reads.

Recommended future repositories:

- `practitionersRepository`
- `patientsRepository`
- `servicesRepository`
- `bookingsRepository`
- `sessionsRepository`
- `lifecycleRepository`
- `trashRepository`
- `googleIntegrationsRepository`

Transition approach:

- First introduce repositories backed by current in-memory stores if needed.
- Then switch internals to Drizzle one domain at a time.
- Keep tests focused on repository behavior and API response compatibility.

## Local development database plan

Decisions still needed:

- Local PostgreSQL setup.
- `DATABASE_URL` value in `.env.local`.
- Reset/seed command.
- Whether to use Docker for local development.
- Whether hosted development uses Vercel Postgres, Neon, Supabase, or another provider.

Do not choose a hosting provider in this task.

Recommended local guardrails:

- Keep local database setup documented.
- Keep production secrets out of the repo.
- Add reset/seed commands only after schema and seed strategy are clear.
- Make destructive reset commands obviously local/dev-only.

## Seed plan with Drizzle

Current demo data should become development seeds or fixtures:

- Demo practitioners from `src/lib/practitioners.ts`.
- Demo patients from `src/data/patients.ts`.
- Demo services from `src/data/services.ts`.
- Demo bookings from `src/data/bookings.ts`.
- Demo sessions from `src/data/sessionsStore.ts`.

Seed decisions:

- Decide whether to preserve current string IDs or map them to UUIDs.
- If mapping to UUIDs, create deterministic mappings for fixtures/tests.
- Avoid production dependency on seed/demo data.
- Avoid relative dynamic seed dates unless they are explicitly dev-only.
- Keep seed data separate from app business logic.

Possible seed implementation later:

- TypeScript seed script using Drizzle.
- SQL seed file for simple deterministic data.
- Test fixtures separate from development seeds.

## Validation plan for first Drizzle implementation

Future implementation should run:

```bash
npm test
npx tsc --noEmit
npm run build
```

Also add or run:

- Migration generation check.
- Migration apply check.
- Seed/reset check.
- `/api/health` database check.

Phase A should not require route behavior changes, so existing tests should remain stable.

## Phase A implementation note

Phase A was implemented with:

- `drizzle-orm` as a runtime dependency.
- `drizzle-kit` as a development dependency.
- Root `drizzle.config.ts`.
- Split schema files under `src/db/schema/`.
- A separate Drizzle client in `src/db/client.ts`.
- Initial generated migration under `src/db/migrations/`.

The generated migration includes the PostgreSQL-specific check constraints and booking availability partial index from the schema files. `src/lib/db.ts` remains unchanged so `/api/health` keeps its existing `pg` pool behavior during transition.

## Risks and guardrails

Risks:

- Accidentally changing API response shapes.
- Breaking `/api/health`.
- Mixing Drizzle calls directly into route handlers.
- Partial migrations where one domain uses the database and another still uses memory.
- Lifecycle operations needing transactions.
- Google tokens needing encryption before production.
- Schema drift between docs and Drizzle files.
- Drizzle-generated migrations missing PostgreSQL-specific constraints that QiCu depends on.

Guardrails:

- Use repositories.
- Migrate one domain at a time.
- Keep tests passing.
- Commit after each phase.
- Do not combine database work with auth, email, dashboard redesign, or marketing changes.
- Review generated migrations against `docs/database-schema-design.md`.
- Add custom SQL migration statements when Drizzle output is not explicit enough.

## Recommended next implementation task

Install and configure Drizzle/Drizzle Kit, create the initial schema files and first migration draft, but do not rewrite app API routes yet.

The implementation task should:

- Add required Drizzle packages.
- Add `drizzle.config.ts`.
- Add `src/db/client.ts`.
- Add split schema files under `src/db/schema/`.
- Generate or draft the first migration.
- Preserve `src/lib/db.ts` and `/api/health` behavior during transition.
