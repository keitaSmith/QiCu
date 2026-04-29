export type GoogleIntegrationRecord = {
  practitionerId: string
  connected: boolean
  googleUserEmail?: string
  accessToken?: string
  refreshToken?: string
  tokenExpiry?: number
  selectedCalendarId?: string
  selectedCalendarName?: string
  lastError?: string | null
  connectedAt?: string
}

export type GoogleCalendarOption = {
  id: string
  summary: string
  primary?: boolean
  accessRole?: string
}

export type GoogleImportMode = 'appointments-only' | 'timed-events' | 'review-everything'

export type GoogleImportClassification =
  | 'booking-candidate'
  | 'blocked-time-candidate'
  | 'ignore'

export type GoogleImportConfidence = 'high' | 'review' | 'not-suitable'

export type GoogleDuplicateStatus = 'none' | 'possible' | 'existing-import'

export type GoogleBookingImportPreviewRow = {
  rowNumber: number
  patientName: string
  serviceName: string
  start: string
  end: string
  status: 'confirmed'
  resource?: string
  notes?: string
  isValid: boolean
  errors: string[]
  warnings: string[]
  matchedPatientId?: string
  matchedServiceId?: string
  willCreatePatient?: boolean
  willCreateService?: boolean
  externalSource: 'google'
  externalEventId: string
  externalCalendarId: string
  sourceSummary: string
  sourceUpdatedAt?: string
  importClassification: GoogleImportClassification
  importConfidence: GoogleImportConfidence
  duplicateStatus: GoogleDuplicateStatus
  reviewReasons: string[]
}
