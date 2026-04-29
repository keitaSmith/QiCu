import assert from 'node:assert/strict'
import test from 'node:test'

import type { Booking } from '@/models/booking'
import {
  buildGoogleBookingImportPreview,
  classifyGoogleImportCandidate,
  detectGoogleBookingDuplicate,
  extractGoogleEventCandidates,
  parseGoogleEventSummary,
} from './eventMapping'

const bookingBase: Booking = {
  id: 'booking-1',
  code: 'B-1001',
  practitionerId: 'practitioner-1',
  patientId: 'patient-1',
  serviceId: 'service-1',
  serviceName: 'Initial Consultation',
  serviceDurationMinutes: 60,
  start: '2026-05-10T08:00:00.000Z',
  end: '2026-05-10T09:00:00.000Z',
  status: 'confirmed',
}

test('parses patient and service from delimited Google event summaries', () => {
  assert.deepEqual(parseGoogleEventSummary('Jane Doe - Initial Consultation'), {
    patientName: 'Jane Doe',
    serviceName: 'Initial Consultation',
  })

  assert.deepEqual(parseGoogleEventSummary('Jane Doe | Follow up'), {
    patientName: 'Jane Doe',
    serviceName: 'Follow up',
  })
})

test('prefers tagged description values over summary candidates', () => {
  assert.deepEqual(
    extractGoogleEventCandidates(
      'Unknown - Admin',
      'Patient: Jane Doe\nService: Initial Consultation',
    ),
    {
      patientName: 'Jane Doe',
      serviceName: 'Initial Consultation',
    },
  )
})

test('detects existing imports before probable time and service duplicates', () => {
  const existingImport = detectGoogleBookingDuplicate(
    'google-event-1',
    bookingBase.start,
    bookingBase.end,
    bookingBase.serviceName,
    [{ ...bookingBase, externalEventId: 'google-event-1' }],
  )

  assert.equal(existingImport.duplicateStatus, 'existing-import')
  assert.equal(existingImport.booking?.id, bookingBase.id)

  const possibleDuplicate = detectGoogleBookingDuplicate(
    'new-google-event',
    bookingBase.start,
    bookingBase.end,
    'initial consultation',
    [bookingBase],
  )

  assert.equal(possibleDuplicate.duplicateStatus, 'possible')
  assert.equal(possibleDuplicate.booking?.id, bookingBase.id)
})

test('classifies matched appointments, blocked time, and invalid events', () => {
  assert.deepEqual(
    classifyGoogleImportCandidate({
      summary: 'Jane Doe - Initial Consultation',
      hasPatientMatch: true,
      hasServiceMatch: true,
      duplicateStatus: 'none',
      errors: [],
    }),
    {
      importClassification: 'booking-candidate',
      importConfidence: 'high',
      reviewReasons: [],
    },
  )

  assert.deepEqual(
    classifyGoogleImportCandidate({
      summary: 'Team lunch',
      hasPatientMatch: false,
      hasServiceMatch: false,
      duplicateStatus: 'none',
      errors: [],
    }),
    {
      importClassification: 'blocked-time-candidate',
      importConfidence: 'not-suitable',
      reviewReasons: ['Looks like blocked time'],
    },
  )

  assert.deepEqual(
    classifyGoogleImportCandidate({
      summary: 'Cancelled appointment',
      hasPatientMatch: true,
      hasServiceMatch: true,
      duplicateStatus: 'none',
      errors: ['Already cancelled'],
      shouldIgnore: true,
    }),
    {
      importClassification: 'ignore',
      importConfidence: 'not-suitable',
      reviewReasons: [],
    },
  )
})

test('builds high-confidence preview rows from known patients and services', () => {
  const rows = buildGoogleBookingImportPreview(
    [
      {
        id: 'google-event-2',
        summary: 'Jane Doe - Initial Consultation',
        start: { dateTime: bookingBase.start },
        end: { dateTime: bookingBase.end },
      },
    ],
    'calendar-1',
    [{ id: 'patient-1', name: 'Jane Doe', status: 'active' }],
    [
      {
        id: 'service-1',
        practitionerId: 'practitioner-1',
        name: 'Initial Consultation',
        durationMinutes: 60,
        active: true,
      },
    ],
    [],
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0].matchedPatientId, 'patient-1')
  assert.equal(rows[0].matchedServiceId, 'service-1')
  assert.equal(rows[0].importClassification, 'booking-candidate')
  assert.equal(rows[0].importConfidence, 'high')
})
