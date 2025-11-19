// /models/booking.ts
export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'fulfilled' | 'no-show'

export type Booking = {
  /** Internal PK (UUID/ULID) */
  id: string
  /** Human-friendly code (for UI/emails) */
  code: string
  patientId: string          // e.g., 'P-1001'
  service: string
  resource?: string
  start: string              // ISO datetime
  end: string                // ISO datetime
  status: BookingStatus
  notes?: string
  sessionId?: string | null
}

