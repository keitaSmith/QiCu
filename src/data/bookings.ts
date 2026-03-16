// /data/bookings.ts
import type { Booking } from '@/models/booking'

// Local “today at hh:mm” (avoids UTC date shift from toISOString)
function todayAt(hh: string, mm: string) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}:00`
}

// Local day offset from today
function dayOffsetAt(offsetDays: number, hh: string, mm: string) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}:00`
}

export const BOOKINGS: Booking[] = [
  // ===== TODAY (examples) =====
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
    status: 'pending',
  },

  // ===== UPCOMING (future days) =====
  {
    id: 'b-upcoming-101',
    code: 'BKG-UP-101',
    patientId: 'P-1003',
    serviceId: 'massage-60',
    serviceName: 'Massage',
    serviceDurationMinutes: 60,
    resource: 'Room 3',
    start: dayOffsetAt(1, '14', '00'), // tomorrow
    end: dayOffsetAt(1, '15', '00'),
    status: 'confirmed',
  },
  {
    id: 'b-upcoming-102',
    code: 'BKG-UP-102',
    patientId: 'P-1004',
    serviceId: 'acu-45',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    resource: 'Room 1',
    start: dayOffsetAt(2, '09', '30'), // in 2 days
    end: dayOffsetAt(2, '10', '15'),
    status: 'pending',
  },
  {
    id: 'b-upcoming-103',
    code: 'BKG-UP-103',
    patientId: 'P-1005',
    serviceId: 'acu-60',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 60,
    resource: 'Room 2',
    start: dayOffsetAt(5, '16', '00'), // in 5 days
    end: dayOffsetAt(5, '17', '00'),
    status: 'confirmed',
    notes: 'Follow-up session.',
  },
]
