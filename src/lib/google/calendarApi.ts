import type { NextRequest } from 'next/server'

import { ensureFreshGoogleAccessToken } from '@/lib/google/auth'
import type { GoogleCalendarOption } from '@/lib/google/types'

type GoogleDateTime = {
  date?: string
  dateTime?: string
  timeZone?: string
}

export type GoogleCalendarEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  updated?: string
  start?: GoogleDateTime
  end?: GoogleDateTime
  extendedProperties?: {
    private?: Record<string, string>
  }
}

async function googleApiRequest<T>(
  practitionerId: string,
  req: NextRequest,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const integration = await ensureFreshGoogleAccessToken(practitionerId, req)
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar API request failed: ${text}`)
  }

  return (await res.json()) as T
}

export async function listGoogleCalendars(practitionerId: string, req: NextRequest) {
  const data = await googleApiRequest<{ items?: Array<{
    id: string
    summary?: string
    primary?: boolean
    accessRole?: string
  }> }>(practitionerId, req, '/calendar/v3/users/me/calendarList')

  const calendars: GoogleCalendarOption[] = (data.items ?? []).map(item => ({
    id: item.id,
    summary: item.summary ?? item.id,
    primary: item.primary,
    accessRole: item.accessRole,
  }))

  return calendars.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || a.summary.localeCompare(b.summary))
}

export async function listGoogleCalendarEvents(
  practitionerId: string,
  req: NextRequest,
  calendarId: string,
  fromIso: string,
  toIso: string,
) {
  const params = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    maxResults: '250',
  })

  const data = await googleApiRequest<{ items?: GoogleCalendarEvent[] }>(
    practitionerId,
    req,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  )

  return data.items ?? []
}


export async function getGoogleCalendarEvent(
  practitionerId: string,
  req: NextRequest,
  calendarId: string,
  eventId: string,
) {
  const integration = await ensureFreshGoogleAccessToken(practitionerId, req)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  )

  if (res.status === 404 || res.status === 410) {
    return null
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar event fetch failed: ${text}`)
  }

  return (await res.json()) as GoogleCalendarEvent
}

export async function createGoogleCalendarEvent(
  practitionerId: string,
  req: NextRequest,
  calendarId: string,
  payload: unknown,
) {
  return googleApiRequest<GoogleCalendarEvent>(
    practitionerId,
    req,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export async function updateGoogleCalendarEvent(
  practitionerId: string,
  req: NextRequest,
  calendarId: string,
  eventId: string,
  payload: unknown,
) {
  return googleApiRequest<GoogleCalendarEvent>(
    practitionerId,
    req,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}

export async function deleteGoogleCalendarEvent(
  practitionerId: string,
  req: NextRequest,
  calendarId: string,
  eventId: string,
) {
  const integration = await ensureFreshGoogleAccessToken(practitionerId, req)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
      },
      cache: 'no-store',
    },
  )

  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Google Calendar delete failed: ${text}`)
  }

  return true
}
