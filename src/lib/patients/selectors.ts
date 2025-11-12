// /lib/patients/selectors.ts
import type { FhirPatient } from '@/models/patient'
import type { Booking } from '@/models/booking'

export function displayName(p: FhirPatient) {
  const n = p.name?.[0]
  return n?.text ?? [n?.given?.[0], n?.family].filter(Boolean).join(' ') ?? 'Unknown'
}

export function primaryEmail(p: FhirPatient) {
  return p.telecom?.find(t => t.system === 'email')?.value ?? ''
}

export function primaryMobile(p: FhirPatient) {
  const t = p.telecom?.find(t => t.system === 'phone' && (t.use === 'mobile' || !t.use))
  return t?.value ?? ''
}

export function nameMap(patients: FhirPatient[]) {
  return new Map(patients.map(p => [p.id, displayName(p)]))
}

export function lastVisitMap(bookings: Booking[]) {
  const now = Date.now()
  const map = new Map<string, Date>()
  for (const b of bookings) {
    if (b.status === 'cancelled' || b.status === 'no-show') continue
    const start = new Date(b.start).getTime()
    if (start < now) {
      const prev = map.get(b.patientId)?.getTime() ?? -Infinity
      if (start > prev) map.set(b.patientId, new Date(start))
    }
  }
  return map
}
