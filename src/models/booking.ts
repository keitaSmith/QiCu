// /models/booking.ts

export type BookingStatus =
  | 'confirmed'
  | 'pending'
  | 'in-progress'
  | 'cancelled'
  | 'completed'
  | 'no-show'

export type Booking = {
  /** Internal PK (UUID/ULID) */
  id: string

  /** Human-friendly code (for UI/emails) */
  code: string

  /** Practitioner that owns this booking */
  practitionerId: string

  /** Patient this booking belongs to */
  patientId: string // e.g., 'P-1001'

  /**
   * Service reference and snapshot
   *
   * - serviceId: points to a service definition (from SERVICES)
   * - serviceName: human-readable name at time of booking
   * - serviceDurationMinutes: duration at time of booking
   *
   * We keep these on the booking so slot logic and history do NOT depend
   * on parsing labels or the current service config.
   */
  serviceId: string
  serviceName: string
  serviceDurationMinutes: number

  /** Optional resource, e.g. room or practitioner name */
  resource?: string

  /** ISO-8601 start datetime (local or UTC, but consistent within the app) */
  start: string

  /** ISO-8601 end datetime */
  end: string

  /** Booking lifecycle state */
  status: BookingStatus

  /** Optional notes from practitioner or receptionist */
  notes?: string

  /** Optional link to a created session (Phase 2/3) */
  sessionId?: string | null

  /** External calendar linkage (used for Google Calendar import/sync) */
  externalSource?: 'google' | null
  externalCalendarId?: string | null
  externalEventId?: string | null
  externalSyncStatus?: 'imported' | 'synced' | 'pending' | 'error' | null
  externalLastSyncedAt?: string

  /** Last time the booking status changed */
  statusUpdatedAt?: string
}
