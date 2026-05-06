import type { LifecycleFields } from '@/models/lifecycle'

export type Service = LifecycleFields & {
  id: string
  practitionerId: string
  name: string
  durationMinutes: number
  description?: string
  active: boolean
}
