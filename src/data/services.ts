import type { Service } from '@/models/service'

export const INITIAL_SERVICES: Service[] = [
  {
    id: 'acu-60',
    name: 'Acupuncture',
    durationMinutes: 60,
    description: 'Standard acupuncture treatment.',
    active: true,
  },
  {
    id: 'acu-45',
    name: 'Acupuncture',
    durationMinutes: 45,
    description: 'Shorter acupuncture follow-up.',
    active: true,
  },
  {
    id: 'acu-30',
    name: 'Acupuncture',
    durationMinutes: 30,
    description: 'Brief acupuncture review.',
    active: true,
  },
  {
    id: 'massage-30',
    name: 'Massage',
    durationMinutes: 30,
    description: 'Focused massage treatment.',
    active: true,
  },
  {
    id: 'massage-60',
    name: 'Massage',
    durationMinutes: 60,
    description: 'Full massage treatment.',
    active: true,
  },
]
