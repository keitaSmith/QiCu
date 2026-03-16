// /models/booking.ts

export type BookingStatus =
  | 'confirmed'
  | 'pending'
  | 'cancelled'
  | 'fulfilled'
  | 'no-show'

export type Booking = {
  /** Internal PK (UUID/ULID) */
  id: string

  /** Human-friendly code (for UI/emails) */
  code: string

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
}
