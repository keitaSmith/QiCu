# Phase F Lifecycle and Trash Readiness

## Summary

Phase F will move QiCu lifecycle and Trash behavior from the current in-memory transition layer to Drizzle/PostgreSQL transactions. Practitioners, services, patients, bookings, and sessions are already Drizzle-backed at the repository layer when PostgreSQL is available. Lifecycle and Trash are the remaining persistence boundary for archive, delete-to-Trash, grouped restore, individual restore, purge, and export behavior.

This document is an audit and migration plan only. It does not migrate `lifecycleRepository` or `trashRepository`, change API response shapes, add reset scripts, or implement new runtime behavior.

## Current Runtime State

Current intended runtime persistence:

- Practitioners: Drizzle-backed repository.
- Services: Drizzle-backed repository with transition mirroring into `servicesStore`.
- Patients: Drizzle-backed repository with transition mirroring into `patientsStore`.
- Bookings: Drizzle-backed repository with transition mirroring into `BOOKINGS`.
- Sessions: Drizzle-backed repository with transition mirroring into `sessionsStore`.
- Lifecycle/Trash: in-memory helper behavior with narrow sync back to DB-backed repositories.
- Google integration: in-memory repository/helper behavior.

The active lifecycle entry point is `src/lib/repositories/lifecycleRepository.ts`. It delegates core behavior to `src/lib/dataLifecycle.ts`, then syncs affected patient, booking, and session records back through their repositories where transition safety requires it.

The active Trash read model entry point is `src/lib/repositories/trashRepository.ts`. It reads in-memory Trash state through `listTrash`, then builds grouped recovery views with `src/lib/trashView.ts`.

## Known Phase E Limitation

Phase E made bookings and sessions Drizzle-backed, but grouped Trash/recovery state remains incomplete after app restart because lifecycle grouping is still in memory. A deleted booking should remain excluded from active/default booking lists after restart when `bookings.deleted_at` is persisted. However, the Trash recovery view may not reconstruct the full grouped recovery state until Phase F moves `deletion_groups` and child Trash metadata into transactional DB operations.

This is expected during the transition. Phase F should make deletion groups, restore windows, restore operations, and purge behavior restart-persistent.

## Lifecycle Operation Inventory

Current in-memory mutations:

- `archivePatient`: sets `patient.active = false`; optionally cancels future active bookings; does not set Trash metadata.
- `reactivatePatient`: sets `patient.active = true`; does not change Trash metadata.
- `movePatientGraphToTrash`: creates one deletion group ID and sets Trash metadata on the patient, linked bookings, and linked sessions.
- `moveBookingToTrash`: sets Trash metadata on one booking and unlinks active sessions from that booking.
- `moveSessionToTrash`: sets Trash metadata on one session and clears `booking.sessionId` on linked active bookings.
- `moveServiceToTrash`: sets Trash metadata on one service; service disable remains separate.
- `restoreDeletionGroup`: clears Trash metadata for every in-memory record with the deletion group ID after restore-window validation.
- `purgeExpiredTrash`: permanently removes expired in-memory Trash records.
- `buildPatientFullExport`: returns patient profile plus linked bookings and sessions from current runtime stores.

Current transition sync:

- Patient archive/reactivate/delete/restore syncs patient DB state through `patientsRepository.syncRuntimePatientToDatabase`.
- Booking delete/restore and patient graph delete/restore sync affected booking DB state through `bookingsRepository.syncRuntimeBookingToDatabase`.
- Session delete/restore, booking delete unlink, and patient graph delete/restore sync affected session DB state through `sessionsRepository.syncRuntimeSessionToDatabase`.
- Trash grouping still comes from in-memory metadata, not from `deletion_groups`.

Practitioner scoping is enforced by repository route parameters and by in-memory helper filters such as `patientBelongsToPractitioner`, `booking.practitionerId`, `session.practitionerId`, and `service.practitionerId`.

## Schema Readiness

The current schema already has the main Phase F building blocks:

- `deletion_groups` table with `id`, `practitioner_id`, `deletion_type`, `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `reason`, and `created_at`.
- Lifecycle metadata on `patients`, `services`, `bookings`, and `sessions`: `deleted_at`, `restore_until`, `deleted_by_practitioner_id`, `deletion_group_id`, `deletion_type`, and `deletion_reason`.
- Archive fields for patients and services via active state and `archived_at`.
- `audit_events` table for optional audit logging.
- Restore-window checks requiring `restore_until > deleted_at` when both are present.
- Deletion type checks for `patient-data`, `booking`, `session`, and `service`.
- Practitioner/deleted indexes on child tables and a practitioner/restore index on `deletion_groups`.

Likely useful Phase F.1 schema/index review:

- Add or confirm child-table indexes on `(practitioner_id, deletion_group_id)` for patients, services, bookings, and sessions if DB Trash grouping queries need them.
- Add or confirm child-table indexes on `(practitioner_id, restore_until)` or partial indexes for purge queries if purge needs to scan expired Trash efficiently.
- Consider whether `deletion_groups.reason` plus child `deletion_reason` is sufficient for the current UI and audit needs.
- Keep `audit_events` optional for the first lifecycle migration unless the implementation can write audit rows without increasing transaction risk.

No broad schema migration should be required before starting Phase F.1. The likely changes are performance/index refinements, not new product fields.

## Required Transaction Boundaries

### Archive Patient

Within one transaction:

- Verify practitioner scope and patient exists outside Trash.
- Update patient archive state (`active = false`, optional `archived_at` if adopted consistently).
- If requested by current API behavior, cancel future active bookings for that patient and practitioner.
- Do not set `deleted_at`, `restore_until`, or `deletion_group_id`.
- Optionally write audit event after the domain update succeeds.

### Reactivate Patient

Within one transaction:

- Verify practitioner scope and patient exists outside Trash.
- Clear archive state (`active = true`, optional archive timestamp clearing if adopted).
- Leave any Trash metadata untouched.
- Optionally write audit event.

### Delete Patient Data To Trash

Within one transaction:

- Verify practitioner scope and patient exists outside Trash.
- Create one `deletion_groups` row with deletion type `patient-data`.
- Set matching Trash metadata on the patient.
- Set matching Trash metadata on all linked bookings for that patient/practitioner.
- Set matching Trash metadata on all linked sessions for that patient/practitioner.
- Preserve grouped restore behavior by sharing `deletion_group_id`.
- Optionally write audit event for group creation.

### Restore Patient Deletion Group

Within one transaction:

- Verify the deletion group belongs to the practitioner.
- Load all child patients, bookings, sessions, and services scoped to the group and practitioner.
- Verify every child record is still within `restore_until`.
- Clear Trash metadata on all grouped records together.
- Preserve archive state rules; restoring a group should not accidentally make an intentionally archived patient active unless current behavior requires it.
- Optionally write audit event.

### Delete Individual Booking To Trash

Within one transaction:

- Verify practitioner scope and booking exists outside Trash.
- Create one `deletion_groups` row with deletion type `booking`.
- Set booking Trash metadata.
- Unlink active linked sessions as current behavior requires.
- Preserve session records.
- Optionally write audit event.

### Restore Individual Booking

Within one transaction:

- Verify practitioner scope and restore window.
- Clear only that booking's Trash metadata.
- Do not restore unrelated grouped records.
- Preserve current session relationship behavior.
- Optionally write audit event.

### Delete Individual Session To Trash

Within one transaction:

- Verify practitioner scope and session exists outside Trash.
- Create one `deletion_groups` row with deletion type `session`.
- Set session Trash metadata.
- Preserve booking state appropriately, including clearing the transitional booking link if needed by current API behavior.
- Optionally write audit event.

### Restore Individual Session

Within one transaction:

- Verify practitioner scope and restore window.
- Clear only that session's Trash metadata.
- Preserve booking relationship rules and avoid re-linking to a trashed booking.
- Optionally write audit event.

### Service Disable, Archive, And Delete

Within one transaction where relevant:

- Keep disable/archive separate from Trash delete.
- Disable should preserve historical booking/session service snapshots.
- Service Trash delete should set service Trash metadata without breaking historical bookings/sessions.
- Restore should clear only service Trash metadata for individual service deletion groups.
- Optionally write audit event.

### Purge Expired Trash

Within one transaction or carefully ordered transaction set:

- Find expired Trash records by `restore_until`.
- Treat patient data deletion groups atomically.
- Permanently remove expired records according to current product rules.
- Keep records inside valid restore windows.
- Keep purge as a callable helper/admin operation; do not add a scheduler in Phase F.

## Query And Filter Behavior

After lifecycle/Trash moves to DB:

- Default patient active lists should exclude archived and trashed patients.
- Historical views can include archived records where current behavior allows it.
- Default service lists should exclude disabled and trashed services where current behavior expects active services.
- Booking lists should exclude trashed bookings by default.
- Session lists should exclude trashed sessions by default.
- Availability should ignore trashed bookings.
- Confirmed and pending bookings should block availability.
- Cancelled, no-show, completed, and trashed bookings should not block availability.
- Trash recovery should show patient deletion groups and individual records.
- Child records inside patient deletion groups should not appear as top-level records.
- Type, search, and sort filters should match current `trashView` behavior.
- "Expiring soonest" and "Expiring latest" wording should remain understandable.

## Transition Risks

Main risks to address in Phase F:

- Divergence between in-memory mirror state and DB lifecycle state.
- Grouped Trash restore after restart.
- Deleted records reappearing in active/default views.
- Patient export mixing stale in-memory lifecycle state with DB records.
- Booking/session link consistency during delete and restore.
- Service disable behavior being confused with service Trash deletion.
- Practitioner scoping leaks in grouped restore and purge queries.
- Partial failure during grouped delete/restore.
- Purge deleting records that are still inside restore windows.
- Tests relying on in-memory lifecycle side effects rather than repository behavior.

Recommended transition reduction:

- Move lifecycle writes to DB transactions first.
- Move Trash read model to DB before relying on restart-persistent recovery UI.
- Keep existing in-memory stores as mirrors only until route and UI smoke tests pass.
- Once lifecycle/Trash is DB-backed, remove or sharply reduce lifecycle-driven mirror sync paths from repositories.

## Recommended Phase F Implementation Order

Recommended order:

1. Phase F.1: Implement DB-backed `deletion_groups` and Trash read model/recovery view in `trashRepository`, preserving current response shapes.
2. Phase F.2: Move patient archive/reactivate and Delete Patient Data grouped transaction into `lifecycleRepository`.
3. Phase F.3: Move individual booking/session/service Trash delete and restore transactions into `lifecycleRepository`.
4. Phase F.4: Move `purgeExpiredTrash` to a DB-backed helper.
5. Phase F.5: Move patient export to fully DB-backed lifecycle-aware reads.
6. Phase F completion audit.

This order makes the read model restart-persistent before introducing more DB-backed lifecycle writes, then migrates the highest-risk grouped patient operation before the simpler individual record operations.

## Testing Plan

Phase F tests should cover:

- Archive patient does not set `deleted_at`.
- Archived patients are hidden from active workflow.
- Archive patient optional future-booking cancellation remains compatible.
- Reactivate patient restores active visibility.
- Delete Patient Data creates one deletion group.
- Patient deletion group includes linked bookings and sessions.
- Grouped patient restore restores all grouped records.
- Grouped restore is blocked after `restore_until`.
- Grouped restore respects practitioner scope.
- Grouped restore fails atomically when any record is outside the restore window.
- Individual booking delete moves only that booking to Trash.
- Booking delete unlinks active sessions correctly.
- Individual booking restore restores only that booking.
- Individual session delete moves only that session to Trash.
- Individual session restore restores only that session.
- Service disable remains separate from service Trash delete.
- Service Trash delete does not break historical service snapshots.
- Trash recovery view grouping, filtering, searching, and sorting.
- Child records in patient deletion groups are not top-level records.
- Restore-window sort labels and behavior.
- Purge removes expired records and keeps records inside restore period.
- Patient export includes patient profile, linked bookings, and linked sessions.
- Trashed records are excluded from active/default API responses.
- Practitioner scoping is respected everywhere.
- Trash/recovery restart persistence works after Phase F.
- API routes do not import Drizzle directly.

## Manual Browser Checklist

- Archive and reactivate a patient.
- Delete Patient Data and verify one grouped Trash item.
- Restore a grouped patient deletion during the same running app session.
- Restart app and verify grouped Trash recovery persists after Phase F.
- Delete and restore an individual booking.
- Delete and restore an individual session.
- Disable a service, then Trash-delete and restore a service separately.
- Confirm active patient/service/booking/session views hide trashed records.
- Confirm patient export includes linked bookings and sessions.
- Confirm booking availability ignores trashed bookings.

## Out Of Scope

- Google integration persistence.
- Email behavior.
- Authentication or real user identity.
- Dashboard redesign or Trash UI redesign.
- Marketing site changes.
- Destructive reset/truncate/drop scripts.
- Scheduler/cron purge automation.
