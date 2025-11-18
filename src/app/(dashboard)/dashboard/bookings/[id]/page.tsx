'use client'

import { useRouter, useParams } from 'next/navigation'
import { BookingDetailPanel } from '@/components/bookings/BookingDetailPanel'
import { PATIENTS } from '@/data/patients'
import { BOOKINGS } from '@/data/bookings'
import { displayName } from '@/models/patient'

export default function BookingDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const booking = BOOKINGS.find(b => b.id === id)

  if (!booking) return <div className="p-4">Booking not found.</div>

  const patient = PATIENTS.find(p => p.id === booking.patientId)
  const patientName = patient ? displayName(patient) : booking.patientId

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={() => router.back()}
        className="text-sm text-brand-700 underline"
      >
        ← Back to bookings
      </button>

      <BookingDetailPanel booking={booking} patientName={patientName} />
    </div>
  )
}
