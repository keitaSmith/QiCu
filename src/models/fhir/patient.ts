// models/fhir/patient.ts
import type { Attachment, CodeableConcept, Identifier, Meta, Period, Reference } from './common'

export type HumanName = {
  use?: 'usual'|'official'|'temp'|'nickname'|'anonymous'|'old'|'maiden'
  text?: string
  family?: string
  given?: string[]
  prefix?: string[]
  suffix?: string[]
  period?: Period
}

export type ContactPoint = {
  system: 'phone'|'fax'|'email'|'pager'|'url'|'sms'|'other'
  value: string
  use?: 'home'|'work'|'temp'|'old'|'mobile'
  rank?: number
  period?: Period
}

export type Address = {
  use?: 'home'|'work'|'temp'|'old'|'billing'
  type?: 'postal'|'physical'|'both'
  text?: string
  line?: string[]
  city?: string
  district?: string
  state?: string
  postalCode?: string
  country?: string
  period?: Period
}

export type PatientContact = {
  relationship?: CodeableConcept[]
  name?: HumanName
  telecom?: ContactPoint[]
  address?: Address
  gender?: 'male'|'female'|'other'|'unknown'
  organization?: Reference
  period?: Period
}

export type PatientCommunication = {
  language: CodeableConcept
  preferred?: boolean
}

export type PatientLink = {
  other: Reference
  type: 'replaced-by'|'replaces'|'refer'|'seealso'
}

/** FHIR R4/R4B Patient (comprehensive but still practical) */
export type FhirPatient = {
  resourceType: 'Patient'
  id: string
  meta?: Meta
  implicitRules?: string
  language?: string

  identifier?: Identifier[]
  active?: boolean

  name: HumanName[]                       // at least one name entry
  telecom?: ContactPoint[]

  gender?: 'male'|'female'|'other'|'unknown'
  birthDate?: string                      // YYYY-MM-DD (date-only)
  deceasedBoolean?: boolean
  deceasedDateTime?: string

  address?: Address[]
  maritalStatus?: CodeableConcept
  multipleBirthBoolean?: boolean
  multipleBirthInteger?: number
  photo?: Attachment[]

  contact?: PatientContact[]
  communication?: PatientCommunication[]

  generalPractitioner?: Reference[]
  managingOrganization?: Reference

  link?: PatientLink[]

  /** App-specific extensions (keep them as proper FHIR extensions) */
  extension?: Array<{
    url: string
    valueString?: string
    valueBoolean?: boolean
    valueDate?: string
    valueDateTime?: string
    valueCode?: string
  }>
}
