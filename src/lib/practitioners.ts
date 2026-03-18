import type { FhirPatient } from '@/models/patient'
import type { Booking } from '@/models/booking'
import type { Session } from '@/models/session'
import type { Service } from '@/models/service'

export const CURRENT_PRACTITIONER_HEADER = 'x-qicu-practitioner-id'
export const PATIENT_PRACTITIONER_EXTENSION_URL = 'https://qicu.app/fhir/StructureDefinition/practitioner-id'

export type Practitioner = {
  id: string
  name: string
  email: string
  initials: string
  avatarUrl?: string
  icon?: 'user-circle' | 'sparkles'
}

export const DEMO_PRACTITIONERS: Practitioner[] = [
  {
    id: 'prac-tom-cook',
    name: 'Tom Cook',
    email: 'tom.cook@qicu-demo.test',
    initials: 'TC',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 'prac-keita-smith',
    name: 'Keita Smith',
    email: 'keita.smith@qicu-demo.test',
    initials: 'KS',
    icon: 'sparkles',
  },
]

export const DEFAULT_PRACTITIONER_ID = DEMO_PRACTITIONERS[0].id

export function getPractitionerIdFromRequest(req: Request): string {
  const value = req.headers.get(CURRENT_PRACTITIONER_HEADER)?.trim()
  if (!value) return DEFAULT_PRACTITIONER_ID
  return DEMO_PRACTITIONERS.some(practitioner => practitioner.id === value)
    ? value
    : DEFAULT_PRACTITIONER_ID
}

export function getPatientPractitionerId(patient: FhirPatient): string {
  const extension = patient.extension?.find(item => item.url === PATIENT_PRACTITIONER_EXTENSION_URL)
  return extension?.valueString?.trim() || DEFAULT_PRACTITIONER_ID
}

export function setPatientPractitionerId(patient: FhirPatient, practitionerId: string): FhirPatient {
  const otherExtensions = (patient.extension ?? []).filter(item => item.url !== PATIENT_PRACTITIONER_EXTENSION_URL)
  return {
    ...patient,
    extension: [
      ...otherExtensions,
      {
        url: PATIENT_PRACTITIONER_EXTENSION_URL,
        valueString: practitionerId,
      },
    ],
  }
}

export function patientBelongsToPractitioner(patient: FhirPatient, practitionerId: string): boolean {
  return getPatientPractitionerId(patient) === practitionerId
}

export function bookingBelongsToPractitioner(booking: Booking, practitionerId: string): boolean {
  return booking.practitionerId === practitionerId
}

export function sessionBelongsToPractitioner(session: Session, practitionerId: string): boolean {
  return session.practitionerId === practitionerId
}

export function serviceBelongsToPractitioner(service: Service, practitionerId: string): boolean {
  return service.practitionerId === practitionerId
}

export function withPractitionerHeaders(practitionerId: string, init?: HeadersInit): Headers {
  const headers = new Headers(init)
  headers.set(CURRENT_PRACTITIONER_HEADER, practitionerId)
  return headers
}
