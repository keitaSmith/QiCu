import { getPractitionerScopeForRequest } from '@/lib/auth/requestScope'

export async function getPractitionerIdFromRequest(req: Request): Promise<string> {
  return (await getPractitionerScopeForRequest(req)).practitionerId
}

export { authScopeErrorResponse, getPractitionerScopeForRequest } from '@/lib/auth/requestScope'
