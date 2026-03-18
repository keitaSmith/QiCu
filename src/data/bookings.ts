import type { Booking } from '@/models/booking'

const TOM = 'prac-tom-cook'
const KEITA = 'prac-keita-smith'

function formatDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function atOffset(offsetDays: number, hh: string, mm: string) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${formatDate(d)}T${hh}:${mm}:00`
}

function minuteOffsetToday(offsetMinutes: number) {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + offsetMinutes)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)}T${hh}:${mm}:00`
}

export const BOOKINGS: Booking[] = [
  {
    id: 'b-tom-today-001',
    practitionerId: TOM,
    code: 'BKG-TOM-001',
    patientId: 'P-T-1001',
    serviceId: 'tom-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 1',
    start: atOffset(0, '09', '00'),
    end: atOffset(0, '10', '00'),
    status: 'confirmed',
    notes: 'Initial acupuncture consultation.',
  },
  {
    id: 'b-tom-today-002',
    practitionerId: TOM,
    code: 'BKG-TOM-002',
    patientId: 'P-T-1002',
    serviceId: 'tom-acu-30',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 30,
    resource: 'Room 2',
    start: atOffset(0, '11', '00'),
    end: atOffset(0, '11', '30'),
    status: 'confirmed',
  },
  {
    id: 'b-tom-live-003',
    practitionerId: TOM,
    code: 'BKG-TOM-LIVE-003',
    patientId: 'P-T-1004',
    serviceId: 'tom-acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 1',
    start: minuteOffsetToday(-5),
    end: minuteOffsetToday(40),
    status: 'confirmed',
    notes: 'Test booking that should be ready to start or in progress right away.',
  },
  {
    id: 'b-tom-upcoming-101',
    practitionerId: TOM,
    code: 'BKG-TOM-UP-101',
    patientId: 'P-T-1003',
    serviceId: 'tom-massage-60',
    serviceName: 'Massage',
    serviceDurationMinutes: 60,
    resource: 'Room 3',
    start: atOffset(1, '14', '00'),
    end: atOffset(1, '15', '00'),
    status: 'confirmed',
  },
  {
    id: 'b-tom-past-201',
    practitionerId: TOM,
    code: 'BKG-TOM-PAST-201',
    patientId: 'P-T-1002',
    serviceId: 'tom-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    start: atOffset(-1, '09', '00'),
    end: atOffset(-1, '10', '00'),
    status: 'completed',
    notes: 'Completed yesterday.',
  },
  {
    id: 'b-keita-today-001',
    practitionerId: KEITA,
    code: 'BKG-KEI-001',
    patientId: 'P-K-2001',
    serviceId: 'keita-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    start: atOffset(0, '10', '30'),
    end: atOffset(0, '11', '30'),
    status: 'confirmed',
    notes: 'Shoulder tension follow-up.',
  },
  {
    id: 'b-keita-today-002',
    practitionerId: KEITA,
    code: 'BKG-KEI-002',
    patientId: 'P-K-2002',
    serviceId: 'keita-cupping-30',
    serviceName: 'Cupping',
    serviceDurationMinutes: 30,
    resource: 'Room 1',
    start: atOffset(0, '13', '00'),
    end: atOffset(0, '13', '30'),
    status: 'confirmed',
  },
  {
    id: 'b-keita-upcoming-101',
    practitionerId: KEITA,
    code: 'BKG-KEI-UP-101',
    patientId: 'P-K-2003',
    serviceId: 'keita-acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 3',
    start: atOffset(2, '16', '00'),
    end: atOffset(2, '16', '45'),
    status: 'confirmed',
  },
  {
    id: 'b-keita-past-201',
    practitionerId: KEITA,
    code: 'BKG-KEI-PAST-201',
    patientId: 'P-K-2004',
    serviceId: 'keita-acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 1',
    start: atOffset(-2, '15', '00'),
    end: atOffset(-2, '16', '00'),
    status: 'no-show',
  },
]
