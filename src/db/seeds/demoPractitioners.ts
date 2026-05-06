import type { practitioners } from '@/db/schema'

import { demoPractitionerIds } from './ids'

export const demoPractitioners = [
  {
    id: demoPractitionerIds['prac-tom-cook'],
    displayName: 'Tom Cook',
    email: 'tom.cook@qicu-demo.test',
    initials: 'TC',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: demoPractitionerIds['prac-keita-smith'],
    displayName: 'Keita Smith',
    email: 'keita.smith@qicu-demo.test',
    initials: 'KS',
    icon: 'sparkles',
  },
] satisfies Array<typeof practitioners.$inferInsert>

