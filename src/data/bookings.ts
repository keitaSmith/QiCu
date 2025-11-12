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

export const BOOKINGS: Booking[] = [
  // ===== TODAY (6) =====
  {
    id: 'b1e6e8a2-9d8b-4a72-9a10-001',
    code: 'BKG-2025-10-101',
    patientId: 'P-1001',
    service: 'Acupuncture 60m',
    resource: 'Room 1',
    start: todayAt('09', '00'),
    end:   todayAt('10', '00'),
    status: 'confirmed',
    notes: 'Allergic to lavender oils',
  },
  {
    id: 'f27b9b9b-1a2c-4c3d-9f22-002',
    code: 'BKG-2025-10-102',
    patientId: 'P-1004',
    service: 'Massage 30m',
    resource: 'Therapist Ana',
    start: todayAt('10', '15'),
    end:   todayAt('10', '45'),
    status: 'pending',
  },
  {
    id: 'c0a3f8d1-7e5a-4d2f-8c33-003',
    code: 'BKG-2025-10-103',
    patientId: 'P-1002',
    service: 'Cupping 60m',
    resource: 'Room 2',
    start: todayAt('11', '00'),
    end:   todayAt('12', '00'),
    status: 'cancelled',
    notes: 'Client called to cancel (flu).',
  },
  {
    id: 'a9b87c65-1234-4f6a-9b44-004',
    code: 'BKG-2025-10-104',
    patientId: 'P-1005',
    service: 'Consultation 30m',
    resource: 'Dr. Lee',
    start: todayAt('13', '00'),
    end:   todayAt('13', '30'),
    status: 'confirmed',
  },
  {
    id: 'd4e5f6a7-89ab-4cde-8f55-005',
    code: 'BKG-2025-10-105',
    patientId: 'P-1006',
    service: 'Massage 60m',
    resource: 'Therapist Max',
    start: todayAt('14', '00'),
    end:   todayAt('15', '00'),
    status: 'pending',
  },
  {
    id: '0f1e2d3c-4b5a-6978-9a66-006',
    code: 'BKG-2025-10-106',
    patientId: 'P-1003',
    service: 'Acupuncture 60m',
    resource: 'Room 1',
    start: todayAt('16', '30'),
    end:   todayAt('17', '30'),
    status: 'confirmed',
  },

  // ===== UPCOMING (6) =====
  {
    id: '11111111-2222-3333-4444-007',
    code: 'BKG-2025-10-107',
    patientId: 'P-1007',
    service: 'Acupuncture 60m',
    resource: 'Room 3',
    start: '2025-10-13T09:00:00',
    end:   '2025-10-13T10:00:00',
    status: 'confirmed',
  },
  {
    id: '22222222-3333-4444-5555-008',
    code: 'BKG-2025-10-108',
    patientId: 'P-1002',
    service: 'Cupping 30m',
    resource: 'Room 2',
    start: '2025-10-13T10:30:00',
    end:   '2025-10-13T11:00:00',
    status: 'pending',
  },
  {
    id: '33333333-4444-5555-6666-009',
    code: 'BKG-2025-10-109',
    patientId: 'P-1004',
    service: 'Massage 60m',
    resource: 'Therapist Ana',
    start: '2025-10-14T15:00:00',
    end:   '2025-10-14T16:00:00',
    status: 'confirmed',
  },
  {
    id: '44444444-5555-6666-7777-010',
    code: 'BKG-2025-10-110',
    patientId: 'P-1005',
    service: 'Consultation 30m',
    resource: 'Dr. Lee',
    start: '2025-10-18T11:00:00',
    end:   '2025-10-18T11:30:00',
    status: 'pending',
  },
  {
    id: '55555555-6666-7777-8888-011',
    code: 'BKG-2025-10-111',
    patientId: 'P-1006',
    service: 'Massage 30m',
    resource: 'Therapist Max',
    start: '2025-10-20T11:00:00',
    end:   '2025-10-20T11:30:00',
    status: 'cancelled',
  },
  {
    id: '66666666-7777-8888-9999-012',
    code: 'BKG-2025-11-001',
    patientId: 'P-1001',
    service: 'Acupuncture 60m',
    resource: 'Room 1',
    start: '2025-11-02T09:30:00',
    end:   '2025-11-02T10:30:00',
    status: 'confirmed',
  },

  // ===== PAST (3) =====
  {
    id: '77777777-8888-9999-0000-013',
    code: 'BKG-2025-10-090',
    patientId: 'P-1003',
    service: 'Acupuncture 60m',
    resource: 'Room 1',
    start: '2025-10-10T09:00:00',
    end:   '2025-10-10T10:00:00',
    status: 'fulfilled',
    notes: 'Reported good sleep improvement.',
  },
  {
    id: '88888888-9999-0000-aaaa-014',
    code: 'BKG-2025-10-085',
    patientId: 'P-1007',
    service: 'Consultation 30m',
    resource: 'Dr. Lee',
    start: '2025-10-05T11:00:00',
    end:   '2025-10-05T11:30:00',
    status: 'no-show',
  },
  {
    id: '99999999-0000-aaaa-bbbb-015',
    code: 'BKG-2025-09-120',
    patientId: 'P-1002',
    service: 'Cupping 30m',
    resource: 'Room 2',
    start: '2025-09-30T14:00:00',
    end:   '2025-09-30T14:30:00',
    status: 'cancelled',
  },
]
