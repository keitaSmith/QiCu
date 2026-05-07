import type { sessions } from '@/db/schema'

import {
  demoBookingIds,
  demoPatientIds,
  demoPractitionerIds,
  demoServiceIds,
  demoSessionIds,
} from './ids'

type DemoSessionSeedOptions = {
  floatingDates?: boolean
}

const fixedBaseDate = '2026-05-06'

function relativeTimestamp(dayOffset: number, time: string, options: DemoSessionSeedOptions) {
  const base = options.floatingDates ? new Date() : new Date(`${fixedBaseDate}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + dayOffset)
  const [hours, minutes] = time.split(':').map(Number)
  base.setUTCHours(hours, minutes, 0, 0)
  return base
}

export function buildDemoSessionsSeed(options: DemoSessionSeedOptions = {}) {
  return [
    {
      id: demoSessionIds['S-T-1001'],
      publicId: 'S-T-1001',
      practitionerId: demoPractitionerIds['prac-tom-cook'],
      patientId: demoPatientIds['P-T-1002'],
      bookingId: demoBookingIds['b-tom-past-201'],
      startAt: relativeTimestamp(-1, '09:00', options),
      serviceId: demoServiceIds['tom-acu-60'],
      serviceName: 'Acupuncture',
      chiefComplaint: 'Lower back pain',
      treatmentSummary: 'Needling lower back and shoulders.',
      outcome: 'Pain reduced after treatment.',
      treatmentNotes: 'Responded well and booked a follow-up.',
      techniques: ['Acupuncture'],
    },
    {
      id: demoSessionIds['S-K-2001'],
      publicId: 'S-K-2001',
      practitionerId: demoPractitionerIds['prac-keita-smith'],
      patientId: demoPatientIds['P-K-2001'],
      bookingId: null,
      startAt: relativeTimestamp(-3, '10:00', options),
      serviceId: demoServiceIds['keita-acu-45'],
      serviceName: 'Acupuncture',
      chiefComplaint: 'Shoulder stiffness',
      treatmentSummary: 'Focused acupuncture around neck and shoulder.',
      outcome: 'Mobility improved slightly.',
      treatmentNotes: 'Suggested another session next week.',
      techniques: ['Acupuncture'],
    },
  ] satisfies Array<typeof sessions.$inferInsert>
}

export const demoSessions = buildDemoSessionsSeed()
