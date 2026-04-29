import type { BookingImportPreviewRow } from '@/lib/bookingsImportExport'
import {
  normalizePatientLookupKey,
  normalizeServiceLookupKey,
} from '@/lib/bookingsImportExport'
import type {
  GoogleBookingImportPreviewRow,
  GoogleImportClassification,
  GoogleImportConfidence,
  GoogleImportMode,
} from '@/lib/google/types'
import type { GoogleCalendarEvent } from '@/lib/google/calendarApi'
import type { Booking } from '@/models/booking'
import type { PatientCoreView } from '@/models/patient.coreView'
import type { Service } from '@/models/service'

function normalizeText(value: string | undefined | null) {
  return (value ?? '').trim()
}

function normalizeLooseText(value: string | undefined | null) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9äöüàáâèéêìíîòóôùúûçñß ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseGoogleEventSummary(summary: string) {
  const separators = [' — ', ' - ', ' | ', ': ']

  for (const separator of separators) {
    if (!summary.includes(separator)) continue
    const [left, ...rest] = summary.split(separator)
    const right = rest.join(separator).trim()
    if (left.trim() && right) {
      return {
        patientName: left.trim(),
        serviceName: right,
      }
    }
  }

  return null
}

function readDescriptionLines(description: string | undefined) {
  return normalizeText(description)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function findTaggedValue(lines: string[], patterns: RegExp[]) {
  const matchedLine = lines.find(line => patterns.some(pattern => pattern.test(line)))
  return matchedLine?.replace(/^[^:]+:\s*/i, '').trim() || ''
}

export function extractGoogleEventCandidates(summary: string, description: string | undefined) {
  const descriptionLines = readDescriptionLines(description)
  const delimitedSummary = parseGoogleEventSummary(summary)

  return {
    patientName:
      findTaggedValue(descriptionLines, [/^patient\s*:/i, /^client\s*:/i]) ||
      delimitedSummary?.patientName ||
      '',
    serviceName:
      findTaggedValue(descriptionLines, [/^service\s*:/i, /^appointment\s*:/i, /^type\s*:/i]) ||
      delimitedSummary?.serviceName ||
      '',
  }
}

const GENERIC_NON_BOOKING_KEYWORDS = [
  'focus',
  'fokus',
  'arbeit',
  'meeting',
  'team',
  'lunch',
  'mittag',
  'pause',
  'break',
  'vacation',
  'holiday',
  'ferien',
  'travel',
  'fahrt',
  'commute',
  'gym',
  'workout',
  'admin',
  'office',
  'planning',
  'review',
  'call',
  'telefon',
]

function looksLikeNonBookingSummary(summary: string) {
  const normalized = normalizeLooseText(summary)
  if (!normalized) return false
  return GENERIC_NON_BOOKING_KEYWORDS.some(keyword => normalized.includes(keyword))
}

function isAllDayEvent(event: GoogleCalendarEvent) {
  return Boolean(event.start?.date && !event.start?.dateTime)
}

function getEventStartIso(event: GoogleCalendarEvent) {
  if (event.start?.dateTime) return new Date(event.start.dateTime).toISOString()
  return ''
}

function getEventEndIso(event: GoogleCalendarEvent) {
  if (event.end?.dateTime) return new Date(event.end.dateTime).toISOString()
  return ''
}

export function detectGoogleBookingDuplicate(
  eventId: string,
  start: string,
  end: string,
  serviceName: string,
  existingBookings: Booking[],
) {
  const existingImport = existingBookings.find(booking => booking.externalEventId === eventId)
  if (existingImport) {
    return {
      duplicateStatus: 'existing-import' as const,
      booking: existingImport,
    }
  }

  const probableDuplicate = existingBookings.find(
    booking =>
      booking.start === start &&
      booking.end === end &&
      normalizeServiceLookupKey(booking.serviceName) === normalizeServiceLookupKey(serviceName),
  )

  return {
    duplicateStatus: probableDuplicate ? 'possible' as const : 'none' as const,
    booking: probableDuplicate,
  }
}

function findExactPatientMatch(candidate: string, patients: PatientCoreView[]) {
  const candidateKey = normalizePatientLookupKey(candidate)
  if (!candidateKey) return null
  return patients.find(patient => normalizePatientLookupKey(patient.name) === candidateKey) ?? null
}

function findContainedPatientMatch(summary: string, patients: PatientCoreView[]) {
  const normalizedSummary = normalizePatientLookupKey(summary)
  if (!normalizedSummary) return null

  const matches = patients.filter(patient => {
    const patientKey = normalizePatientLookupKey(patient.name)
    return patientKey && normalizedSummary.includes(patientKey)
  })

  return matches.length === 1 ? matches[0] : null
}

function findServiceMatch(candidates: string[], summary: string, services: Service[]) {
  for (const candidate of candidates) {
    const key = normalizeServiceLookupKey(candidate)
    if (!key) continue

    const exact = services.find(service => normalizeServiceLookupKey(service.name) === key)
    if (exact) return exact
  }

  const normalizedSummary = normalizeServiceLookupKey(summary)
  if (!normalizedSummary) return null

  const containedMatches = services.filter(service => {
    const key = normalizeServiceLookupKey(service.name)
    return key && normalizedSummary.includes(key)
  })

  return containedMatches.length === 1 ? containedMatches[0] : null
}

function filterRowsForMode(
  rows: GoogleBookingImportPreviewRow[],
  mode: GoogleImportMode,
) {
  switch (mode) {
    case 'appointments-only':
      return rows.filter(row => row.importClassification === 'booking-candidate')
    case 'timed-events':
      return rows.filter(row => row.importClassification !== 'ignore')
    case 'review-everything':
    default:
      return rows
  }
}

export function classifyGoogleImportCandidate({
  summary,
  hasPatientMatch,
  hasServiceMatch,
  duplicateStatus,
  errors,
  shouldIgnore = false,
}: {
  summary: string
  hasPatientMatch: boolean
  hasServiceMatch: boolean
  duplicateStatus: GoogleBookingImportPreviewRow['duplicateStatus']
  errors: string[]
  shouldIgnore?: boolean
}) {
  const reviewReasons: string[] = []
  let importClassification: GoogleImportClassification = 'booking-candidate'
  let importConfidence: GoogleImportConfidence = errors.length > 0 ? 'not-suitable' : 'review'

  if (shouldIgnore) {
    importClassification = 'ignore'
  } else if (!hasPatientMatch && !hasServiceMatch && looksLikeNonBookingSummary(summary)) {
    importClassification = 'blocked-time-candidate'
    importConfidence = 'not-suitable'
    reviewReasons.push('Looks like blocked time')
  } else if (hasPatientMatch && hasServiceMatch) {
    importClassification = 'booking-candidate'
    importConfidence = duplicateStatus === 'possible' ? 'review' : 'high'
  } else {
    if (!hasPatientMatch) reviewReasons.push('Review patient')
    if (!hasServiceMatch) reviewReasons.push('Review service')
  }

  return {
    importClassification,
    importConfidence,
    reviewReasons,
  }
}

export function buildGoogleBookingImportPreview(
  events: GoogleCalendarEvent[],
  calendarId: string,
  patients: PatientCoreView[],
  services: Service[],
  existingBookings: Booking[],
  mode: GoogleImportMode = 'appointments-only',
): GoogleBookingImportPreviewRow[] {
  const builtRows = events.map<GoogleBookingImportPreviewRow>((event, index): GoogleBookingImportPreviewRow => {
    const summary = normalizeText(event.summary) || 'Untitled Google event'
    const candidates = extractGoogleEventCandidates(summary, event.description)

    const start = getEventStartIso(event)
    const end = getEventEndIso(event)

    const exactPatient =
      findExactPatientMatch(candidates.patientName, patients) ??
      findExactPatientMatch(summary, patients) ??
      findContainedPatientMatch(summary, patients)

    const exactService = findServiceMatch(
      [candidates.serviceName].filter(Boolean),
      summary,
      services,
    )

    const patientName =
      exactPatient?.name ??
      candidates.patientName
    const serviceName =
      exactService?.name ??
      candidates.serviceName
    const matchedPatientId = exactPatient?.id
    const matchedServiceId = exactService?.id

    const reviewReasons: string[] = []
    const errors: string[] = []
    const warnings: string[] = []
    let shouldIgnore = false

    if (event.status === 'cancelled') {
      errors.push('Already cancelled')
      shouldIgnore = true
    }

    if (isAllDayEvent(event)) {
      errors.push('All-day event')
      shouldIgnore = true
    }

    if (!start || !end) {
      errors.push('Missing time')
    }

    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
      errors.push('Invalid time')
    }

    const duplicate = detectGoogleBookingDuplicate(event.id, start, end, serviceName, existingBookings)
    const duplicateStatus = duplicate.duplicateStatus
    if (duplicateStatus === 'existing-import') {
      errors.push('Already imported')
    } else if (duplicate.booking) {
      warnings.push(`Possible duplicate of booking ${duplicate.booking.code}`)
      reviewReasons.push(`Possible duplicate of booking ${duplicate.booking.code}`)
    }

    const classification = classifyGoogleImportCandidate({
      summary,
      hasPatientMatch: Boolean(exactPatient),
      hasServiceMatch: Boolean(exactService),
      duplicateStatus,
      errors,
      shouldIgnore,
    })
    reviewReasons.push(...classification.reviewReasons)

    if (patientName && !exactPatient) warnings.push('Review patient')
    if (serviceName && !exactService) warnings.push('Review service')

    const builtRow: GoogleBookingImportPreviewRow = {
      rowNumber: index + 1,
      patientName,
      serviceName,
      start,
      end,
      status: 'confirmed' as const,
      resource: normalizeText(event.location),
      notes: normalizeText(event.description),
      matchedPatientId,
      matchedServiceId,
      willCreatePatient: false,
      willCreateService: false,
      errors,
      warnings,
      isValid: errors.length === 0,
      externalSource: 'google',
      externalEventId: event.id,
      externalCalendarId: calendarId,
      sourceSummary: summary,
      sourceUpdatedAt: event.updated,
      importClassification: classification.importClassification,
      importConfidence: classification.importConfidence,
      duplicateStatus,
      reviewReasons,
    }

    return builtRow
  })

  return filterRowsForMode(builtRows, mode)
}

export function mapGooglePreviewRowsToGeneric(rows: GoogleBookingImportPreviewRow[]): BookingImportPreviewRow[] {
  return rows.map(row => ({ ...row }))
}
