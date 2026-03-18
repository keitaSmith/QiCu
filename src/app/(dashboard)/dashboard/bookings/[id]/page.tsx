'use client'

import { useRouter, useParams } from 'next/navigation'
import { BookingDetailPanel } from '@/components/bookings/BookingDetailPanel'
import { displayName } from '@/models/patient'
import { usePatients } from '@/hooks/usePatients'
import { useBookings } from '@/hooks/useBookings'

export default function BookingDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { bookings } = useBookings()
  const { patients } = usePatients()
  const booking = bookings.find(item => item.id === id)

  if (!booking) return <div className="p-4">Booking not found.</div>

  const patient = patients.find(item => item.id === booking.patientId)
  const patientName = patient ? displayName(patient) : booking.patientId

  return (
    <div className="space-y-4 p-4">
      <button onClick={() => router.back()} className="text-sm text-brand-700 underline">
        ← Back to bookings
      </button>

      <BookingDetailPanel booking={booking} patientName={patientName} />
    </div>
  )
}
