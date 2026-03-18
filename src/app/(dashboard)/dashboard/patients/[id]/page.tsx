'use client'

import { useRouter, useParams } from 'next/navigation'
import { PatientDetailPanel } from '@/components/patients/PatientDetailPanel'
import { usePatients } from '@/hooks/usePatients'
import { useBookings } from '@/hooks/useBookings'

export default function PatientDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { patients } = usePatients()
  const { bookings } = useBookings()
  const patient = patients.find(item => item.id === params.id)

  if (!patient) {
    return <div className="p-4">Patient not found.</div>
  }

  const bookingsForPatient = bookings.filter(booking => booking.patientId === patient.id)

  return (
    <div className="space-y-4 p-4">
      <button onClick={() => router.back()} className="text-sm text-brand-700 underline">
        ← Back to patients
      </button>

      <PatientDetailPanel patient={patient} bookingsForPatient={bookingsForPatient} />
    </div>
  )
}
