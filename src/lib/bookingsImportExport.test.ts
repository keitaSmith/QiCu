import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBookingImportPreview,
  buildServiceImportLookupKey,
  normalizeImportedDate,
  normalizeServiceLookupKey,
} from './bookingsImportExport'

const patients = [
  {
    id: 'patient-1',
    name: 'Jane Doe',
    status: 'active' as const,
  },
]

const services = [
  {
    id: 'service-1',
    practitionerId: 'practitioner-1',
    name: 'Follow-up Acupuncture',
    durationMinutes: 45,
    active: true,
  },
]

test('normalizes supported imported date formats', () => {
  assert.equal(normalizeImportedDate('24.03.2026'), '2026-03-24')
  assert.equal(normalizeImportedDate('2026-03-24'), '2026-03-24')
  assert.equal(normalizeImportedDate('24/03/2026'), '2026-03-24')
  assert.equal(normalizeImportedDate('2026-03-24T09:00:00.000Z'), '2026-03-24')
  assert.equal(normalizeImportedDate('31.02.2026'), null)
})

test('imports exported-style csv rows that use DD.MM.YYYY dates', () => {
  const rows = buildBookingImportPreview(
    [
      {
        patientname: 'Jane Doe',
        servicename: 'Follow-up Acupuncture',
        date: '24.03.2026',
        starttime: '09:00',
        endtime: '09:45',
        durationminutes: '45',
        status: 'confirmed',
      },
    ],
    patients,
    services,
  )

  assert.equal(rows[0].errors.length, 0)
  assert.equal(rows[0].isValid, true)
  assert.equal(rows[0].start, new Date(2026, 2, 24, 9, 0, 0).toISOString())
  assert.equal(rows[0].end, new Date(2026, 2, 24, 9, 45, 0).toISOString())
})

test('keeps ISO date imports working', () => {
  const rows = buildBookingImportPreview(
    [
      {
        patientname: 'Jane Doe',
        servicename: 'Follow-up Acupuncture',
        date: '2026-03-24',
        starttime: '09:00',
        durationminutes: '45',
        status: 'confirmed',
      },
    ],
    patients,
    services,
  )

  assert.equal(rows[0].errors.length, 0)
  assert.equal(rows[0].isValid, true)
})

test('supports slash-separated local dates', () => {
  const rows = buildBookingImportPreview(
    [
      {
        patientname: 'Jane Doe',
        servicename: 'Follow-up Acupuncture',
        date: '24/03/2026',
        starttime: '09:00',
        endtime: '09:45',
        status: 'confirmed',
      },
    ],
    patients,
    services,
  )

  assert.equal(rows[0].errors.length, 0)
  assert.equal(rows[0].isValid, true)
})

test('rejects invalid imported date formats', () => {
  const rows = buildBookingImportPreview(
    [
      {
        patientname: 'Jane Doe',
        servicename: 'Follow-up Acupuncture',
        date: '03-24-2026',
        starttime: '09:00',
        durationminutes: '45',
        status: 'confirmed',
      },
    ],
    patients,
    services,
  )

  assert.equal(rows[0].isValid, false)
  assert.ok(rows[0].errors.includes('Missing or invalid start date/time'))
})

test('reports missing required csv fields', () => {
  const rows = buildBookingImportPreview(
    [
      {
        date: '24.03.2026',
        starttime: '09:00',
        status: 'confirmed',
      },
    ],
    patients,
    services,
  )

  assert.equal(rows[0].isValid, false)
  assert.ok(rows[0].errors.includes('Missing patient name'))
  assert.ok(rows[0].errors.includes('Missing service name'))
  assert.ok(rows[0].errors.includes('Missing or invalid end time / duration'))
})

test('rejects csv rows with inconsistent duration and end time', () => {
  const rows = buildBookingImportPreview(
    [
      {
        patientname: 'Jane Doe',
        servicename: 'Follow-up Acupuncture',
        date: '24.03.2026',
        starttime: '09:00',
        endtime: '09:45',
        durationminutes: '30',
        status: 'confirmed',
      },
    ],
    patients,
    services,
  )

  assert.equal(rows[0].isValid, false)
  assert.ok(rows[0].errors.includes('End time does not match the provided duration'))
})

test('normalizes imported service names by stripping duration suffixes', () => {
  assert.equal(normalizeServiceLookupKey('Acupuncture 60m'), 'acupuncture')
  assert.equal(normalizeServiceLookupKey('Acupuncture 45 min'), 'acupuncture')
  assert.equal(normalizeServiceLookupKey('Acupuncture'), 'acupuncture')
})

test('matches services using normalized name plus duration', () => {
  const rows = buildBookingImportPreview(
    [
      {
        patientname: 'Jane Doe',
        servicename: 'Acupuncture 60m',
        date: '24.03.2026',
        starttime: '09:00',
        durationminutes: '60',
        status: 'confirmed',
      },
      {
        patientname: 'Jane Doe',
        servicename: 'Acupuncture 45m',
        date: '24.03.2026',
        starttime: '11:00',
        durationminutes: '45',
        status: 'confirmed',
      },
    ],
    patients,
    [
      {
        id: 'service-60',
        practitionerId: 'practitioner-1',
        name: 'Acupuncture',
        durationMinutes: 60,
        active: true,
      },
      {
        id: 'service-90',
        practitionerId: 'practitioner-1',
        name: 'Acupuncture',
        durationMinutes: 90,
        active: true,
      },
    ],
  )

  assert.equal(rows[0].matchedServiceId, 'service-60')
  assert.equal(rows[0].willCreateService, false)
  assert.equal(rows[1].matchedServiceId, undefined)
  assert.equal(rows[1].willCreateService, true)
})

test('builds service import lookup keys with duration', () => {
  assert.equal(
    buildServiceImportLookupKey('Acupuncture 60m', 60),
    buildServiceImportLookupKey('Acupuncture', 60),
  )
  assert.notEqual(
    buildServiceImportLookupKey('Acupuncture 45m', 45),
    buildServiceImportLookupKey('Acupuncture', 60),
  )
})
