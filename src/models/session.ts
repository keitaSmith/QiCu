// src/models/session.ts

export type SessionId = string

/** Very lightweight optional vitals, if the practitioner ever records them */
export type BasicVitals = {
  systolicBpMmHg?: number
  diastolicBpMmHg?: number
  heartRateBpm?: number
  temperatureC?: number
}

/** TCM-specific findings from tongue & pulse etc. */
export type TcmFindings = {
  tongueColor?: string       // e.g. "pale", "red", "purple"
  tongueCoating?: string     // e.g. "thin white", "thick yellow"
  tongueShape?: string       // e.g. "swollen", "thin", "cracked"
  pulseQuality?: string      // e.g. "wiry", "slippery", "deep", "weak"
}

/**
 * QiCu acupuncture treatment session (domain model).
 * NOTE:
 * - Always belongs to a patient (patientId required)
 * - Has a single clinical time: startDateTime (when treatment happened)
 */
export type Session = {
  id: SessionId
  patientId: string           // FHIR Patient.id

  startDateTime: string       // ISO datetime of the treatment (not when note written)

  chiefComplaint: string      // "neck pain", "stress", etc.
  painScore?: number          // 0–10

  tcmDiagnosis?: string       // e.g. "Liver Qi stagnation"
  tcmFindings?: TcmFindings

  pointsUsed?: string[]       // e.g. ["LI4", "LV3", "GB20"]
  techniques?: string[]       // e.g. ["needling", "cupping", "moxa"]

  treatmentNotes?: string     // free-text SOAP-style note
  basicVitals?: BasicVitals   // completely optional
}

/**
 * Payload for creating a new session via API/UI.
 * - id is server-generated
 * - patientId comes from URL/context
 */
export type NewSessionInput = Omit<Session, 'id' | 'patientId'>
