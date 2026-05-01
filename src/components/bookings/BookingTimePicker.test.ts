import assert from 'node:assert/strict'
import test from 'node:test'

import type { Booking } from '@/models/booking'
import { generateSlotsForDay } from './BookingTimePicker'

function buildBooking(overrides: Partial<Booking>): Booking {
  return {
    id: overrides.id ?? 'booking-1',
    code: overrides.code ?? 'BKG-001',
    practitionerId: overrides.practitionerId ?? 'prac-a',
    patientId: overrides.patientId ?? 'patient-1',
    serviceId: overrides.serviceId ?? 'service-1',
    serviceName: overrides.serviceName ?? 'Acupuncture',
    serviceDurationMinutes: overrides.serviceDurationMinutes ?? 60,
    start: overrides.start ?? '2026-05-10T09:00:00',
    end: overrides.end ?? '2026-05-10T10:00:00',
    status: overrides.status ?? 'confirmed',
    resource: overrides.resource,
    notes: overrides.notes,
  }
}

function slotTimes(slots: Date[]) {
  return slots.map(slot => `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`)
}

test('excludes all overlapping slots for an occupied hour', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)
  const bookings = [
    buildBooking({
      start: '2026-05-10T09:00:00',
      end: '2026-05-10T10:00:00',
    }),
  ]

  const slots = generateSlotsForDay(date, bookings, 60, now)
  const times = slotTimes(slots)

  assert.equal(times.includes('09:00'), false)
  assert.equal(times.includes('09:15'), false)
  assert.equal(times.includes('09:30'), false)
  assert.equal(times.includes('09:45'), false)
  assert.equal(times.includes('10:00'), true)
})

test('allows same-time slots when only another practitioner is booked after practitioner filtering', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)
  const allBookings = [
    buildBooking({
      id: 'booking-prac-a',
      practitionerId: 'prac-a',
      start: '2026-05-10T11:00:00',
      end: '2026-05-10T12:00:00',
    }),
    buildBooking({
      id: 'booking-prac-b',
      practitionerId: 'prac-b',
      start: '2026-05-10T09:00:00',
      end: '2026-05-10T10:00:00',
    }),
  ]

  const practitionerBookings = allBookings.filter(
    booking => booking.practitionerId === 'prac-a',
  )

  const slots = generateSlotsForDay(date, practitionerBookings, 60, now)
  const times = slotTimes(slots)

  assert.equal(times.includes('09:00'), true)
  assert.equal(times.includes('11:00'), false)
})

test('excludes past time slots on the current day', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 9, 20)

  const slots = generateSlotsForDay(date, [], 30, now)
  const times = slotTimes(slots)

  assert.equal(times.includes('09:00'), false)
  assert.equal(times.includes('09:15'), false)
  assert.equal(times.includes('09:30'), true)
})
