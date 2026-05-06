# QiCu Persistence Inventory

## Summary

QiCu currently uses in-memory TypeScript arrays and maps for application data. Most dashboard APIs mutate module-level stores directly, while client hooks keep page-local React copies refreshed from those APIs. This is workable for the prototype, but all data resets on server restart and none of the relationship/lifecycle operations are transaction-safe yet.

There is an early PostgreSQL utility in `src/lib/db.ts`, but it is only used by `/api/health`. The main patient, booking, session, service, trash, and Google integration flows do not use the database yet.

The database design phase should model the current entities first, then move API routes behind repository functions rather than letting route handlers continue mutating arrays directly.

## In-memory stores

| Store/file | Entity | Mutable? | Read by | Written by | Future persistence recommendation |
| --- | --- | --- | --- | --- | --- |
| `src/data/patientsStore.ts` | FHIR-like patients from `PATIENTS` seed data | Yes | Patient APIs, patient detail/list hooks, lifecycle helpers, Google sync naming, exports | `/api/patients`, `/api/patients/[patientId]`, patient archive/reactivate/delete lifecycle helpers, restore/purge helpers | Database table: `patients`; seed `src/data/patients.ts` as development/demo data |
| `src/data/bookings.ts` | Booking records | Yes | Booking APIs, dashboard bookings/calendar/home/tasks, patient detail, lifecycle helpers, Google import/sync/reconcile | `/api/bookings`, `/api/bookings/[bookingId]`, patient booking route, lifecycle helpers, Google reconcile, session creation/linking, patient archive cancellation | Database table: `bookings`; seed current sample bookings as development/demo data |
| `src/data/sessionsStore.ts` | Session/session-note records | Yes | Session APIs, sessions dashboard, patient/session detail, lifecycle helpers, exports | Patient session route, `/api/sessions/[sessionId]`, lifecycle helpers, restore/purge helpers | Database table: `sessions`; seed sample sessions as development/demo data |
| `src/data/servicesStore.ts` | Service definitions from `INITIAL_SERVICES` | Yes | Service APIs, booking/session dialogs, import matching, lifecycle impact, Google import preview | `/api/services`, `/api/services/[serviceId]`, service trash/restore/purge helpers | Database table: `services`; seed current services as development/demo data |
| `src/lib/google/store.ts` | Google integration records keyed by practitioner, pending OAuth states keyed by random state | Yes | Google auth/status/calendars/events-preview/reconcile/sync helpers | Google callback, calendar selection, token refresh, disconnect, OAuth state creation/consume | Database tables: `google_integrations` and short-lived `oauth_states`; tokens must be encrypted/secured |
| `trashMetadata` on patient/booking/session/service records | Trash/deletion metadata embedded in each record | Yes | Lifecycle helpers, trash API/view helpers, normal route filters | `move*ToTrash`, `restoreDeletionGroup`, `purgeExpiredTrash` | Database columns on each table or normalized `trash_records`/`deletion_groups`; grouped restore needs transaction support |
| `src/lib/practitioners.ts` `DEMO_PRACTITIONERS` | Demo practitioner identities | No runtime mutation | Practitioner context, request scoping fallback, UI practitioner switcher/layout | Not written | Seed/dev data now; later replace with authenticated `users`/`practitioners` tables |
| React hook/component state | UI state copies, filters, dialogs, selected import rows, selected calendar UI | Yes, client-only | Dashboard pages/components | User interactions | Mostly UI-only; selected Google calendar and integration state should persist server-side |

## API route inventory

| Route | Methods | Reads | Writes | Current store/helper | Practitioner scoping | Future DB tables |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/health` | `GET` | PostgreSQL health query | None | `db.query('SELECT 1 as ok')` | None | N/A, DB connection only |
| `/api/patients` | `GET`, `POST` | `patientsStore` | `patientsStore.unshift` | `FhirPatientSchema`, `setPatientPractitionerId`, `isTrashed` | `x-qicu-practitioner-id` via `getPractitionerIdFromRequest`; patient practitioner extension | `patients`, `practitioners/users` |
| `/api/patients/[patientId]` | `PATCH`, `DELETE` | `patientsStore` | Patient update; patient graph moved to Trash | `FhirPatientSchema`, `movePatientGraphToTrash` | Header plus patient practitioner extension | `patients`, `bookings`, `sessions`, deletion group/trash metadata |
| `/api/patients/[patientId]/archive` | `POST` | Patient, linked bookings/sessions | Patient `active=false`; optionally future booking statuses cancelled | `archivePatient` | Header plus lifecycle helper scope | `patients`, `bookings` |
| `/api/patients/[patientId]/reactivate` | `POST` | Patient | Patient `active=true` | `reactivatePatient` | Header plus lifecycle helper scope | `patients` |
| `/api/patients/[patientId]/export` | `GET` | Patient, linked bookings, linked sessions | None | `buildPatientFullExport` | Header plus lifecycle helper scope | `patients`, `bookings`, `sessions`, service snapshots |
| `/api/patients/[patientId]/bookings` | `POST` | Patient, service, bookings | Adds booking | `hasBookingOverlap`, `findServiceByIdForPractitioner`, `canUsePatientInActiveWorkflow` | Header plus patient/service/practitioner checks | `patients`, `services`, `bookings` |
| `/api/patients/[patientId]/sessions` | `GET`, `POST` | Sessions, patient, bookings, services | Adds session; links booking; may set booking in-progress | `applyBookingStatus`, `findServiceByIdForPractitioner`, `canUsePatientInActiveWorkflow` | Header plus patient/session/booking/service checks | `patients`, `sessions`, `bookings`, `services` |
| `/api/bookings` | `GET`, `POST` | Bookings, patients, services | Adds booking; may update Google sync fields after create | `hasBookingOverlap`, `syncGoogleOnBookingCreate`, `canUsePatientInActiveWorkflow` | Header plus practitioner fields | `bookings`, `patients`, `services`, Google integration |
| `/api/bookings/[bookingId]` | `PATCH`, `DELETE` | Booking, services, bookings, sessions via lifecycle | Updates booking/status/sync fields; moves booking to Trash | `applyBookingStatus`, `hasBookingOverlap`, `syncGoogleOnBookingUpdate/Delete`, `moveBookingToTrash` | Header plus booking practitionerId | `bookings`, `sessions`, Google integration, trash metadata |
| `/api/sessions` | `GET` | `sessionsStore` | None | `isTrashed` | Header plus session practitionerId | `sessions` |
| `/api/sessions/[sessionId]` | `GET`, `PATCH`, `DELETE` | Session, bookings, services | Updates session; links/unlinks booking; moves session to Trash | `findServiceByIdForPractitioner`, `moveSessionToTrash` | Header plus session/booking/service practitionerId | `sessions`, `bookings`, `services`, trash metadata |
| `/api/services` | `GET`, `POST` | `servicesStore` | Adds service | duplicate detection by practitioner/name/duration | Header plus service practitionerId | `services` |
| `/api/services/[serviceId]` | `GET`, `PATCH`, `DELETE` | Service, lifecycle impact on bookings/sessions | Updates service; moves service to Trash | `getServiceLifecycleImpact`, `moveServiceToTrash` | Header plus service practitionerId | `services`, `bookings`, `sessions`, trash metadata |
| `/api/trash` | `GET` | Trashed patients/bookings/sessions/services | None | `listTrash` | Header plus entity practitionerId | all trash-enabled entity tables |
| `/api/trash/[deletionGroupId]/restore` | `POST` | Trashed records by deletion group | Removes `trashMetadata` for scoped records | `restoreDeletionGroup` | Header plus entity practitionerId | all trash-enabled tables; transaction required |
| `/api/integrations/google/auth-url` | `GET` | Env config; pending state store | Adds pending OAuth state | `buildGoogleAuthUrl`, `createGoogleOAuthState` | Header creates state for practitioner | `oauth_states`, `google_integrations` |
| `/api/integrations/google/callback` | `GET` | Pending OAuth state, Google token/userinfo APIs | Saves Google integration tokens | `consumeGoogleOAuthState`, `saveGoogleIntegration` | OAuth state contains practitionerId | `google_integrations`, `oauth_states` |
| `/api/integrations/google/status` | `GET` | Google integration store, env config | None | `getGoogleIntegration`, `hasGoogleCalendarEnv` | Header | `google_integrations` |
| `/api/integrations/google/calendars` | `GET` | Google integration, Google Calendar API | May save selected first calendar | `listGoogleCalendars`, `saveGoogleIntegration` | Header | `google_integrations` |
| `/api/integrations/google/calendar-selection` | `POST` | Google integration | Saves selected calendar id/name | `getGoogleIntegration`, `saveGoogleIntegration` | Header | `google_integrations` |
| `/api/integrations/google/disconnect` | `POST` | Google integration | Deletes integration record | `disconnectGoogleIntegration` | Header | `google_integrations` |
| `/api/integrations/google/events-preview` | `GET` | Google integration, Google events, patients, services, bookings | None | `listGoogleCalendarEvents`, `buildGoogleBookingImportPreview` | Header plus practitioner filters | `google_integrations`, `patients`, `services`, `bookings` |
| `/api/integrations/google/reconcile` | `POST` | Google integration, Google event API, imported bookings | Mutates Google-imported bookings status/time/resource/sync fields | `getGoogleCalendarEvent`, `getGoogleIntegration` | Header plus booking practitionerId | `bookings`, `google_integrations` |

## Existing database setup

`src/lib/db.ts` imports `Pool` from `pg`, reads `process.env.DATABASE_URL!`, creates a module/global cached pool, and exports `db`.

Current usage:

- Used by `src/app/api/health/route.ts` only.
- Not used by patient, booking, session, service, lifecycle, trash, or Google integration persistence.

Environment variables:

- `DATABASE_URL` is required by non-null assertion.
- Google code separately expects `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `GOOGLE_REDIRECT_URI`.

Readiness:

- Partial. It confirms a PostgreSQL direction and a pooled connection utility.
- It has no query helpers, schema ownership, migrations, transaction helpers, SSL config, or repository abstraction yet.
- Before use, decide migration tool, schema naming, transaction API, error handling, and whether `pg` stays as the direct client.

## Model fields to persist

### Patient

Files:

- `src/models/patient.ts`
- `src/models/fhir/patient.ts`
- `src/schemas/fhir/patient.ts`
- `src/models/patient.coreView.ts`

Important fields:

- `id`
- `resourceType`
- `meta.versionId`
- `meta.lastUpdated`
- `meta.profile`
- `active`
- `name`
- `birthDate`
- `gender`
- `telecom`
- `communication`
- `extension`
- Practitioner scope currently stored in FHIR extension URL `https://qicu.app/fhir/StructureDefinition/practitioner-id`
- `trashMetadata`

Relationship/status/lifecycle:

- `active=false` currently means archived/inactive.
- Patient delete moves patient plus linked bookings/sessions to Trash using shared `deletionGroupId`.
- Patient export depends on patient id plus practitioner scope.

Persist exactly:

- Patient id, practitioner ownership, active flag, name/contact/birthDate/gender, FHIR-ish JSON fields or normalized equivalents, and `trashMetadata`.

### Booking

File: `src/models/booking.ts`

Important fields:

- `id`
- `code`
- `practitionerId`
- `patientId`
- `serviceId`
- `serviceName`
- `serviceDurationMinutes`
- `resource`
- `start`
- `end`
- `status`
- `notes`
- `sessionId`
- `trashMetadata`

Status fields:

- `status`: `confirmed`, `pending`, `in-progress`, `cancelled`, `completed`, `no-show`
- `statusUpdatedAt`

External sync fields:

- `externalSource`
- `externalCalendarId`
- `externalEventId`
- `externalSyncStatus`
- `externalLastSyncedAt`

Persist exactly:

- Service snapshots (`serviceName`, `serviceDurationMinutes`) are required so historical bookings remain readable after service disable/delete.
- Google ids/status must persist to prevent duplicate sync/import behavior.
- Time fields and status drive availability, tasks, calendar, and Google sync.

### Session

File: `src/models/session.ts`

Important fields:

- `id`
- `practitionerId`
- `patientId`
- `startDateTime`
- `serviceId`
- `serviceName`
- `chiefComplaint`
- `treatmentSummary`
- `outcome`
- `treatmentNotes`
- `painScore`
- `tcmDiagnosis`
- `tcmFindings`
- `pointsUsed`
- `techniques`
- `basicVitals`
- `bookingId`
- `trashMetadata`

Relationships:

- Belongs to patient via `patientId`.
- Optional booking relationship via `bookingId`.
- Optional service relationship plus service name snapshot via `serviceId`/`serviceName`.

Persist exactly:

- `patientId`, `bookingId`, `serviceId`, `serviceName`, note fields, and trash metadata.

### Service

File: `src/models/service.ts`

Important fields:

- `id`
- `practitionerId`
- `name`
- `durationMinutes`
- `description`
- `active`
- `trashMetadata`

Lifecycle:

- `active=false` means disabled for new bookings but retained for historical context.
- Delete moves service to Trash, not immediate hard-delete.

Persist exactly:

- Service id, practitioner id, name, duration, active flag, and trash metadata.
- Historical bookings/sessions rely on snapshots, but service definition should remain restorable.

### Trash/deletion metadata

File: `src/models/lifecycle.ts`

Important fields:

- `deletedAt`
- `restoreUntil`
- `deletedByPractitionerId`
- `deletionGroupId`
- `deletionType`: `patient-data`, `booking`, `session`, `service`
- `deletionReason`

Persist exactly:

- `deletionGroupId` is central to restoring patient data groups.
- `restoreUntil` drives restore eligibility and purge behavior.
- `deletedByPractitionerId` is part of scoped recovery and auditability.

### Google integration

Files:

- `src/lib/google/types.ts`
- `src/lib/google/store.ts`
- `src/lib/google/sync.ts`

Important fields:

- `practitionerId`
- `connected`
- `googleUserEmail`
- `accessToken`
- `refreshToken`
- `tokenExpiry`
- `selectedCalendarId`
- `selectedCalendarName`
- `lastError`
- `connectedAt`

Persist exactly:

- Selected calendar, refresh token, token expiry, connected state, and Google user email.
- Access/refresh tokens need secure encrypted storage, not plain in-memory maps.

### Practitioner/user

File: `src/lib/practitioners.ts`

Important fields:

- `id`
- `name`
- `email`
- `initials`
- `avatarUrl`
- `icon`

Current behavior:

- `DEMO_PRACTITIONERS` is static.
- `DEFAULT_PRACTITIONER_ID` is `prac-tom-cook`.
- Request scoping comes from `x-qicu-practitioner-id`, falling back to default if absent/invalid.

Persist later:

- Auth users, practitioners/profiles, membership/ownership, and preferences.
- Header-based demo scoping must be replaced by auth/session-derived identity.

## UI-only state and persistence candidates

| State | Current location | Classification | Notes |
| --- | --- | --- | --- |
| Search/filter/view tabs in dashboard pages | React component state | UI-only | Should not be database state; could become URL params later |
| Dialog open/closed, editing record, confirm modal state | React component state | UI-only | Runtime-only |
| Form draft values | React component state | UI-only | Could later autosave drafts, but not needed now |
| Booking import preview rows/selected rows | `BookingImportDialog`, Google preview route response | Mostly UI-only | Final imported bookings persist; preview decisions can remain transient |
| Google selected calendar | Google integration store and UI calls | Should persist in DB | Already server-side but in memory |
| Google OAuth pending state | `pendingGoogleStates` map | Short-lived server state | Should become expiring persisted/cache-backed state |
| Practitioner selection/demo context | `PractitionerContext`, headers | Later user/practitioner setting | Replace with auth/session; demo switcher can remain dev-only |
| Tasks | `useTasks(bookings)` derived state | UI-only derived data | Do not persist unless future task records become user-managed |
| Right side panel content | `RightPanelContext` | UI-only | Runtime layout state |

## Demo/sample data

| File | Data | Recommendation |
| --- | --- | --- |
| `src/data/patients.ts` | Demo FHIR-like patients for Tom/Keita | Development seed data; do not ship as production data |
| `src/data/bookings.ts` | Demo bookings with relative date helpers | Development seed data; avoid relative dynamic seed dates in production migrations |
| `src/data/services.ts` | Demo services, including disabled service | Development seed data |
| `src/data/sessionsStore.ts` | Demo sessions | Development seed data |
| `src/lib/practitioners.ts` | Demo practitioners | Development seed data or replaced by auth/user seed |
| Test files under `src/**/*.test.ts` | Test fixtures | Keep as tests/fixtures only |
| Marketing components | Marketing/demo presentation content | Not part of app persistence |

## Practitioner scoping

Current approach:

- Header name: `x-qicu-practitioner-id`
- Defined in `src/lib/practitioners.ts` as `CURRENT_PRACTITIONER_HEADER`.
- Client hooks attach it using `withPractitionerHeaders`.
- API routes read it with `getPractitionerIdFromRequest`.
- Invalid/missing header falls back to `DEFAULT_PRACTITIONER_ID`.
- Patient ownership is stored in a FHIR extension, not a direct `practitionerId` field.
- Bookings, sessions, and services have direct `practitionerId` fields.

Where enforced well:

- Main patient, booking, session, service, trash, and Google routes generally scope by practitioner.
- Lifecycle helpers accept `practitionerId`.
- Booking overlap checks use practitioner-filtered records.
- Google integration store is keyed by practitioner id.

Known migration implications:

- Header scoping is demo-only and must not be trusted in production.
- The fallback default practitioner is useful for prototypes but dangerous in real auth.
- Patient ownership should become a direct indexed database relationship even if FHIR extension data remains.
- Every query should include auth/session-derived practitioner scope or membership checks.

## Database migration risks

- Relationship logic currently mutates shared arrays directly from route handlers and helpers.
- Patient graph delete/restore needs database transactions so patient/bookings/sessions cannot partially move or restore.
- Booking/session unlinking must be transactional to avoid orphaned references.
- Trash restore currently removes metadata in memory; database restore needs scoped `UPDATE` operations and expiration checks.
- `purgeExpiredTrash` is a helper only; production needs a safe scheduled job or explicit admin process.
- Google tokens are in memory and lost on restart; production needs encrypted durable storage.
- Google sync mutates booking records directly after external API calls; database implementation should define retry/error behavior.
- Booking overlap checks currently scan arrays; database implementation needs indexed time-range queries scoped to practitioner and blocking statuses only.
- Demo practitioner headers must be replaced by authentication/session identity.
- Patient ownership via FHIR extension is awkward for relational queries; a direct `practitioner_id` column is recommended.
- Service and booking snapshots must be preserved so historical records remain readable after service changes/deletion.
- Current seed bookings use relative dates; database seeds should be deterministic or clearly marked demo-only.
- API response shapes vary (`record`, `{ ok, action }`, raw arrays); standardization can come after schema design.

## Recommended next step

Design the database schema next, not implementation yet.

Recommended schema-design task:

- Define tables for practitioners/users, patients, services, bookings, sessions, Google integrations, OAuth states, and deletion groups/trash metadata.
- Decide whether patient FHIR data is stored as structured columns plus JSON, or mostly JSON plus indexed ownership/search columns.
- Define relationships, indexes, status enums, lifecycle columns, and transaction boundaries for archive/delete/restore.
- Map each current API route to repository operations before replacing in-memory stores.

