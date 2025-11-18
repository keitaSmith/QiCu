'use client'

import { useRouter, useParams } from 'next/navigation'
import { PatientDetailPanel } from '@/components/patients/PatientDetailPanel'
import { PATIENTS } from '@/data/patients'
import { BOOKINGS } from '@/data/bookings'

export default function PatientDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const patient = PATIENTS.find(p => p.id === params.id)

  if (!patient) {
    return <div className="p-4">Patient not found.</div>
  }

  const bookingsForPatient = BOOKINGS.filter(b => b.patientId === patient.id)

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={() => router.back()}
        className="text-sm text-brand-700 underline"
      >
        ← Back to patients
      </button>

      <PatientDetailPanel
        patient={patient}
        bookingsForPatient={bookingsForPatient}
      />
    </div>
  )
}
