// /data/bookings.ts
import type { Booking } from '@/models/booking'

function todayAt(hh: string, mm: string) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}:00`
}

function dayOffsetAt(offsetDays: number, hh: string, mm: string) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}:00`
}

function minuteOffsetToday(offsetMinutes: number) {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + offsetMinutes)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}:00`
}

export const BOOKINGS: Booking[] = [
  {
    id: 'b-today-001',
    code: 'BKG-TODAY-001',
    patientId: 'P-1001',
    serviceId: 'acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 1',
    start: todayAt('09', '00'),
    end: todayAt('10', '00'),
    status: 'confirmed',
    notes: 'Initial acupuncture consultation.',
  },
  {
    id: 'b-today-002',
    code: 'BKG-TODAY-002',
    patientId: 'P-1002',
    serviceId: 'acu-30',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 30,
    resource: 'Room 2',
    start: todayAt('11', '00'),
    end: todayAt('11', '30'),
    status: 'confirmed',
  },
  {
    id: 'b-today-003',
    code: 'BKG-TODAY-003',
    patientId: 'P-1003',
    serviceId: 'massage-60',
    serviceName: 'Massage',
    serviceDurationMinutes: 60,
    resource: 'Room 3',
    start: todayAt('14', '00'),
    end: todayAt('15', '00'),
    status: 'confirmed',
    notes: 'Follow-up massage appointment.',
  },
  {
    id: 'b-today-live-004',
    code: 'BKG-TODAY-LIVE-004',
    patientId: 'P-1005',
    serviceId: 'acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 1',
    start: minuteOffsetToday(-5),
    end: minuteOffsetToday(40),
    status: 'confirmed',
    notes: 'Test booking that should be ready to start or in progress right away.',
  },
  {
    id: 'b-upcoming-101',
    code: 'BKG-UP-101',
    patientId: 'P-1004',
    serviceId: 'acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 1',
    start: dayOffsetAt(1, '09', '30'),
    end: dayOffsetAt(1, '10', '15'),
    status: 'confirmed',
  },
  {
    id: 'b-upcoming-102',
    code: 'BKG-UP-102',
    patientId: 'P-1005',
    serviceId: 'acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    start: dayOffsetAt(2, '16', '00'),
    end: dayOffsetAt(2, '17', '00'),
    status: 'confirmed',
    notes: 'Follow-up session.',
  },
  {
    id: 'b-upcoming-103',
    code: 'BKG-UP-103',
    patientId: 'P-1001',
    serviceId: 'acu-30',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 30,
    resource: 'Room 1',
    start: dayOffsetAt(5, '10', '00'),
    end: dayOffsetAt(5, '10', '30'),
    status: 'confirmed',
  },
  {
    id: 'b-past-201',
    code: 'BKG-PAST-201',
    patientId: 'P-1002',
    serviceId: 'acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    start: dayOffsetAt(-1, '09', '00'),
    end: dayOffsetAt(-1, '10', '00'),
    status: 'completed',
    notes: 'Completed yesterday.',
  },
  {
    id: 'b-past-202',
    code: 'BKG-PAST-202',
    patientId: 'P-1003',
    serviceId: 'massage-60',
    serviceName: 'Massage',
    serviceDurationMinutes: 60,
    resource: 'Room 3',
    start: dayOffsetAt(-3, '12', '00'),
    end: dayOffsetAt(-3, '13', '00'),
    status: 'cancelled',
    notes: 'Cancelled by patient.',
  },
  {
    id: 'b-past-203',
    code: 'BKG-PAST-203',
    patientId: 'P-1004',
    serviceId: 'acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 1',
    start: dayOffsetAt(-7, '15', '00'),
    end: dayOffsetAt(-7, '15', '45'),
    status: 'no-show',
  },
]
