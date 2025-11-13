// schemas/fhir/patient.ts
import { z } from 'zod'

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const fhirId = z.string().min(1)
const reference = z.object({ reference: z.string(), type: z.string().optional(), display: z.string().optional() })

const Period = z.object({ start: z.string().datetime().optional(), end: z.string().datetime().optional() })

const Coding = z.object({
  system: z.string().url().optional(),
  version: z.string().optional(),
  code: z.string().optional(),
  display: z.string().optional(),
  userSelected: z.boolean().optional(),
})

const CodeableConcept = z.object({
  coding: z.array(Coding).optional(),
  text: z.string().optional(),
})

const Identifier = z.object({
  use: z.enum(['usual','official','temp','secondary','old']).optional(),
  type: CodeableConcept.optional(),
  system: z.string().url().optional(),
  value: z.string(),
  period: Period.optional(),
  assigner: reference.optional(),
})

const HumanName = z.object({
  use: z.enum(['usual','official','temp','nickname','anonymous','old','maiden']).optional(),
  text: z.string().optional(),
  family: z.string().optional(),
  given: z.array(z.string()).optional(),
  prefix: z.array(z.string()).optional(),
  suffix: z.array(z.string()).optional(),
  period: Period.optional(),
})

const ContactPoint = z.object({
  system: z.enum(['phone','fax','email','pager','url','sms','other']),
  value: z.string(),
  use: z.enum(['home','work','temp','old','mobile']).optional(),
  rank: z.number().int().positive().optional(),
  period: Period.optional(),
})

const Address = z.object({
  use: z.enum(['home','work','temp','old','billing']).optional(),
  type: z.enum(['postal','physical','both']).optional(),
  text: z.string().optional(),
  line: z.array(z.string()).optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  period: Period.optional(),
})

const PatientContact = z.object({
  relationship: z.array(CodeableConcept).optional(),
  name: HumanName.optional(),
  telecom: z.array(ContactPoint).optional(),
  address: Address.optional(),
  gender: z.enum(['male','female','other','prefer_not_to_say']).optional(),
  organization: reference.optional(),
  period: Period.optional(),
})

const PatientCommunication = z.object({
  language: CodeableConcept,
  preferred: z.boolean().optional(),
})

const PatientLink = z.object({
  other: reference,
  type: z.enum(['replaced-by','replaces','refer','seealso']),
})

export const FhirPatientSchema = z.object({
  resourceType: z.literal('Patient'),
  id: fhirId,
  meta: z.object({
    versionId: z.string().optional(),
    lastUpdated: z.string().datetime().optional(),
    source: z.string().optional(),
    profile: z.array(z.string()).optional(),
  }).optional(),
  implicitRules: z.string().url().optional(),
  language: z.string().optional(),

  identifier: z.array(Identifier).optional(),
  active: z.boolean().optional(),

  name: z.array(HumanName).min(1),
  telecom: z.array(ContactPoint).optional(),

  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),

  birthDate: isoDateOnly.optional(),
  
  deceasedBoolean: z.boolean().optional(),
  deceasedDateTime: z.string().datetime().optional(),

  address: z.array(Address).optional(),
  maritalStatus: CodeableConcept.optional(),
  multipleBirthBoolean: z.boolean().optional(),
  multipleBirthInteger: z.number().int().optional(),
  photo: z.array(z.object({ url: z.string().url().optional() }).passthrough()).optional(),

  contact: z.array(PatientContact).optional(),
  communication: z.array(PatientCommunication).optional(),

  generalPractitioner: z.array(reference).optional(),
  managingOrganization: reference.optional(),

  link: z.array(PatientLink).optional(),

  extension: z.array(z.object({
    url: z.string().url(),
    valueString: z.string().optional(),
    valueBoolean: z.boolean().optional(),
    valueDate: isoDateOnly.optional(),
    valueDateTime: z.string().datetime().optional(),
    valueCode: z.string().optional(),
  })).optional(),
})

export type FhirPatientInput = z.infer<typeof FhirPatientSchema>
