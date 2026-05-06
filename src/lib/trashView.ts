import { displayName, type FhirPatient } from '@/models/patient'
import type { Booking } from '@/models/booking'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'
import type { TrashMetadata } from '@/models/lifecycle'

export type TrashPayload = {
  patients: FhirPatient[]
  bookings: Booking[]
  sessions: Session[]
  services: Service[]
}

export type TrashTypeFilter =
  | 'all'
  | 'patient-groups'
  | 'patients'
  | 'bookings'
  | 'sessions'
  | 'services'

export type TrashSortOption =
  | 'deleted-desc'
  | 'deleted-asc'
  | 'restore-asc'
  | 'restore-desc'

export const trashSortOptions: Array<{ value: TrashSortOption; label: string }> = [
  { value: 'deleted-desc', label: 'Newest deleted first' },
  { value: 'deleted-asc', label: 'Oldest deleted first' },
  { value: 'restore-asc', label: 'Expiring soonest' },
  { value: 'restore-desc', label: 'Expiring latest' },
]

export type TrashIndividualType = 'patient' | 'booking' | 'session' | 'service'

export type TrashPatientGroup = {
  kind: 'patient-group'
  key: string
  deletionGroupId: string
  label: string
  deletedAt: string
  restoreUntil: string
  bookingsCount: number
  sessionsCount: number
  childLabels: string[]
  searchText: string
}

export type TrashIndividualRecord = {
  kind: 'individual'
  key: string
  deletionGroupId: string
  recordType: TrashIndividualType
  label: string
  subtitle: string
  deletedAt: string
  restoreUntil: string
  searchText: string
}

export type TrashRecoveryView = {
  patientGroups: TrashPatientGroup[]
  individualRecords: TrashIndividualRecord[]
}

export type TrashViewFilters = {
  query: string
  type: TrashTypeFilter
}

function metadata(record: { trashMetadata?: TrashMetadata }) {
  return record.trashMetadata
}

function bookingLabel(booking: Booking) {
  return `${booking.code} - ${booking.serviceName}`
}

function sessionLabel(session: Session) {
  return session.serviceName ?? session.chiefComplaint
}

function serviceLabel(service: Service) {
  return `${service.name} (${service.durationMinutes} min)`
}

function patientMetadataGroupId(patient: FhirPatient) {
  return patient.trashMetadata?.deletionGroupId
}

function toSearchText(values: Array<string | number | null | undefined>) {
  return values.filter(value => value !== null && value !== undefined).join(' ').toLowerCase()
}

function compareByDate(sort: TrashSortOption) {
  return (a: { deletedAt: string; restoreUntil: string }, b: { deletedAt: string; restoreUntil: string }) => {
    const deletedA = new Date(a.deletedAt).getTime()
    const deletedB = new Date(b.deletedAt).getTime()
    const restoreA = new Date(a.restoreUntil).getTime()
    const restoreB = new Date(b.restoreUntil).getTime()

    switch (sort) {
      case 'deleted-asc':
        return deletedA - deletedB
      case 'restore-asc':
        return restoreA - restoreB
      case 'restore-desc':
        return restoreB - restoreA
      default:
        return deletedB - deletedA
    }
  }
}

export function buildTrashRecoveryView(records: TrashPayload): TrashRecoveryView {
  const patientDataGroupIds = new Set<string>()

  for (const record of [...records.patients, ...records.bookings, ...records.sessions]) {
    const item = metadata(record)
    if (item?.deletionType === 'patient-data') {
      patientDataGroupIds.add(item.deletionGroupId)
    }
  }

  const patientGroups: TrashPatientGroup[] = [...patientDataGroupIds].flatMap(deletionGroupId => {
    const patient = records.patients.find(item => patientMetadataGroupId(item) === deletionGroupId)
    const groupBookings = records.bookings.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId)
    const groupSessions = records.sessions.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId)
    const firstMetadata = patient?.trashMetadata ?? groupBookings[0]?.trashMetadata ?? groupSessions[0]?.trashMetadata

    if (!firstMetadata) return []

    const childLabels = [
      ...groupBookings.map(bookingLabel),
      ...groupSessions.map(sessionLabel),
    ]
    const label = patient ? displayName(patient) : 'Patient data'

    return [{
      kind: 'patient-group',
      key: `patient-group:${deletionGroupId}`,
      deletionGroupId,
      label,
      deletedAt: firstMetadata.deletedAt,
      restoreUntil: firstMetadata.restoreUntil,
      bookingsCount: groupBookings.length,
      sessionsCount: groupSessions.length,
      childLabels,
      searchText: toSearchText([
        label,
        'patient data group',
        `${groupBookings.length} bookings`,
        `${groupSessions.length} sessions`,
        ...childLabels,
      ]),
    }]
  })

  const individualPatients = records.patients.flatMap(patient => {
    const item = metadata(patient)
    if (!item || item.deletionType === 'patient-data') return []
    const label = displayName(patient)
    return [buildIndividualRecord({
      key: `patient:${patient.id}`,
      recordType: 'patient',
      label,
      subtitle: 'Patient',
      metadata: item,
      searchValues: [label, 'patient'],
    })]
  })

  const individualBookings = records.bookings.flatMap(booking => {
    const item = metadata(booking)
    if (!item || patientDataGroupIds.has(item.deletionGroupId)) return []
    const label = bookingLabel(booking)
    return [buildIndividualRecord({
      key: `booking:${booking.id}`,
      recordType: 'booking',
      label,
      subtitle: 'Booking',
      metadata: item,
      searchValues: [label, booking.code, booking.serviceName, 'booking'],
    })]
  })

  const individualSessions = records.sessions.flatMap(session => {
    const item = metadata(session)
    if (!item || patientDataGroupIds.has(item.deletionGroupId)) return []
    const label = sessionLabel(session)
    return [buildIndividualRecord({
      key: `session:${session.id}`,
      recordType: 'session',
      label,
      subtitle: 'Session',
      metadata: item,
      searchValues: [
        label,
        session.chiefComplaint,
        session.treatmentSummary,
        session.outcome,
        session.startDateTime,
        'session',
      ],
    })]
  })

  const individualServices = records.services.flatMap(service => {
    const item = metadata(service)
    if (!item) return []
    const label = serviceLabel(service)
    return [buildIndividualRecord({
      key: `service:${service.id}`,
      recordType: 'service',
      label,
      subtitle: 'Service',
      metadata: item,
      searchValues: [label, service.name, service.description, 'service'],
    })]
  })

  return {
    patientGroups,
    individualRecords: [
      ...individualPatients,
      ...individualBookings,
      ...individualSessions,
      ...individualServices,
    ],
  }
}

function buildIndividualRecord({
  key,
  recordType,
  label,
  subtitle,
  metadata,
  searchValues,
}: {
  key: string
  recordType: TrashIndividualType
  label: string
  subtitle: string
  metadata: TrashMetadata
  searchValues: Array<string | number | null | undefined>
}): TrashIndividualRecord {
  return {
    kind: 'individual',
    key,
    recordType,
    label,
    subtitle,
    deletionGroupId: metadata.deletionGroupId,
    deletedAt: metadata.deletedAt,
    restoreUntil: metadata.restoreUntil,
    searchText: toSearchText(searchValues),
  }
}

export function filterTrashView(view: TrashRecoveryView, filters: TrashViewFilters): TrashRecoveryView {
  const query = filters.query.trim().toLowerCase()
  const matchesQuery = (item: { searchText: string }) => !query || item.searchText.includes(query)

  const patientGroups =
    filters.type === 'all' || filters.type === 'patient-groups'
      ? view.patientGroups.filter(matchesQuery)
      : []

  const individualRecords = view.individualRecords.filter(item => {
    if (!matchesQuery(item)) return false
    if (filters.type === 'all') return true
    if (filters.type === 'patients') return item.recordType === 'patient'
    if (filters.type === 'bookings') return item.recordType === 'booking'
    if (filters.type === 'sessions') return item.recordType === 'session'
    if (filters.type === 'services') return item.recordType === 'service'
    return false
  })

  return { patientGroups, individualRecords }
}

export function sortTrashView(view: TrashRecoveryView, sort: TrashSortOption): TrashRecoveryView {
  const compare = compareByDate(sort)
  return {
    patientGroups: [...view.patientGroups].sort(compare),
    individualRecords: [...view.individualRecords].sort(compare),
  }
}
