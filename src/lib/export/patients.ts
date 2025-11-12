// src/lib/export/patients.ts
import { jsPDF } from 'jspdf'
import type { FhirPatient } from '@/models/patient'
import * as Patient from '@/models/patient'

export function exportPatientPdf(p: FhirPatient) {
  const doc = new jsPDF()

  const name = Patient.displayName(p)
  const dob = p.birthDate ?? ''
  const email = Patient.primaryEmail(p) || '-'
  const phone = Patient.primaryMobile(p) || '-'
  const lang = p.communication?.[0]?.language?.text ?? '-'
  const active = p.active !== false ? 'Active' : 'Inactive'

  doc.setFontSize(16)
  doc.text(`Patient Summary`, 14, 20)
  doc.setFontSize(12)
  doc.text(`ID: ${p.id ?? '-'}`, 14, 32)
  doc.text(`Name: ${name}`, 14, 40)
  doc.text(`Birth date: ${dob}`, 14, 48)
  doc.text(`Email: ${email}`, 14, 56)
  doc.text(`Mobile: ${phone}`, 14, 64)
  doc.text(`Language: ${lang}`, 14, 72)
  doc.text(`Status: ${active}`, 14, 80)

  doc.save(`${name.replace(/\s+/g, '_')}_summary.pdf`)
}

export function exportPatientsCsv(list: FhirPatient[]) {
  const headers = ['id','name','birthDate','email','mobile','language','active']
  const rows = list.map(p => {
    const name = Patient.displayName(p)
    const email = Patient.primaryEmail(p) || ''
    const mobile = Patient.primaryMobile(p) || ''
    const lang = p.communication?.[0]?.language?.text ?? ''
    const active = p.active !== false
    return [p.id ?? '', name, p.birthDate ?? '', email, mobile, lang, String(active)]
  })

  const csv = [headers.join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'patients.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(val: string) {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}
