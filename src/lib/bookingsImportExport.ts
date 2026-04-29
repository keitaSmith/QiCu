import type { Booking, BookingStatus } from '@/models/booking'
import type { Service } from '@/models/service'
import type { PatientCoreView } from '@/models/patient.coreView'

export type ImportedBookingRow = {
  rowNumber: number
  patientName: string
  serviceName: string
  start: string
  end: string
  status: BookingStatus
  resource?: string
  notes?: string
}

export type BookingImportPreviewRow = ImportedBookingRow & {
  isValid: boolean
  errors: string[]
  warnings: string[]
  matchedPatientId?: string
  matchedServiceId?: string
  willCreatePatient?: boolean
  willCreateService?: boolean
  externalSource?: 'google'
  externalCalendarId?: string
  externalEventId?: string
  sourceSummary?: string
  sourceUpdatedAt?: string
  importClassification?: 'booking-candidate' | 'blocked-time-candidate' | 'ignore'
  importConfidence?: 'high' | 'review' | 'not-suitable'
  duplicateStatus?: 'none' | 'possible' | 'existing-import'
  reviewReasons?: string[]
}

const STATUS_VALUES: BookingStatus[] = [
  'confirmed',
  'pending',
  'in-progress',
  'cancelled',
  'completed',
  'no-show',
]

const STATUS_ALIASES: Record<string, BookingStatus> = {
  scheduled: 'confirmed',
  booked: 'confirmed',
  confirmed: 'confirmed',
  pending: 'pending',
  'in progress': 'in-progress',
  'in-progress': 'in-progress',
  inprogress: 'in-progress',
  complete: 'completed',
  completed: 'completed',
  done: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  'no-show': 'no-show',
  noshow: 'no-show',
  'no show': 'no-show',
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeCell(value: string | undefined) {
  return (value ?? '').trim()
}


function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizePatientLookupKey(value: string) {
  const trimmed = normalizeWhitespace(value).toLowerCase()
  if (!trimmed) return ''

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(part => normalizeWhitespace(part))
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return normalizeWhitespace(`${parts[1]} ${parts[0]}`)
    }
  }

  return trimmed
}

export function normalizeServiceLookupKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeCsvCell(value: string | number | null | undefined) {
  const stringValue = value == null ? '' : String(value)
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      const next = line[index + 1]
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

export function parseBookingsCsv(csvText: string): Record<string, string>[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)

  if (lines.length === 0) return []

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)

  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    const row: Record<string, string> = {}

    headers.forEach((header, index) => {
      row[header] = normalizeCell(cells[index])
    })

    return row
  })
}

function parseDateTime(dateValue: string, timeValue: string) {
  if (!dateValue) return null

  if (timeValue) {
    const combined = `${dateValue}T${timeValue}`
    const parsed = new Date(combined)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(dateValue)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}


function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function isFutureBooking(start: Date) {
  return start.getTime() > startOfToday().getTime()
}
function readStatus(value: string): BookingStatus {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'confirmed'

  const aliasMatch = STATUS_ALIASES[normalized]
  if (aliasMatch) return aliasMatch

  const match = STATUS_VALUES.find(item => item === normalized)
  return match ?? 'confirmed'
}

export function buildBookingImportPreview(
  rawRows: Record<string, string>[],
  patients: PatientCoreView[],
  services: Service[],
): BookingImportPreviewRow[] {
  const patientMap = new Map(
    patients.map(patient => [normalizePatientLookupKey(patient.name), patient.id ?? '']),
  )
  const serviceMap = new Map(
    services.map(service => [normalizeServiceLookupKey(service.name), service]),
  )

  return rawRows.map((row, rowIndex) => {
    const patientName =
      row.patientname || row.patient || row.client || row.clientname || ''
    const serviceName =
      row.servicename || row.service || row.appointmenttype || ''

    const start = parseDateTime(
      row.date || row.bookingdate || row.startdate || row.start,
      row.starttime || row.time || '',
    )

    let end = parseDateTime(
      row.enddate || row.date || row.end,
      row.endtime || '',
    )

    const matchedService = serviceMap.get(normalizeServiceLookupKey(serviceName))

    if (!end && start) {
      const durationValue = Number.parseInt(row.durationminutes || row.duration || '', 10)
      const resolvedDuration = Number.isFinite(durationValue) && durationValue > 0
        ? durationValue
        : matchedService?.durationMinutes

      if (resolvedDuration) {
        end = new Date(start.getTime() + resolvedDuration * 60_000)
      }
    }

    const errors: string[] = []
    const warnings: string[] = []
    const matchedPatientId = patientMap.get(normalizePatientLookupKey(patientName))
    const matchedServiceId = matchedService?.id
    const willCreatePatient = Boolean(patientName) && !matchedPatientId
    const willCreateService = Boolean(serviceName) && !matchedServiceId
    const status = readStatus(row.status || '')

    if (!patientName) errors.push('Missing patient name')
    if (!serviceName) errors.push('Missing service name')
    if (!start) errors.push('Missing or invalid start date/time')
    if (!end) errors.push('Missing or invalid end time / duration')
    if (willCreatePatient) warnings.push('New patient will be created during import')
    if (willCreateService) warnings.push('New service will be created during import')
    if (start && end && end.getTime() <= start.getTime()) errors.push('End must be after start')
    if (start && isFutureBooking(start) && ['completed', 'no-show', 'in-progress'].includes(status)) {
      errors.push('Future bookings cannot be imported as completed, no-show, or in-progress')
    }

    return {
      rowNumber: rowIndex + 2,
      patientName,
      serviceName,
      start: start?.toISOString() ?? '',
      end: end?.toISOString() ?? '',
      status,
      resource: row.resource || row.room || '',
      notes: row.notes || row.note || '',
      matchedPatientId,
      matchedServiceId,
      willCreatePatient,
      willCreateService,
      errors,
      warnings,
      isValid: errors.length === 0,
    }
  })
}

export function buildBookingsExportCsv(bookings: Booking[], patients: PatientCoreView[]) {
  const patientNameById = new Map(
    patients.map(patient => [patient.id ?? '', patient.name]),
  )

  const headers = [
    'code',
    'patient_name',
    'service_name',
    'date',
    'start_time',
    'end_time',
    'duration_minutes',
    'status',
    'resource',
    'notes',
  ]

  const rows = bookings.map(booking => {
    const start = new Date(booking.start)
    const end = new Date(booking.end)
    const date = start.toISOString().slice(0, 10)
    const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`

    return [
      booking.code,
      patientNameById.get(booking.patientId) ?? booking.patientId,
      booking.serviceName,
      date,
      startTime,
      endTime,
      booking.serviceDurationMinutes,
      booking.status,
      booking.resource ?? '',
      booking.notes ?? '',
    ]
  })

  return [headers, ...rows]
    .map(row => row.map(cell => escapeCsvCell(cell)).join(','))
    .join('\n')
}

export function buildBookingsTemplateCsv() {
  const headers = [
    'patient_name',
    'service_name',
    'date',
    'start_time',
    'end_time',
    'duration_minutes',
    'status',
    'resource',
    'notes',
  ]

  const exampleRow = [
    'Jane Doe',
    'Follow-up Acupuncture',
    '2026-03-24',
    '09:00',
    '09:45',
    '45',
    'confirmed',
    'Room 1',
    'Imported from previous system',
  ]

  return [headers, exampleRow]
    .map(row => row.map(cell => escapeCsvCell(cell)).join(','))
    .join('\n')
}
