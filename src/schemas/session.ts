// src/schemas/session.ts
import { z } from 'zod'

const IsoDateTime = z.string().datetime()

export const BasicVitalsSchema = z.object({
  systolicBpMmHg: z.number().int().positive().max(300).optional(),
  diastolicBpMmHg: z.number().int().positive().max(200).optional(),
  heartRateBpm: z.number().int().positive().max(300).optional(),
  temperatureC: z.number().min(25).max(45).optional(),
})

export const TcmFindingsSchema = z.object({
  tongueColor: z.string().max(100).optional(),
  tongueCoating: z.string().max(100).optional(),
  tongueShape: z.string().max(100).optional(),
  pulseQuality: z.string().max(100).optional(),
})

export const NewSessionInputSchema = z.object({
  // REQUIRED: when the treatment happened
  startDateTime: IsoDateTime,

  chiefComplaint: z.string().min(1).max(500),
  painScore: z.number().min(0).max(10).optional(),

  tcmDiagnosis: z.string().max(500).optional(),
  tcmFindings: TcmFindingsSchema.optional(),

  pointsUsed: z.array(z.string().max(20)).optional(),
  techniques: z.array(z.string().max(50)).optional(),

  treatmentNotes: z.string().max(4000).optional(),
  basicVitals: BasicVitalsSchema.optional(),
})
