import type { FhirPatient } from "@/models/fhir/patient";
import * as Patient from "@/models/patient";

export type PatientCoreView = {
  id: string;
  name: string;
  birthDate?: string;
  email?: string;
  mobile?: string;
  status: "active" | "inactive";
};

export function toCoreView(p: FhirPatient): PatientCoreView {
  return {
    id: p.id!, // assume validated upstream
    name: Patient.displayName(p),
    birthDate: p.birthDate,
    email: Patient.primaryEmail(p) || undefined,
    mobile: Patient.primaryMobile(p) || undefined,
    status: Patient.status(p),
  };
}
