# Phase G Google Persistence Readiness

## Summary

Phase G should move Google Calendar integration state from the current in-memory helper into Drizzle/PostgreSQL without changing OAuth flow behavior, Google Calendar sync behavior, import/reconcile response shapes, booking API fallback behavior, or public ID boundaries.

This audit does not migrate Google integration persistence. It documents the current state, schema readiness, token storage design, OAuth state strategy, risks, and recommended implementation order.

## Current Google Runtime State

`googleIntegrationsRepository` currently wraps `src/lib/google/store.ts`, which stores two in-memory maps:

- Google integration records keyed by public practitioner ID.
- Pending OAuth states keyed by random state token.

The public status shape is:

- `connected`
- `googleUserEmail`
- `selectedCalendarId`
- `selectedCalendarName`
- `canConnect`
- `lastError`

Status responses intentionally do not expose access tokens or refresh tokens. Tests already assert that token fields are absent from public route payloads.

Selected calendar state is practitioner-scoped but currently lost on app restart. Disconnect deletes the in-memory integration record. OAuth state is one-time by deletion-on-consume, but it is not currently persisted and has no enforced expiry in the memory store.

Google Calendar sync helpers read integration state through the repository seam. Booking create/update/delete sync failures are caught, recorded on the booking as `externalSyncStatus = "error"` where current behavior does so, and do not break the local booking workflow.

## Current DB-Backed Application State

Practitioners, services, patients, bookings, sessions, lifecycle/Trash, purge, restore, and patient export are DB-backed where intended. Bookings already persist Google sync fields:

- `external_source`
- `external_calendar_id`
- `external_event_id`
- `external_sync_status`
- `external_last_synced_at`

Those booking fields are already used for duplicate import detection, reconcile, and avoiding duplicate outbound event creation for imported Google bookings.

## Schema Readiness

The current schema already includes `google_integrations` and `oauth_states`.

`google_integrations` supports:

- One row per practitioner through `google_integrations_practitioner_id_unique`.
- Connected/disconnected state.
- Connected Google account email.
- Selected calendar ID and name.
- Encrypted access token and refresh token columns.
- Token expiry.
- Last error.
- Connected, created, and updated timestamps.

`oauth_states` supports:

- State token lookup by primary key.
- Practitioner scoping.
- Created and expiry timestamps.
- Consumed timestamp.
- Expiry index.

The current booking schema also supports persisted Google external sync metadata.

No mandatory schema migration is required before a minimal Phase G.1 if the existing OAuth flow remains non-PKCE. If Phase G adopts PKCE, add a short-lived `code_verifier` storage strategy for OAuth states before migration. Prefer storing an encrypted code verifier or using an encrypted short-lived cache; do not store a plaintext verifier long term.

Useful optional schema hardening for Phase G:

- Add token scope/token type metadata only if the UI or refresh logic needs it.
- Add `last_sync_error_at` or sync health timestamps only if product behavior needs visible sync health.
- Consider retaining consumed OAuth states briefly for replay audit, while ensuring consumed states cannot be reused.

## Token Storage And Security Design

Do not store raw Google tokens in PostgreSQL.

Phase G.1 added `src/lib/google/googleTokenEncryption.ts` as a preflight utility only. It is not wired into OAuth routes, Google repositories, sync helpers, or database persistence yet.

Phase G.4 wires that utility into Google integration persistence. Access and refresh tokens are now stored in `google_integrations` only as encrypted AES-256-GCM payloads when PostgreSQL is available. Plaintext tokens remain limited to internal server-side runtime objects needed for Google API calls and are never returned by public status/API responses.

Recommended Phase G token strategy:

- Use environment-based authenticated encryption, for example AES-256-GCM through Node `crypto`.
- Require a dedicated secret such as `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- Store access and refresh tokens separately in `access_token_encrypted` and `refresh_token_encrypted`.
- Keep token expiry as a normal timestamp because it is operational metadata, not a secret.
- Never log plaintext tokens, encrypted token payloads, refresh responses, or authorization headers.
- Never seed real tokens. Development seeds should continue to omit Google integration rows or use fake test-only values only in isolated tests.
- Public status responses must continue to omit all token fields.

`GOOGLE_TOKEN_ENCRYPTION_KEY` should be a strong 32-byte secret encoded as base64 or base64url. One suitable local generation command is:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The key is not required during normal app boot. It is mandatory for code paths that encrypt or decrypt persisted Google tokens. Once token persistence is enabled, losing or rotating this key without a migration plan will make existing encrypted tokens undecryptable.

Missing key behavior:

- In production, missing encryption key should fail closed for connect, refresh, calendar list, sync, preview, and reconcile operations that require tokens.
- In tests/non-production, repository fallback may continue using fake in-memory tokens where existing tests need it, but DB-backed token persistence should still require an encryption key when enabled.

Refresh behavior:

- Decrypt refresh token only when the access token is missing or near expiry.
- Persist the new encrypted access token and expiry after refresh.
- Preserve refresh token if Google does not return a new refresh token.
- If refresh fails, keep local booking operations safe, record a non-sensitive `lastError`, and require reconnect when appropriate.

Phase G.4 refresh behavior preserves the existing local-workflow fallback: booking create/update/delete sync catches Google/token errors and records sync error state without breaking the local booking mutation. Successful refresh saves the new encrypted access token and expiry, and preserves the existing encrypted refresh token when Google does not return a replacement.

Disconnect behavior:

- Set `connected = false`.
- Clear encrypted access and refresh token fields.
- Clear token expiry.
- Preserve or clear selected calendar consistently with current product behavior. The safest current-compatible path is to clear selected calendar only if disconnect currently makes it inaccessible through status/selection behavior; otherwise keep it only as non-sensitive preference metadata.
- Do not return token values.

## OAuth State Persistence Design

OAuth state is currently in memory and is consumed once. App restart breaks callback completion because pending state disappears.

Phase G.2 moved OAuth state creation and consumption behind DB-backed repository internals when PostgreSQL is available. OAuth routes still call the same helper/repository seam and keep the same response behavior, but `createOAuthState` now persists a short-lived row in `oauth_states` and `consumeOAuthState` atomically marks an unexpired, unconsumed row as consumed.

Recommended Phase G behavior:

- Persist OAuth states in `oauth_states`.
- Bind each state to the practitioner DB row mapped from the public practitioner ID.
- Use short expiry, for example 10 minutes.
- Reject missing, expired, or already consumed states.
- Consume state atomically by setting `consumed_at` or deleting the row.
- Prefer marking consumed before token exchange or within a guarded transaction so replay cannot reuse the same state.
- Clean expired/consumed states opportunistically during auth-url creation or consume; do not add a scheduler in Phase G unless explicitly requested later.

If PKCE is added later, bind the code verifier to the state record and protect it with the same encryption rules as tokens.

Phase G.2 did not add PKCE, a scheduler, a cleanup route, or a UI. It also did not move Google integration records, selected calendar state, connected status, or token persistence to PostgreSQL. Non-production/test fallback still uses the in-memory OAuth state helper when the database is unavailable, with the same expiry and one-time-use semantics.

## Integration Status And Selected Calendar Design

DB-backed status should read from `google_integrations` through `googleIntegrationsRepository` and return the same public route payload as today.

Phase G.3 moved non-secret Google integration metadata behind DB-backed repository internals where safe. `saveIntegration` persists connected account email, selected calendar metadata, connected flag metadata, last error, and timestamps to `google_integrations` when PostgreSQL is available, while keeping token-bearing access/refresh values only in the existing in-memory runtime store.

Selected calendar behavior should:

- Persist `selected_calendar_id` and `selected_calendar_name`.
- Remain practitioner-scoped.
- Survive app restart.
- Continue to require a connected integration before saving calendar selection.
- Keep calendar list behavior dependent on valid Google credentials.

Disconnect now clears the in-memory token-bearing integration and marks the DB metadata row disconnected when PostgreSQL is available. It also clears selected calendar metadata, token encrypted columns, token expiry, last error, and connected timestamp defensively. The route response remains `{ ok: true }`.

Public status preserves usable-token semantics. It may report `connected: true` after restart only when the DB row is connected, encrypted token payloads are present as needed, `GOOGLE_TOKEN_ENCRYPTION_KEY` is valid, and the required tokens can be decrypted. Metadata-only or undecryptable rows do not produce a misleading connected state.

## Booking Sync Behavior Audit

Current booking sync behavior to preserve:

- Local booking create succeeds even if Google create fails.
- Local booking update succeeds even if Google update fails.
- Local booking delete succeeds even if Google delete fails.
- Successful Google create persists calendar/event IDs and synced status on booking rows.
- Failed sync records error status where current behavior does.
- Imported Google bookings are not written back to Google.
- Existing external event IDs prevent duplicate event creation.
- Cancelled booking behavior, no-show summaries, and completed status descriptions remain stable.
- Sensitive tokens are not exposed in UI responses.

Phase G should only change how integration/token state is loaded. Booking repository behavior and external booking fields should remain unchanged.

## Import Preview And Reconcile Audit

Events preview and reconcile already use repository seams for practitioners, patients, services, bookings, and Google integration state.

Behavior to preserve:

- Preview requires connected integration and selected calendar.
- Preview classifies matched appointments, blocked time, invalid events, existing imports, possible duplicates, and review rows.
- Reconcile uses persisted booking external fields to find Google-linked bookings.
- Duplicate detection remains based on `externalSource`, `externalEventId`, `externalCalendarId`, time, patient, and service matching as current mapping code defines.
- Response shapes for preview and reconcile stay unchanged.

## Risks

- Token encryption key loss would make stored tokens unusable.
- Storing tokens before encryption is a security regression.
- OAuth state replay or long-lived state rows could weaken callback safety.
- Persisting selected calendar incorrectly could leak calendar choices across practitioners.
- Calendar API/token refresh errors must not break local booking mutations.
- Current error logging includes Google API error objects/text; Phase G should keep those non-sensitive and avoid token-bearing payloads.
- Moving token state to DB may require tests to avoid live Google network and real credentials.

## Recommended Phase G Implementation Order

1. Phase G.1: Add a token encryption utility and guarded configuration checks. Confirm no schema changes are required unless PKCE code verifier storage is added. Complete: encryption utility and tests exist, no runtime token persistence was added.
2. Phase G.2: Move OAuth state create/consume to DB-backed repository methods with expiry and one-time consumption. Complete: OAuth state rows now use `oauth_states` when PostgreSQL is available; route behavior is unchanged.
3. Phase G.3: Move public integration status, selected calendar, connected account metadata, and disconnect to DB-backed repository methods without persisting plaintext tokens. Complete: non-secret metadata is persisted where safe, while usable-token connection state remains runtime-only until encrypted token persistence lands.
4. Phase G.4: Implement encrypted token persistence and token refresh update behavior. Complete: access/refresh tokens are persisted only as encrypted payloads, status can use decryptable DB tokens after restart, and refresh updates encrypted access token/expiry while preserving refresh tokens when Google omits a replacement. DB-backed targeted Google/G.4 tests passed against local PostgreSQL with 36/36 tests and 0 skipped; `db:migrate`, `db:check`, and `db:seed` also passed.
5. Phase G.5: Verify booking create/update/delete sync, calendar list, events preview, and reconcile against DB-backed integration state.
6. Phase G completion audit.

This order keeps the short-lived OAuth security boundary separate from durable token persistence and lets selected calendar/status persistence land before token encryption is exercised in normal sync flows.

## Testing Plan

- Public status response shape remains unchanged and never includes tokens.
- Selected calendar survives repository reload/restart.
- Disconnect clears connected state and token fields.
- OAuth state persists with expiry.
- OAuth state can be consumed only once.
- OAuth state respects practitioner scope.
- Missing, expired, and consumed OAuth states are rejected.
- No real tokens are logged or seeded.
- Token encryption/decryption works in isolated tests when implemented.
- Missing encryption key fails safely.
- Token refresh persists a new encrypted access token and expiry.
- Booking create still succeeds when Google create fails.
- Booking update still succeeds when Google update fails.
- Booking delete still succeeds when Google delete fails.
- External event ID, calendar ID, sync status, and last synced timestamp persist on bookings.
- Imported Google bookings do not trigger duplicate outbound events.
- Events-preview response shape remains stable.
- Reconcile response shape remains stable.
- API routes do not import Drizzle directly.

## Manual Browser Checklist

- Open Google integration status page/panel disconnected.
- Start Google connect flow with local fake/test credentials where available.
- Complete OAuth callback in a test environment.
- Select a calendar and refresh/restart to confirm persistence after Phase G implementation.
- Create a booking and verify local create succeeds if Google sync fails.
- Update/cancel/delete a Google-linked booking and verify local workflow survives sync errors.
- Run events preview and confirm classifications are unchanged.
- Run reconcile and confirm linked booking counts/statuses are unchanged.
- Disconnect Google and confirm status no longer exposes connected state or selected token-backed actions.

## Out Of Scope

- Persisting raw tokens.
- Seeding real Google tokens.
- Auth implementation.
- Email implementation.
- Scheduler/cron sync jobs.
- Dashboard or marketing UI changes.
- Booking/session/lifecycle persistence changes.
- API response shape changes.
