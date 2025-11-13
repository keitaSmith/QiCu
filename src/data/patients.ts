// /data/patients.ts
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import type { FhirPatient } from '@/models/fhir/patient'

export const PATIENTS: FhirPatient[] = [
  {
    resourceType: 'Patient',
    id: 'P-1001',
    meta: { versionId: '1', lastUpdated: '2025-10-11T10:00:00Z' },
    active: true,
    name: [{ use: 'official', family: 'Müller', given: ['Alice'], text: 'Alice Müller' }],
    birthDate: '1988-06-12',
    telecom: [
      { system: 'email', value: 'alice@example.com', use: 'home' },
      { system: 'phone', value: '+41795550111', use: 'mobile' },
    ],
    communication: [{ language: { text: 'de-CH' }, preferred: true }],
  },
  {
    resourceType: 'Patient',
    id: 'P-1002',
    meta: { versionId: '1', lastUpdated: '2025-10-11T10:00:00Z' },
    active: true,
    name: [{ use: 'official', family: 'Steiner', given: ['Marc'], text: 'Marc Steiner' }],
    birthDate: '1990-03-04',
    telecom: [
      { system: 'phone', value: '+41795550222', use: 'mobile' },
      { system: 'email', value: 'marc.steiner@example.com', use: 'work' },
    ],
    communication: [{ language: { text: 'de-CH' } }],
  },
  {
    resourceType: 'Patient',
    id: 'P-1003',
    meta: { versionId: '1', lastUpdated: '2025-10-11T10:00:00Z' },
    active: true,
    name: [{ use: 'official', family: 'Smith', given: ['Keita'], text: 'Keita Smith' }],
    birthDate: '1985-11-22',
    telecom: [{ system: 'email', value: 'keita.smith@example.com', use: 'home' }],
    communication: [{ language: { text: 'en' }, preferred: true }],
  },
  {
    resourceType: 'Patient',
    id: 'P-1004',
    meta: { versionId: '1', lastUpdated: '2025-10-11T10:00:00Z' },
    active: true,
    name: [{ use: 'official', family: 'Keller', given: ['Sofia'], text: 'Sofia Keller' }],
    birthDate: '1996-01-15',
    telecom: [
      { system: 'phone', value: '+41795550333', use: 'mobile' },
      { system: 'email', value: 'sofia.keller@example.com', use: 'home' },
    ],
    communication: [{ language: { text: 'de-CH' } }],
  },
  {
    resourceType: 'Patient',
    id: 'P-1005',
    meta: { versionId: '1', lastUpdated: '2025-10-11T10:00:00Z' },
    active: true,
    name: [{ use: 'official', family: 'Bernasconi', given: ['Luca'], text: 'Luca Bernasconi' }],
    birthDate: '1979-08-09',
    telecom: [
      { system: 'phone', value: '+41795550444', use: 'mobile' },
      { system: 'email', value: 'luca.bernasconi@example.com', use: 'work' },
    ],
    communication: [{ language: { text: 'it-CH' }, preferred: true }],
  },
]
PATIENTS.forEach(p => FhirPatientSchema.parse(p));
