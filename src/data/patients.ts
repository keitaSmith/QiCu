import { FhirPatientSchema } from '@/schemas/fhir/patient'
import type { FhirPatient } from '@/models/fhir/patient'
import { setPatientPractitionerId } from '@/lib/practitioners'

const TOM = 'prac-tom-cook'
const KEITA = 'prac-keita-smith'

function withPractitioner(patient: FhirPatient, practitionerId: string): FhirPatient {
  return FhirPatientSchema.parse(setPatientPractitionerId(patient, practitionerId))
}

export const PATIENTS: FhirPatient[] = [
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-T-1001',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Müller', given: ['Alice'], text: 'Alice Müller' }],
      birthDate: '1988-06-12',
      telecom: [
        { system: 'email', value: 'alice@example.com', use: 'home' },
        { system: 'phone', value: '+41795550111', use: 'mobile' },
      ],
      communication: [{ language: { text: 'de-CH' }, preferred: true }],
    },
    TOM,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-T-1002',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Steiner', given: ['Marc'], text: 'Marc Steiner' }],
      birthDate: '1990-03-04',
      telecom: [
        { system: 'phone', value: '+41795550222', use: 'mobile' },
        { system: 'email', value: 'marc.steiner@example.com', use: 'work' },
      ],
      communication: [{ language: { text: 'de-CH' } }],
    },
    TOM,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-T-1003',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Keller', given: ['Sofia'], text: 'Sofia Keller' }],
      birthDate: '1996-01-15',
      telecom: [
        { system: 'phone', value: '+41795550333', use: 'mobile' },
        { system: 'email', value: 'sofia.keller@example.com', use: 'home' },
      ],
      communication: [{ language: { text: 'de-CH' } }],
    },
    TOM,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-T-1004',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Bernasconi', given: ['Luca'], text: 'Luca Bernasconi' }],
      birthDate: '1979-08-09',
      telecom: [
        { system: 'phone', value: '+41795550444', use: 'mobile' },
        { system: 'email', value: 'luca.bernasconi@example.com', use: 'work' },
      ],
      communication: [{ language: { text: 'it-CH' }, preferred: true }],
    },
    TOM,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-K-2001',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'James', given: ['Naomi'], text: 'Naomi James' }],
      birthDate: '1992-09-08',
      telecom: [
        { system: 'phone', value: '+41795550555', use: 'mobile' },
        { system: 'email', value: 'naomi.james@example.com', use: 'home' },
      ],
      communication: [{ language: { text: 'en' }, preferred: true }],
    },
    KEITA,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-K-2002',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Baptiste', given: ['Renee'], text: 'Renee Baptiste' }],
      birthDate: '1984-12-17',
      telecom: [
        { system: 'phone', value: '+41795550666', use: 'mobile' },
        { system: 'email', value: 'renee.baptiste@example.com', use: 'work' },
      ],
      communication: [{ language: { text: 'en' } }],
    },
    KEITA,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-K-2003',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Ali', given: ['Samira'], text: 'Samira Ali' }],
      birthDate: '1998-04-23',
      telecom: [{ system: 'email', value: 'samira.ali@example.com', use: 'home' }],
      communication: [{ language: { text: 'en' }, preferred: true }],
    },
    KEITA,
  ),
  withPractitioner(
    {
      resourceType: 'Patient',
      id: 'P-K-2004',
      meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
      active: true,
      name: [{ use: 'official', family: 'Chen', given: ['Mika'], text: 'Mika Chen' }],
      birthDate: '1995-07-02',
      telecom: [
        { system: 'phone', value: '+41795550777', use: 'mobile' },
        { system: 'email', value: 'mika.chen@example.com', use: 'home' },
      ],
      communication: [{ language: { text: 'en' } }],
    },
    KEITA,
  ),
]

PATIENTS.forEach(patient => FhirPatientSchema.parse(patient))
