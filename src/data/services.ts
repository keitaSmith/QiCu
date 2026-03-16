// /data/services.ts

/**
 * Canonical service definitions for QiCu (Phase 1–2 prototype).
 *
 * These are NOT stored inside bookings directly.
 * Bookings store:
 *   - serviceId
 *   - serviceName (snapshot)
 *   - serviceDurationMinutes (snapshot)
 *
 * This avoids needing to parse label strings and keeps booking history stable
 * even if service definitions change later.
 */

export type ServiceDef = {
  id: string
  name: string
  durationMinutes: number
}

export const SERVICES: ServiceDef[] = [
  {
    id: 'acu-60',
    name: 'Acupuncture',
    durationMinutes: 60,
  },
  {
    id: 'acu-45',
    name: 'Acupuncture',
    durationMinutes: 45,
  },
  {
    id: 'acu-30',
    name: 'Acupuncture',
    durationMinutes: 30,
  },
  {
    id: 'massage-30',
    name: 'Massage',
    durationMinutes: 30,
  },
  {
    id: 'massage-60',
    name: 'Massage',
    durationMinutes: 60,
  },
]

/**
 * Safe lookup helper for any component that needs service definitions
 * (dropdowns, booking dialog, analytics, etc).
 */
export function findServiceById(id: string | null | undefined): ServiceDef | undefined {
  if (!id) return undefined
  return SERVICES.find(s => s.id === id)
}
