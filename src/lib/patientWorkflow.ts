import type { FhirPatient } from '@/models/patient'
import { isTrashed } from '@/lib/lifecycleState'

export function canUsePatientInActiveWorkflow(patient: FhirPatient | null | undefined) {
  return Boolean(patient) && patient?.active !== false && !isTrashed(patient)
}
