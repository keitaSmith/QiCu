# Phase H Auth Readiness

## Summary

Phase H should replace QiCu's demo/header practitioner scoping with authenticated application sessions. This is an audit and implementation plan only: no runtime auth behavior, schema migration, API response shape, dashboard UI, Google integration behavior, or practitioner scoping behavior changed in H.0.

The database-backed foundation is ready for auth because repository methods already accept a practitioner scope at their boundary and keep database UUIDs internal. The main future change is to derive that practitioner scope from a trusted server-side session instead of the user-controlled `x-qicu-practitioner-id` transition header.

## Current State

- Core persistence through Phase G is DB-backed where intended: practitioners, services, patients, bookings, sessions, lifecycle/Trash, patient export, OAuth state, Google metadata, selected calendar, encrypted Google token persistence, token refresh, and Google workflow verification.
- Public IDs remain the API/UI boundary. Practitioner IDs such as `prac-tom-cook` and `prac-keita-smith` still appear externally.
- DB UUIDs remain internal to repository mapping code.
- Current practitioner scope is still selected by dashboard client state and sent through the `x-qicu-practitioner-id` request header.
- No `middleware.ts` auth enforcement exists.
- No login, logout, signup, session cookie, password credential, or app-session behavior exists yet.

## Current Scoping Inventory

### Request Scope Helper

- `src/lib/practitioners.ts`
  - Defines `CURRENT_PRACTITIONER_HEADER = 'x-qicu-practitioner-id'`.
  - Defines demo practitioners and `DEFAULT_PRACTITIONER_ID`.
  - Provides legacy synchronous fallback helpers for demo data and in-memory ownership checks.
  - Provides `withPractitionerHeaders`, used by client code to attach the transition header.
- `src/lib/practitionerRequest.ts`
  - Reads `x-qicu-practitioner-id`.
  - Calls `practitionersRepository.normalizePractitionerId`.
  - Falls back to the default practitioner when the header is missing or unknown.

This fallback is useful for prototype/demo mode but is not safe for real auth because a client can spoof the header and the missing-header path silently defaults to Tom.

### API Routes Reading Practitioner Scope

These runtime API routes call `getPractitionerIdFromRequest` and then pass the resulting public practitioner ID into repositories/helpers:

- `/api/bookings`
- `/api/bookings/[bookingId]`
- `/api/patients`
- `/api/patients/[patientId]`
- `/api/patients/[patientId]/archive`
- `/api/patients/[patientId]/bookings`
- `/api/patients/[patientId]/export`
- `/api/patients/[patientId]/reactivate`
- `/api/patients/[patientId]/sessions`
- `/api/services`
- `/api/services/[serviceId]`
- `/api/sessions`
- `/api/sessions/[sessionId]`
- `/api/trash`
- `/api/trash/[deletionGroupId]/restore`
- `/api/integrations/google/auth-url`
- `/api/integrations/google/calendar-selection`
- `/api/integrations/google/calendars`
- `/api/integrations/google/disconnect`
- `/api/integrations/google/events-preview`
- `/api/integrations/google/reconcile`
- `/api/integrations/google/status`

The Google callback route obtains practitioner scope through the OAuth state created by the auth-url route. That OAuth state is already DB-backed, short-lived, practitioner-scoped, and one-time-use from Phase G.

### Dashboard and Client Header Senders

The dashboard keeps practitioner selection in `src/components/layout/PractitionerContext.tsx` using `DEMO_PRACTITIONERS`, `DEFAULT_PRACTITIONER_ID`, and `localStorage` key `qicu:current-practitioner-id`.

Client code attaches the transition header through `withPractitionerHeaders`, including:

- `src/hooks/useBookings.ts`
- `src/hooks/usePatients.ts`
- `src/hooks/useServices.ts`
- `src/hooks/useSessions.ts`
- `src/app/(dashboard)/dashboard/bookings/page.tsx`
- `src/app/(dashboard)/dashboard/patients/page.tsx`
- `src/app/(dashboard)/dashboard/sessions/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/trash/page.tsx`
- `src/components/bookings/BookingImportDialog.tsx`
- `src/components/sessions/SessionDialog.tsx`

Some components use `usePractitioner` for local filtering or behavior, for example `BookingTimePicker`, `BookingDialog`, and page-level dashboard flows.

## Repository Readiness

The repository layer is well positioned for auth:

- Repositories already accept public practitioner IDs for scoped methods.
- Public practitioner IDs are still the external route/repository boundary.
- Repositories map public IDs to internal DB UUIDs where needed.
- DB UUIDs do not need to become part of route responses or client code.
- Replacing the source of `practitionerId` should mostly affect the request-scope helper and dashboard provider, not every repository.

Areas to keep an eye on:

- `practitionersRepository.normalizePractitionerId` currently defaults unknown/missing scope to the demo practitioner. Authenticated routes should eventually reject missing or unauthorized scope instead of defaulting.
- `src/lib/practitioners.ts` still contains demo practitioner constants used by fallback/test paths and the dashboard switcher.
- Tests intentionally using in-memory/demo route mode may need an explicit legacy scope helper while real auth route tests are added separately.
- Google token paths must stay scoped to the authenticated practitioner because encrypted token rows are sensitive even though token values are encrypted at rest.

## Schema/Auth Model Audit

The current schema already includes:

- `users`
  - `id`, `email`, `name`, `auth_provider`, `auth_provider_user_id`, `created_at`, `updated_at`.
  - Unique email and provider identity indexes.
- `practitioners`
  - `id`, nullable `user_id`, display/profile fields, timestamps.
  - `user_id` references `users(id)`.
  - `practitioners_user_id_idx`.

Missing for real application auth:

- Password credential storage if credentials auth is chosen.
- App session storage for opaque server-side sessions.
- Session expiry/revocation metadata.
- Optional email verification and password reset tables, if those flows are implemented later.
- A uniqueness constraint on `practitioners.user_id` if Phase H starts with one user to one practitioner.

Recommended minimal future schema:

- Keep `users` as login identity.
- Keep `practitioners` as professional profile/scope.
- Add `user_credentials` or `password_credentials` for password hashes if using email/password.
- Add `auth_sessions` for opaque server-side sessions.
- Start with one user mapped to one practitioner through `practitioners.user_id`.
- Leave room for future organizations or many-practitioner memberships later, but do not build that until the product needs it.

No schema migration should be added in H.0.

## Recommended Auth Strategy

Use server-side opaque sessions in secure, HttpOnly cookies, backed by PostgreSQL, with email/password credentials as the first auth method.

Why this fits QiCu:

- Server-side sessions are easier to revoke than stateless JWTs.
- Session rows can be rotated, expired, and inspected without exposing claims to the browser.
- It fits Next.js App Router route handlers.
- It keeps practitioner scope derivation server-side.
- It is simpler than adding social login and avoids overbuilding organizations before they are needed.
- It is more appropriate for sensitive health/practice data than trusting client-supplied practitioner headers or long-lived JWT claims.

Password hashing should use Argon2id or bcrypt with strong parameters. Do not implement custom cryptography for passwords. If using a library, keep the route/helper boundary thin and preserve repository scoping.

Auth.js or a small custom session layer are both possible. For this codebase, a small explicit session layer may be easier to reason about because the schema is already planned and repository scoping is explicit. If OAuth/social login becomes important, Auth.js can be reconsidered.

## Proposed Phase H Implementation Order

### H.0 Auth Readiness Audit

Goal: document the current scope boundary and plan the auth migration.

Files likely affected:

- `docs/phase-h-auth-readiness.md`
- `docs/database-implementation-strategy.md`

Must not change:

- Runtime auth behavior.
- Header scoping.
- API response shapes.
- Dashboard UI.

Tests:

- Existing test/build validation only.

Rollback/safety:

- Docs-only; no runtime rollback needed.

### H.1 Schema and Session Foundation

Goal: add the minimal auth schema and low-level session/credential helpers without enforcing auth yet.

Files likely affected:

- `src/db/schema/users.ts`
- New auth session/credential schema files.
- Drizzle migrations.
- Seed docs only, not real users/passwords.
- New `src/lib/auth/*` helpers.

Must not change:

- Existing route scoping behavior.
- Google OAuth behavior.
- Dashboard UI.

Tests:

- Password hashing verification.
- Session creation, lookup, expiry, revocation.
- Missing/expired session rejection at helper level.
- No DB UUID leakage from helper outputs.

Rollback/safety:

- Keep migrations additive.
- Do not seed real passwords.
- Do not enforce auth until H.3.

### H.2 Login, Logout, and Session Helpers

Goal: implement login/logout endpoints and server-side session helpers while keeping dashboard behavior compatible.

Files likely affected:

- New `/api/auth/login` and `/api/auth/logout` routes or server actions.
- `src/lib/auth/session.ts`
- `src/lib/auth/password.ts`
- Login page if needed.

Must not change:

- Existing business API response shapes.
- Practitioner-scoped domain routes until H.3.

Tests:

- Login succeeds with valid credentials.
- Login rejects invalid credentials without leaking which part failed.
- Logout invalidates session.
- Secure cookie attributes are set appropriately.
- Expired/revoked sessions are rejected.

Rollback/safety:

- Auth routes can exist without protecting existing app flows yet.

### H.3 Derive Practitioner Scope From Auth Session in Server Routes

Goal: introduce a trusted request-scope helper that resolves the authenticated user to a practitioner public ID.

Files likely affected:

- `src/lib/practitionerRequest.ts`
- New `src/lib/auth/requestScope.ts`
- API route tests.

Must not change:

- Repository method contracts.
- Public IDs.
- API response shapes except expected `401`/`403` behavior for unauthenticated/unauthorized access in auth-enabled mode.

Tests:

- Authenticated requests resolve the correct practitioner.
- Missing session is rejected where auth is enforced.
- User A cannot access User B practitioner-scoped patients/bookings/sessions/services/Google integration.
- Legacy header fallback works only where explicitly allowed during transition.

Rollback/safety:

- Gate auth enforcement with a clear transition flag if needed.
- Keep one helper as the central seam to avoid route-by-route drift.

### H.4 Dashboard Transition Away From Manual Practitioner Header

Goal: stop client code from selecting/sending arbitrary practitioner scope in normal authenticated flows.

Files likely affected:

- `src/components/layout/PractitionerContext.tsx`
- Dashboard hooks using `withPractitionerHeaders`.
- Dashboard layout/profile display.

Must not change:

- Dashboard workflows and response shapes.
- Public entity IDs.

Tests:

- Dashboard fetches work without manually supplying `x-qicu-practitioner-id`.
- Current practitioner display comes from session/practitioner profile.
- Google flows still use authenticated practitioner scope.

Rollback/safety:

- Keep demo mode separate if needed for local prototyping.

### H.5 Remove or Lock Down Header Fallback

Goal: eliminate spoofable practitioner scoping from authenticated production paths.

Files likely affected:

- `src/lib/practitionerRequest.ts`
- `src/lib/practitioners.ts`
- Tests that relied on default practitioner fallback.

Must not change:

- Test-only in-memory helper behavior unless tests are updated intentionally.

Tests:

- Header spoofing cannot access another practitioner's records.
- Missing header no longer silently defaults in authenticated production mode.
- Public IDs remain stable.

Rollback/safety:

- Keep an explicit dev/test-only fallback, not an implicit production fallback.

### H.6 Auth Completion Audit

Goal: confirm authenticated practitioner scoping is stable and no domain behavior regressed.

Files likely affected:

- Docs only unless small fixes are found.

Tests:

- Full route/domain suite.
- Cross-practitioner access denial.
- Google encrypted token paths scoped to session practitioner.
- API route Drizzle import scan.

Rollback/safety:

- Document remaining demo/test compatibility seams.

## Security Considerations

- Do not trust `x-qicu-practitioner-id` for production auth.
- Use HttpOnly, Secure, SameSite cookies for sessions.
- Use server-side opaque session IDs, not practitioner IDs in client-readable claims.
- Rotate session IDs on login and privilege changes.
- Store only hashed session tokens if practical.
- Expire sessions and support logout/revocation.
- Hash passwords with Argon2id or bcrypt.
- Use constant-time password verification where the library supports it.
- Avoid logging passwords, session tokens, authorization headers, Google tokens, encrypted Google payloads, or auth errors containing secrets.
- CSRF protection matters for cookie-authenticated mutating routes. SameSite cookies help, but state-changing form/API requests should also use origin checks or CSRF tokens where appropriate.
- Keep practitioner public IDs stable, but never treat them as proof of authorization.
- Do not expose DB UUIDs in API/UI responses.
- Protect Google integration and encrypted token paths behind authenticated practitioner scope.
- Avoid adding broad organization/membership abstractions until needed, but leave schema room for them.

## Future Testing Plan

- Unauthenticated protected requests are rejected.
- Authenticated requests are scoped to the session practitioner's public ID.
- One practitioner cannot read or mutate another practitioner's patients, services, bookings, sessions, lifecycle/Trash records, patient export, or Google integration.
- Public IDs remain stable in all responses.
- DB UUIDs are not exposed.
- Google integration status/calendar/list/preview/reconcile/sync remains scoped to the authenticated practitioner.
- Encrypted Google tokens remain hidden and usable only server-side.
- Existing route response shapes remain stable apart from intentional auth status codes.
- Legacy header fallback works only in explicitly allowed transition/test modes.
- Logout invalidates the session.
- Expired/revoked sessions are rejected.
- Password hashes are never returned or logged.
- CSRF/origin protections reject cross-site mutating requests where applicable.

## Manual Browser Checklist for Future Phase H

- Visit dashboard unauthenticated and confirm expected redirect/rejection.
- Log in with a test user.
- Confirm dashboard profile/practitioner display matches the session.
- Load patients, services, bookings, sessions, Trash, and Google integration pages.
- Confirm requests no longer need a manually selected practitioner header.
- Attempt a second practitioner URL/public ID access and confirm it is denied.
- Connect/disconnect Google under the authenticated practitioner.
- Log out and confirm protected pages/API calls no longer work.

## Out of Scope for H.0

- Runtime auth implementation.
- Login/signup UI.
- Session/JWT/cookie behavior.
- Middleware enforcement.
- Schema migrations.
- Removing `x-qicu-practitioner-id`.
- Changing Google OAuth or encrypted token persistence.
- Dashboard UI changes.
- Domain behavior changes for bookings, sessions, patients, services, lifecycle, Trash, or export.
- Broad DB-mode test isolation cleanup.

## Phase H.1 Implementation Note

Phase H.1 added the low-level auth/session foundation without changing runtime auth behavior.

Schema additions are additive:

- `password_credentials`
  - Stores one password credential per user.
  - Stores `password_hash`, `password_algorithm`, timestamps, and nullable `password_changed_at`.
  - References `users(id)` with cascade cleanup.
  - Does not store plaintext passwords.
- `auth_sessions`
  - Stores server-side opaque session metadata.
  - Stores only `session_token_hash`, never the plaintext session token.
  - Includes `expires_at`, nullable `revoked_at`, nullable `last_seen_at`, and optional non-secret request metadata.
  - References `users(id)` with cascade cleanup.
- `practitioners_user_id_unique`
  - Adds a partial unique index for one practitioner per user where `user_id` is not null.

Low-level helpers were added:

- `src/lib/auth/password.ts`
  - Uses `bcrypt` through `bcryptjs`.
  - Rejects empty or too-short passwords.
  - Verifies stored hashes by explicit algorithm.
- `src/lib/auth/sessionTokens.ts`
  - Generates high-entropy opaque session tokens.
  - Hashes tokens with SHA-256 before storage.
  - Centralizes the initial session expiry window.
- `src/lib/repositories/authRepository.ts`
  - Provides internal credential/session persistence helpers for future login/logout work.
  - No existing API route calls it yet.

Current app behavior is unchanged. H.1 did not add login/logout routes, cookies, middleware enforcement, dashboard auth UI, or changes to `getPractitionerIdFromRequest`. The transition `x-qicu-practitioner-id` header remains the current route scoping mechanism until a later Phase H step replaces it with auth-derived practitioner scope.

No real users, passwords, credentials, or session tokens are seeded. Future H.2 should implement login/logout/session cookie behavior using these helpers.

## Phase H.2 Implementation Note

Phase H.2 added the runtime login/logout/session-cookie foundation without protecting existing business routes yet.

Added auth route behavior:

- `POST /api/auth/login`
  - Accepts email/password JSON.
  - Normalizes email by trimming and lowercasing.
  - Verifies credentials through `authRepository` and the bcrypt password helper.
  - Creates an opaque session token and stores only its SHA-256 hash in `auth_sessions`.
  - Sets a `qicu_session` cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
  - Returns only safe user fields: email and name.
- `POST /api/auth/logout`
  - Reads the session cookie if present.
  - Revokes the matching hashed session.
  - Clears the cookie.
  - Returns `{ ok: true }` even when no session exists.
- `GET /api/auth/me`
  - Reads and validates the session cookie.
  - Returns `{ authenticated: false }` for anonymous requests.
  - Returns safe user state, and a public practitioner shape only when one can be resolved safely.

Session cookies contain only the opaque plaintext session token. They do not contain user IDs, practitioner IDs, database UUIDs, email, or claims. Password hashes, session token hashes, plaintext session tokens, and database UUIDs are not returned publicly.

Login/logout POST routes include a small same-origin guard that rejects requests with an `Origin` header that does not match the request origin. This is not a full CSRF token system; later auth enforcement phases should revisit CSRF/origin protection for all cookie-authenticated mutating routes.

Current domain behavior remains unchanged. H.2 did not enforce auth on patients, bookings, sessions, services, lifecycle/Trash, Google, or export routes. `getPractitionerIdFromRequest`, `x-qicu-practitioner-id`, dashboard practitioner context, Google OAuth/encrypted token behavior, and existing API response shapes remain unchanged. No real credentials are seeded.

Next phase H.3 should derive practitioner scope from authenticated sessions in server routes while preserving response shapes and adding clear unauthenticated/unauthorized behavior.

## Phase H.3 Implementation Note

Phase H.3 added the central trusted request-scope seam for deriving practitioner scope from authenticated sessions while preserving the legacy header path in default mode.

Added behavior:

- `src/lib/auth/requestScope.ts`
  - Resolves a valid `qicu_session` cookie through the H.2 session helper.
  - Maps the session user to the linked practitioner.
  - Returns public practitioner IDs only.
  - Never trusts practitioner IDs from cookies.
  - Makes session scope win over a conflicting `x-qicu-practitioner-id` header.
  - Supports `QICU_AUTH_ENFORCEMENT=strict` for strict mode.
- `src/lib/practitionerRequest.ts`
  - Keeps `getPractitionerIdFromRequest` as the central route seam.
  - Calls the new request-scope helper internally.
  - Preserves legacy/default header behavior when strict mode is not enabled.
  - Exports an auth-scope error response helper for routes that need clean strict-mode JSON responses.

Strict mode behavior:

- `QICU_AUTH_ENFORCEMENT=strict` requires a valid authenticated session-derived practitioner scope.
- Missing, expired, revoked, or invalid sessions return clear auth failures in routes that have been wired for strict-mode error handling.
- A user with no linked practitioner receives a clear forbidden scope error.
- The legacy `x-qicu-practitioner-id` header is not trusted in strict mode.

Transition behavior:

- Default/dev/test mode remains legacy-compatible. The dashboard can still send `x-qicu-practitioner-id`, and missing headers can still fall back to the demo default practitioner.
- The dashboard/client transition has not happened yet.
- `withPractitionerHeaders`, `PractitionerContext`, and manual practitioner selection remain in place for H.4.
- Header fallback remains transitional and is not production-safe.

Representative strict-mode route handling was added for `/api/bookings` and `/api/integrations/google/auth-url`. The booking route demonstrates strict protected business-route behavior, and the Google auth-url route ensures OAuth state is created for the authenticated practitioner in strict mode. The Google callback route still consumes the DB-backed OAuth state and remains compatible.

Later H.4/H.5 work should apply the strict-mode response wrapper consistently as the dashboard moves away from manual practitioner headers and the legacy fallback is removed or locked down.
