import type { services } from '@/db/schema'

import { demoPractitionerIds, demoServiceIds } from './ids'

export const demoServices = [
  {
    id: demoServiceIds['tom-acu-60'],
    practitionerId: demoPractitionerIds['prac-tom-cook'],
    name: 'Acupuncture',
    durationMinutes: 60,
    description: 'Standard acupuncture treatment.',
    active: true,
  },
  {
    id: demoServiceIds['tom-acu-45'],
    practitionerId: demoPractitionerIds['prac-tom-cook'],
    name: 'Acupuncture',
    durationMinutes: 45,
    description: 'Shorter acupuncture follow-up.',
    active: true,
  },
  {
    id: demoServiceIds['tom-acu-30'],
    practitionerId: demoPractitionerIds['prac-tom-cook'],
    name: 'Acupuncture',
    durationMinutes: 30,
    description: 'Brief acupuncture review.',
    active: true,
  },
  {
    id: demoServiceIds['tom-massage-60'],
    practitionerId: demoPractitionerIds['prac-tom-cook'],
    name: 'Massage',
    durationMinutes: 60,
    description: 'Full massage treatment.',
    active: true,
  },
  {
    id: demoServiceIds['keita-acu-60'],
    practitionerId: demoPractitionerIds['prac-keita-smith'],
    name: 'Acupuncture',
    durationMinutes: 60,
    description: 'Standard acupuncture treatment.',
    active: true,
  },
  {
    id: demoServiceIds['keita-acu-45'],
    practitionerId: demoPractitionerIds['prac-keita-smith'],
    name: 'Acupuncture',
    durationMinutes: 45,
    description: 'Focused follow-up acupuncture.',
    active: true,
  },
  {
    id: demoServiceIds['keita-cupping-30'],
    practitionerId: demoPractitionerIds['prac-keita-smith'],
    name: 'Cupping',
    durationMinutes: 30,
    description: 'Short cupping treatment.',
    active: true,
  },
  {
    id: demoServiceIds['keita-moxa-45'],
    practitionerId: demoPractitionerIds['prac-keita-smith'],
    name: 'Moxa',
    durationMinutes: 45,
    description: 'Moxibustion treatment.',
    active: false,
    archivedAt: new Date('2026-05-01T00:00:00.000Z'),
  },
] satisfies Array<typeof services.$inferInsert>

