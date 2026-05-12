'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import SearchableSelectField from '@/components/ui/SearchableSelectField'

type SubmitState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type AdminPractitioner = {
  id: string
  name: string
  email?: string
  linkedToUser: boolean
}

type AdminAccessState = 'checking' | 'allowed' | 'signin-required' | 'denied'

export default function AdminUsersPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [practitionerId, setPractitionerId] = useState('')
  const [allowRelink, setAllowRelink] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [state, setState] = useState<SubmitState>({ status: 'idle' })
  const [practitioners, setPractitioners] = useState<AdminPractitioner[]>([])
  const [practitionersLoading, setPractitionersLoading] = useState(true)
  const [practitionersError, setPractitionersError] = useState('')
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>('checking')

  useEffect(() => {
    let cancelled = false

    async function loadPractitioners() {
      try {
        const response = await fetch('/api/admin/practitioners', {
          cache: 'no-store',
          credentials: 'include',
        })
        const data = await response.json().catch(() => null)

        if (response.status === 401) {
          if (!cancelled) setAdminAccess('signin-required')
          return
        }

        if (response.status === 403) {
          if (!cancelled) setAdminAccess('denied')
          return
        }

        if (!response.ok) {
          throw new Error(data?.error ?? 'Unable to load practitioners.')
        }

        if (!cancelled) {
          setPractitioners(Array.isArray(data?.practitioners) ? data.practitioners : [])
          setPractitionersError('')
          setAdminAccess('allowed')
        }
      } catch {
        if (!cancelled) {
          setPractitionersError('Practitioner list is unavailable. Enter a public practitioner ID manually.')
          setAdminAccess('allowed')
        }
      } finally {
        if (!cancelled) setPractitionersLoading(false)
      }
    }

    loadPractitioners()
    return () => {
      cancelled = true
    }
  }, [])

  const practitionerOptions = useMemo(
    () => practitioners.map(practitioner => ({
      value: practitioner.id,
      label: practitioner.name,
      description: `${practitioner.id}${practitioner.email ? ` · ${practitioner.email}` : ''}${practitioner.linkedToUser ? ' · already linked' : ''}`,
    })),
    [practitioners],
  )

  const selectedPractitioner = practitioners.find(practitioner => practitioner.id === practitionerId) ?? null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setState({ status: 'idle' })

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          password,
          practitionerId,
          allowRelink,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setState({ status: 'error', message: data?.error ?? 'Unable to provision user.' })
        return
      }

      setPassword('')
      setAllowRelink(false)
      setState({
        status: 'success',
        message: `Created or updated ${data.user.email} for ${data.practitioner.name}.`,
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (adminAccess === 'checking') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Create practitioner login</h1>
        </div>
        <div className="rounded-lg border border-brand-300/30 bg-surface p-6 text-sm text-ink/70 shadow-sm">
          Checking admin access...
        </div>
      </div>
    )
  }

  if (adminAccess === 'signin-required') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in required</h1>
          <p className="mt-2 text-sm text-ink/70">
            Please sign in with an admin account to manage practitioner logins.
          </p>
        </div>
        <div className="rounded-lg border border-brand-300/30 bg-surface p-6 shadow-sm">
          <Link
            href="/login?next=/dashboard/admin/users"
            className="inline-flex rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-surface shadow-sm hover:bg-brand-800"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (adminAccess === 'denied') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Admin access required</h1>
          <p className="mt-2 text-sm text-ink/70">
            Your account does not have permission to manage users.
          </p>
        </div>
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
          Ask an existing admin to grant access before using this page.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Create practitioner login</h1>
        <p className="mt-2 text-sm text-ink/70">
          Provision a password login for an existing practitioner. Public signup and email invite delivery are not enabled.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-brand-300/30 bg-surface p-6 shadow-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-ink">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full rounded-md border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-ink">
            <span>Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="block w-full rounded-md border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-ink">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="block w-full rounded-md border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </label>

          <div className="space-y-2 text-sm font-medium text-ink">
            {practitionersError ? (
              <label className="space-y-2">
                <span>Practitioner public ID</span>
                <input
                  type="text"
                  required
                  value={practitionerId}
                  onChange={(event) => setPractitionerId(event.target.value)}
                  placeholder="prac-keita-smith"
                  className="block w-full rounded-md border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                />
                <span className="block text-xs font-normal text-amber-700">{practitionersError}</span>
              </label>
            ) : (
              <SearchableSelectField
                label="Practitioner"
                value={practitionerId || null}
                onChange={setPractitionerId}
                options={practitionerOptions}
                placeholder={practitionersLoading ? 'Loading practitioners...' : 'Select a practitioner'}
                searchPlaceholder="Search by name, public ID, or email"
                noResultsText="No practitioners found."
                resultLabel="practitioners"
                required
                disabled={practitionersLoading}
                helperText={
                  selectedPractitioner
                    ? `Public ID: ${selectedPractitioner.id}${selectedPractitioner.linkedToUser ? ' · already linked to a user' : ''}`
                    : 'Choose the practitioner this login should control.'
                }
              />
            )}
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={allowRelink}
            onChange={(event) => setAllowRelink(event.target.checked)}
            className="mt-1 size-4 rounded border-amber-500 text-brand-700 focus:ring-brand-600"
          />
          <span>
            Allow intentional relink. Only use this to intentionally move an existing user/practitioner link after review.
          </span>
        </label>

        {state.status !== 'idle' && (
          <div
            className={
              state.status === 'success'
                ? 'rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
                : 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900'
            }
          >
            {state.message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-surface shadow-sm hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Provisioning...' : 'Create login'}
          </button>
        </div>
      </form>
    </div>
  )
}
