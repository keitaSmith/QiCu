import type { FhirPatient } from '@/models/patient'
import { PATIENTS } from '@/data/patients'

export const patientsStore: FhirPatient[] = [...PATIENTS]
