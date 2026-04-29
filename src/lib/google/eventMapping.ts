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

function tryReadDelimitedSummary(summary: string) {
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

export function buildGoogleBookingImportPreview(
  events: GoogleCalendarEvent[],
  calendarId: string,
  patients: PatientCoreView[],
  services: Service[],
  existingBookings: Booking[],
  mode: GoogleImportMode = 'appointments-only',
): GoogleBookingImportPreviewRow[] {
  const existingByExternalId = new Map(
    existingBookings
      .filter(booking => booking.externalEventId)
      .map(booking => [booking.externalEventId ?? '', booking]),
  )

  const builtRows = events.map<GoogleBookingImportPreviewRow>((event, index): GoogleBookingImportPreviewRow => {
    const summary = normalizeText(event.summary) || 'Untitled Google event'
    const descriptionLines = readDescriptionLines(event.description)
    const delimitedSummary = tryReadDelimitedSummary(summary)
    const explicitPatient = findTaggedValue(descriptionLines, [/^patient\s*:/i, /^client\s*:/i])
    const explicitService = findTaggedValue(descriptionLines, [/^service\s*:/i, /^appointment\s*:/i, /^type\s*:/i])

    const start = getEventStartIso(event)
    const end = getEventEndIso(event)

    const exactPatient =
      findExactPatientMatch(explicitPatient, patients) ??
      findExactPatientMatch(delimitedSummary?.patientName ?? '', patients) ??
      findExactPatientMatch(summary, patients) ??
      findContainedPatientMatch(summary, patients)

    const exactService = findServiceMatch(
      [explicitService, delimitedSummary?.serviceName ?? ''].filter(Boolean),
      summary,
      services,
    )

    const patientName =
      exactPatient?.name ??
      (explicitPatient || delimitedSummary?.patientName || '')
    const serviceName =
      exactService?.name ??
      (explicitService || delimitedSummary?.serviceName || '')
    const matchedPatientId = exactPatient?.id
    const matchedServiceId = exactService?.id
    const existingByEventId = existingByExternalId.get(event.id)
    const probableDuplicate = existingBookings.find(
      booking =>
        booking.start === start &&
        booking.end === end &&
        normalizeServiceLookupKey(booking.serviceName) === normalizeServiceLookupKey(serviceName),
    )

    const reviewReasons: string[] = []
    const errors: string[] = []
    const warnings: string[] = []
    let importClassification: GoogleImportClassification = 'booking-candidate'
    let importConfidence: GoogleImportConfidence = 'review'

    if (event.status === 'cancelled') {
      errors.push('Already cancelled')
      importClassification = 'ignore'
      importConfidence = 'not-suitable'
    }

    if (isAllDayEvent(event)) {
      errors.push('All-day event')
      importClassification = 'ignore'
      importConfidence = 'not-suitable'
    }

    if (!start || !end) {
      errors.push('Missing time')
      importConfidence = 'not-suitable'
    }

    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
      errors.push('Invalid time')
      importConfidence = 'not-suitable'
    }

    let duplicateStatus: GoogleBookingImportPreviewRow['duplicateStatus'] = 'none'
    if (existingByEventId) {
      duplicateStatus = 'existing-import'
      errors.push('Already imported')
      importConfidence = 'not-suitable'
    } else if (probableDuplicate) {
      duplicateStatus = 'possible'
      warnings.push(`Possible duplicate of booking ${probableDuplicate.code}`)
      reviewReasons.push(`Possible duplicate of booking ${probableDuplicate.code}`)
    }

    if (!exactPatient && !exactService && looksLikeNonBookingSummary(summary)) {
      importClassification = 'blocked-time-candidate'
      importConfidence = 'not-suitable'
      reviewReasons.push('Looks like blocked time')
    }

    if (exactPatient && exactService) {
      importClassification = 'booking-candidate'
      importConfidence = duplicateStatus === 'possible' ? 'review' : 'high'
    } else {
      if (!exactPatient) {
        reviewReasons.push('Review patient')
      }
      if (!exactService) {
        reviewReasons.push('Review service')
      }

      if (importClassification !== 'blocked-time-candidate' && errors.length === 0) {
        importClassification = 'booking-candidate'
        importConfidence = 'review'
      }
    }

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
      importClassification,
      importConfidence,
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
