import assert from 'node:assert/strict'
import test from 'node:test'

import type { Booking } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import {
  findNearestAvailableDate,
  generateSlotsForDay,
  hasAvailableSlotsForDate,
  isDateSelectable,
} from './BookingTimePicker'

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
    trashMetadata: overrides.trashMetadata,
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

test('allows slots occupied only by non-blocking booking statuses', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)
  const nonBlockingStatuses: Array<Booking['status']> = ['cancelled', 'no-show', 'completed']

  for (const status of nonBlockingStatuses) {
    const slots = generateSlotsForDay(
      date,
      [
        buildBooking({
          id: `booking-${status}`,
          status,
          start: '2026-05-10T09:00:00',
          end: '2026-05-10T10:00:00',
        }),
      ],
      60,
      now,
    )
    const times = slotTimes(slots)

    assert.equal(times.includes('09:00'), true)
  }
})

test('allows slots occupied only by trashed bookings', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)
  const trashMetadata: TrashMetadata = {
    deletedAt: '2026-05-01T10:00:00.000Z',
    restoreUntil: '2026-05-31T10:00:00.000Z',
    deletedByPractitionerId: 'prac-a',
    deletionGroupId: 'trash-booking-time-picker',
    deletionType: 'booking',
  }

  const slots = generateSlotsForDay(
    date,
    [
      buildBooking({
        start: '2026-05-10T09:00:00',
        end: '2026-05-10T10:00:00',
        trashMetadata,
      }),
    ],
    60,
    now,
  )
  const times = slotTimes(slots)

  assert.equal(times.includes('09:00'), true)
})

test('confirmed and pending bookings block same-time slots', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)

  for (const status of ['confirmed', 'pending'] as const) {
    const slots = generateSlotsForDay(
      date,
      [
        buildBooking({
          id: `booking-${status}`,
          status,
          start: '2026-05-10T09:00:00',
          end: '2026-05-10T10:00:00',
        }),
      ],
      60,
      now,
    )
    const times = slotTimes(slots)

    assert.equal(times.includes('09:00'), false)
  }
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

test('findNearestAvailableDate keeps today when today has available slots', () => {
  const today = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)

  const next = findNearestAvailableDate(today, [], 60, now)

  assert.equal(next?.toDateString(), today.toDateString())
})

test('findNearestAvailableDate skips today after working hours', () => {
  const today = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 21, 34)

  const next = findNearestAvailableDate(today, [], 60, now)

  assert.equal(next?.toDateString(), new Date(2026, 4, 11).toDateString())
})

test('days with no slots due to confirmed or pending bookings are not selectable', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)

  for (const status of ['confirmed', 'pending'] as const) {
    const bookings = [
      buildBooking({
        id: `booking-full-day-${status}`,
        status,
        start: '2026-05-10T09:00:00',
        end: '2026-05-10T17:00:00',
      }),
    ]

    assert.equal(hasAvailableSlotsForDate(date, bookings, 60, now), false)
    assert.equal(isDateSelectable(date, bookings, 60, now), false)
  }
})

test('disabled no-slot day is skipped for nearest future enabled day', () => {
  const today = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)
  const bookings = [
    buildBooking({
      id: 'booking-full-today',
      start: '2026-05-10T09:00:00',
      end: '2026-05-10T17:00:00',
    }),
  ]

  const next = findNearestAvailableDate(today, bookings, 60, now)

  assert.equal(next?.toDateString(), new Date(2026, 4, 11).toDateString())
})

test('cancelled, no-show, and completed bookings do not make an otherwise available day unavailable', () => {
  const date = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 8, 0)

  for (const status of ['cancelled', 'no-show', 'completed'] as const) {
    const bookings = [
      buildBooking({
        id: `booking-non-blocking-day-${status}`,
        status,
        start: '2026-05-10T09:00:00',
        end: '2026-05-10T17:00:00',
      }),
    ]

    assert.equal(hasAvailableSlotsForDate(date, bookings, 60, now), true)
    assert.equal(isDateSelectable(date, bookings, 60, now), true)
  }
})

test('findNearestAvailableDate returns only a date and does not select a time slot', () => {
  const today = new Date(2026, 4, 10, 21, 34)
  const now = new Date(2026, 4, 10, 21, 34)

  const next = findNearestAvailableDate(today, [], 60, now)

  assert.equal(next?.getHours(), 0)
  assert.equal(next?.getMinutes(), 0)
})

test('findNearestAvailableDate returns null when no day is available in the search window', () => {
  const today = new Date(2026, 4, 10)
  const now = new Date(2026, 4, 10, 21, 34)

  const next = findNearestAvailableDate(today, [], 60, now, 1)

  assert.equal(next, null)
})
