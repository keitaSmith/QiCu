import type { Service } from '@/models/service'

const TOM = 'prac-tom-cook'
const KEITA = 'prac-keita-smith'

export const INITIAL_SERVICES: Service[] = [
  {
    id: 'tom-acu-60',
    practitionerId: TOM,
    name: 'Acupuncture',
    durationMinutes: 60,
    description: 'Standard acupuncture treatment.',
    active: true,
  },
  {
    id: 'tom-acu-45',
    practitionerId: TOM,
    name: 'Acupuncture',
    durationMinutes: 45,
    description: 'Shorter acupuncture follow-up.',
    active: true,
  },
  {
    id: 'tom-acu-30',
    practitionerId: TOM,
    name: 'Acupuncture',
    durationMinutes: 30,
    description: 'Brief acupuncture review.',
    active: true,
  },
  {
    id: 'tom-massage-60',
    practitionerId: TOM,
    name: 'Massage',
    durationMinutes: 60,
    description: 'Full massage treatment.',
    active: true,
  },
  {
    id: 'keita-acu-60',
    practitionerId: KEITA,
    name: 'Acupuncture',
    durationMinutes: 60,
    description: 'Standard acupuncture treatment.',
    active: true,
  },
  {
    id: 'keita-acu-45',
    practitionerId: KEITA,
    name: 'Acupuncture',
    durationMinutes: 45,
    description: 'Focused follow-up acupuncture.',
    active: true,
  },
  {
    id: 'keita-cupping-30',
    practitionerId: KEITA,
    name: 'Cupping',
    durationMinutes: 30,
    description: 'Short cupping treatment.',
    active: true,
  },
  {
    id: 'keita-moxa-45',
    practitionerId: KEITA,
    name: 'Moxa',
    durationMinutes: 45,
    description: 'Moxibustion treatment.',
    active: false,
  },
]
