export type SessionId = string

export type BasicVitals = {
  systolicBpMmHg?: number
  diastolicBpMmHg?: number
  heartRateBpm?: number
  temperatureC?: number
}

export type TcmFindings = {
  tongueColor?: string
  tongueCoating?: string
  tongueShape?: string
  pulseQuality?: string
}

export type Session = {
  id: SessionId
  patientId: string
  startDateTime: string
  serviceId?: string
  serviceName?: string
  chiefComplaint: string
  treatmentSummary?: string
  outcome?: string
  treatmentNotes?: string
  painScore?: number
  tcmDiagnosis?: string
  tcmFindings?: TcmFindings
  pointsUsed?: string[]
  techniques?: string[]
  basicVitals?: BasicVitals
  bookingId?: string | null
}

export type NewSessionInput = Omit<Session, 'id' | 'patientId'>
