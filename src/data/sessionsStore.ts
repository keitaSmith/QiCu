import type { Session } from '@/models/session'

export const sessionsStore: Session[] = [
  {
    id: 'S-T-1001',
    practitionerId: 'prac-tom-cook',
    patientId: 'P-T-1002',
    bookingId: 'b-tom-past-201',
    startDateTime: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
    serviceId: 'tom-acu-60',
    serviceName: 'Acupuncture',
    chiefComplaint: 'Lower back pain',
    treatmentSummary: 'Needling lower back and shoulders.',
    outcome: 'Pain reduced after treatment.',
    treatmentNotes: 'Responded well and booked a follow-up.',
    techniques: ['Acupuncture'],
  },
  {
    id: 'S-K-2001',
    practitionerId: 'prac-keita-smith',
    patientId: 'P-K-2001',
    startDateTime: new Date(new Date().setDate(new Date().getDate() - 3)).toISOString(),
    serviceId: 'keita-acu-45',
    serviceName: 'Acupuncture',
    chiefComplaint: 'Shoulder stiffness',
    treatmentSummary: 'Focused acupuncture around neck and shoulder.',
    outcome: 'Mobility improved slightly.',
    treatmentNotes: 'Suggested another session next week.',
    techniques: ['Acupuncture'],
  },
]
