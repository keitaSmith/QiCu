import { withPractitionerHeaders } from '@/lib/practitioners'

export type ClientPractitionerScope = {
  practitionerId: string
  source: 'session' | 'demo'
}

export function buildPractitionerScopedFetchInit(
  scope: ClientPractitionerScope,
  init: RequestInit = {},
): RequestInit {
  const headers =
    scope.source === 'session'
      ? new Headers(init.headers)
      : withPractitionerHeaders(scope.practitionerId, init.headers)

  return {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  }
}
