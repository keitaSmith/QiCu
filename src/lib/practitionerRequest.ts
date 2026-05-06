import { CURRENT_PRACTITIONER_HEADER } from '@/lib/practitioners'
import * as practitionersRepository from '@/lib/repositories/practitionersRepository'

export async function getPractitionerIdFromRequest(req: Request): Promise<string> {
  const value = req.headers.get(CURRENT_PRACTITIONER_HEADER)?.trim()
  return practitionersRepository.normalizePractitionerId(value)
}
