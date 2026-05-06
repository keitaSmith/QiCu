import type { patients } from '@/db/schema'

import { demoPatientIds, demoPractitionerIds } from './ids'

const practitionerExtensionUrl = 'https://qicu.app/fhir/StructureDefinition/practitioner-id'

type DemoPatientSource = {
  currentId: keyof typeof demoPatientIds
  practitionerCurrentId: keyof typeof demoPractitionerIds
  active: boolean
  firstName: string
  lastName: string
  displayName: string
  birthDate: string
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say'
  phone?: string
  email?: string
  preferredLanguage?: string
  phoneUse?: 'home' | 'work' | 'mobile'
  emailUse?: 'home' | 'work'
}

const demoPatientSources: DemoPatientSource[] = [
  {
    currentId: 'P-T-1001',
    practitionerCurrentId: 'prac-tom-cook',
    active: true,
    firstName: 'Alice',
    lastName: 'M\u00c3\u00bcller',
    displayName: 'Alice M\u00c3\u00bcller',
    birthDate: '1988-06-12',
    phone: '+41795550111',
    email: 'alice@example.com',
    preferredLanguage: 'de-CH',
    phoneUse: 'mobile',
    emailUse: 'home',
  },
  {
    currentId: 'P-T-1002',
    practitionerCurrentId: 'prac-tom-cook',
    active: true,
    firstName: 'Marc',
    lastName: 'Steiner',
    displayName: 'Marc Steiner',
    birthDate: '1990-03-04',
    phone: '+41795550222',
    email: 'marc.steiner@example.com',
    preferredLanguage: 'de-CH',
    phoneUse: 'mobile',
    emailUse: 'work',
  },
  {
    currentId: 'P-T-1003',
    practitionerCurrentId: 'prac-tom-cook',
    active: true,
    firstName: 'Sofia',
    lastName: 'Keller',
    displayName: 'Sofia Keller',
    birthDate: '1996-01-15',
    phone: '+41795550333',
    email: 'sofia.keller@example.com',
    preferredLanguage: 'de-CH',
    phoneUse: 'mobile',
    emailUse: 'home',
  },
  {
    currentId: 'P-T-1004',
    practitionerCurrentId: 'prac-tom-cook',
    active: true,
    firstName: 'Luca',
    lastName: 'Bernasconi',
    displayName: 'Luca Bernasconi',
    birthDate: '1979-08-09',
    phone: '+41795550444',
    email: 'luca.bernasconi@example.com',
    preferredLanguage: 'it-CH',
    phoneUse: 'mobile',
    emailUse: 'work',
  },
  {
    currentId: 'P-K-2001',
    practitionerCurrentId: 'prac-keita-smith',
    active: true,
    firstName: 'Naomi',
    lastName: 'James',
    displayName: 'Naomi James',
    birthDate: '1992-09-08',
    phone: '+41795550555',
    email: 'naomi.james@example.com',
    preferredLanguage: 'en',
    phoneUse: 'mobile',
    emailUse: 'home',
  },
  {
    currentId: 'P-K-2002',
    practitionerCurrentId: 'prac-keita-smith',
    active: true,
    firstName: 'Renee',
    lastName: 'Baptiste',
    displayName: 'Renee Baptiste',
    birthDate: '1984-12-17',
    phone: '+41795550666',
    email: 'renee.baptiste@example.com',
    preferredLanguage: 'en',
    phoneUse: 'mobile',
    emailUse: 'work',
  },
  {
    currentId: 'P-K-2003',
    practitionerCurrentId: 'prac-keita-smith',
    active: true,
    firstName: 'Samira',
    lastName: 'Ali',
    displayName: 'Samira Ali',
    birthDate: '1998-04-23',
    email: 'samira.ali@example.com',
    preferredLanguage: 'en',
    emailUse: 'home',
  },
  {
    currentId: 'P-K-2004',
    practitionerCurrentId: 'prac-keita-smith',
    active: true,
    firstName: 'Mika',
    lastName: 'Chen',
    displayName: 'Mika Chen',
    birthDate: '1995-07-02',
    phone: '+41795550777',
    email: 'mika.chen@example.com',
    preferredLanguage: 'en',
    phoneUse: 'mobile',
    emailUse: 'home',
  },
]

function buildFhirJson(source: DemoPatientSource): Record<string, unknown> {
  return {
    resourceType: 'Patient',
    id: source.currentId,
    meta: { versionId: '1', lastUpdated: '2026-03-18T10:00:00Z' },
    active: source.active,
    name: [
      {
        use: 'official',
        family: source.lastName,
        given: [source.firstName],
        text: source.displayName,
      },
    ],
    birthDate: source.birthDate,
    telecom: [
      source.email
        ? { system: 'email', value: source.email, use: source.emailUse ?? 'home' }
        : null,
      source.phone
        ? { system: 'phone', value: source.phone, use: source.phoneUse ?? 'mobile' }
        : null,
    ].filter(Boolean),
    communication: source.preferredLanguage
      ? [
          {
            language: { text: source.preferredLanguage },
            ...(source.preferredLanguage === 'de-CH' ||
            source.preferredLanguage === 'it-CH' ||
            source.currentId === 'P-K-2001' ||
            source.currentId === 'P-K-2003'
              ? { preferred: true }
              : {}),
          },
        ]
      : undefined,
    extension: [
      {
        url: practitionerExtensionUrl,
        valueString: source.practitionerCurrentId,
      },
    ],
  }
}

function buildSearchText(source: DemoPatientSource) {
  return [source.displayName, source.firstName, source.lastName, source.email, source.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export const demoPatients = demoPatientSources.map(source => ({
  id: demoPatientIds[source.currentId],
  practitionerId: demoPractitionerIds[source.practitionerCurrentId],
  active: source.active,
  firstName: source.firstName,
  lastName: source.lastName,
  displayName: source.displayName,
  birthDate: source.birthDate,
  gender: source.gender,
  phone: source.phone,
  email: source.email,
  preferredLanguage: source.preferredLanguage,
  fhirJson: buildFhirJson(source),
  searchText: buildSearchText(source),
})) satisfies Array<typeof patients.$inferInsert>

