import type { bookings } from '@/db/schema'

import {
  demoBookingIds,
  demoPatientIds,
  demoPractitionerIds,
  demoServiceIds,
} from './ids'

type DemoBookingInsert = typeof bookings.$inferInsert

type DemoBookingSeedOptions = {
  floatingDates?: boolean
}

type DemoBookingSource = {
  currentId: keyof typeof demoBookingIds
  practitionerCurrentId: keyof typeof demoPractitionerIds
  code: string
  patientCurrentId: keyof typeof demoPatientIds
  serviceCurrentId: keyof typeof demoServiceIds
  serviceName: string
  serviceDurationMinutes: number
  resource?: string
  dayOffset: number
  startTime: string
  endTime: string
  status: DemoBookingInsert['status']
  notes?: string
}

const fixedBaseDate = '2026-05-06'

const demoBookingSources: DemoBookingSource[] = [
  {
    currentId: 'b-tom-today-001',
    practitionerCurrentId: 'prac-tom-cook',
    code: 'BKG-TOM-001',
    patientCurrentId: 'P-T-1001',
    serviceCurrentId: 'tom-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 1',
    dayOffset: 0,
    startTime: '09:00',
    endTime: '10:00',
    status: 'confirmed',
    notes: 'Initial acupuncture consultation.',
  },
  {
    currentId: 'b-tom-today-002',
    practitionerCurrentId: 'prac-tom-cook',
    code: 'BKG-TOM-002',
    patientCurrentId: 'P-T-1002',
    serviceCurrentId: 'tom-acu-30',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 30,
    resource: 'Room 2',
    dayOffset: 0,
    startTime: '11:00',
    endTime: '11:30',
    status: 'confirmed',
  },
  {
    currentId: 'b-tom-live-003',
    practitionerCurrentId: 'prac-tom-cook',
    code: 'BKG-TOM-LIVE-003',
    patientCurrentId: 'P-T-1004',
    serviceCurrentId: 'tom-acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 1',
    dayOffset: 0,
    startTime: '12:00',
    endTime: '12:45',
    status: 'confirmed',
    notes: 'Test booking that should be ready to start or in progress right away.',
  },
  {
    currentId: 'b-tom-upcoming-101',
    practitionerCurrentId: 'prac-tom-cook',
    code: 'BKG-TOM-UP-101',
    patientCurrentId: 'P-T-1003',
    serviceCurrentId: 'tom-massage-60',
    serviceName: 'Massage',
    serviceDurationMinutes: 60,
    resource: 'Room 3',
    dayOffset: 1,
    startTime: '14:00',
    endTime: '15:00',
    status: 'confirmed',
  },
  {
    currentId: 'b-tom-past-201',
    practitionerCurrentId: 'prac-tom-cook',
    code: 'BKG-TOM-PAST-201',
    patientCurrentId: 'P-T-1002',
    serviceCurrentId: 'tom-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    dayOffset: -1,
    startTime: '09:00',
    endTime: '10:00',
    status: 'completed',
    notes: 'Completed yesterday.',
  },
  {
    currentId: 'b-keita-today-001',
    practitionerCurrentId: 'prac-keita-smith',
    code: 'BKG-KEI-001',
    patientCurrentId: 'P-K-2001',
    serviceCurrentId: 'keita-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    dayOffset: 0,
    startTime: '10:30',
    endTime: '11:30',
    status: 'confirmed',
    notes: 'Shoulder tension follow-up.',
  },
  {
    currentId: 'b-keita-today-002',
    practitionerCurrentId: 'prac-keita-smith',
    code: 'BKG-KEI-002',
    patientCurrentId: 'P-K-2002',
    serviceCurrentId: 'keita-cupping-30',
    serviceName: 'Cupping',
    serviceDurationMinutes: 30,
    resource: 'Room 1',
    dayOffset: 0,
    startTime: '13:00',
    endTime: '13:30',
    status: 'confirmed',
  },
  {
    currentId: 'b-keita-upcoming-101',
    practitionerCurrentId: 'prac-keita-smith',
    code: 'BKG-KEI-UP-101',
    patientCurrentId: 'P-K-2003',
    serviceCurrentId: 'keita-acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 3',
    dayOffset: 2,
    startTime: '16:00',
    endTime: '16:45',
    status: 'confirmed',
  },
  {
    currentId: 'b-keita-past-201',
    practitionerCurrentId: 'prac-keita-smith',
    code: 'BKG-KEI-PAST-201',
    patientCurrentId: 'P-K-2004',
    serviceCurrentId: 'keita-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 1',
    dayOffset: -2,
    startTime: '15:00',
    endTime: '16:00',
    status: 'no-show',
  },
]

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function buildTimestamp(dayOffset: number, time: string, options: DemoBookingSeedOptions) {
  const base = options.floatingDates ? new Date() : new Date(`${fixedBaseDate}T00:00:00.000Z`)
  const date = addDays(base, dayOffset)
  const [hours, minutes] = time.split(':').map(Number)
  date.setUTCHours(hours, minutes, 0, 0)
  return date
}

export function buildDemoBookingsSeed(options: DemoBookingSeedOptions = {}) {
  return demoBookingSources.map(source => ({
    id: demoBookingIds[source.currentId],
    code: source.code,
    practitionerId: demoPractitionerIds[source.practitionerCurrentId],
    patientId: demoPatientIds[source.patientCurrentId],
    serviceId: demoServiceIds[source.serviceCurrentId],
    serviceName: source.serviceName,
    serviceDurationMinutes: source.serviceDurationMinutes,
    resource: source.resource,
    startAt: buildTimestamp(source.dayOffset, source.startTime, options),
    endAt: buildTimestamp(source.dayOffset, source.endTime, options),
    status: source.status,
    notes: source.notes,
  })) satisfies Array<typeof bookings.$inferInsert>
}

export const demoBookings = buildDemoBookingsSeed()
