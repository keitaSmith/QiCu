'use client'

import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { useMemo, useState, type ChangeEvent } from 'react'

import type { PatientCoreView } from '@/models/patient.coreView'
import type { Service } from '@/models/service'
import {
  buildBookingImportPreview,
  buildBookingsTemplateCsv,
  parseBookingsCsv,
  type BookingImportPreviewRow,
} from '@/lib/bookingsImportExport'

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

type BookingImportDialogProps = {
  open: boolean
  onClose: () => void
  patients: PatientCoreView[]
  services: Service[]
  onImportRows: (rows: BookingImportPreviewRow[]) => Promise<void>
}

export function BookingImportDialog({
  open,
  onClose,
  patients,
  services,
  onImportRows,
}: BookingImportDialogProps) {
  const [fileName, setFileName] = useState('')
  const [previewRows, setPreviewRows] = useState<BookingImportPreviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validRows = useMemo(
    () => previewRows.filter(row => row.isValid),
    [previewRows],
  )
  const invalidRows = useMemo(
    () => previewRows.filter(row => !row.isValid),
    [previewRows],
  )

  function resetState() {
    setFileName('')
    setPreviewRows([])
    setError(null)
    setSubmitting(false)
  }

  function handleClose() {
    resetState()
    onClose()
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError(null)

    try {
      const text = await file.text()
      const parsed = parseBookingsCsv(text)

      if (parsed.length === 0) {
        setPreviewRows([])
        setError('The file is empty or could not be read as CSV.')
        return
      }

      const preview = buildBookingImportPreview(parsed, patients, services)
      setPreviewRows(preview)
    } catch (nextError) {
      console.error(nextError)
      setPreviewRows([])
      setError('Could not read that file. Please upload a CSV file.')
    }
  }

  async function handleImport() {
    if (validRows.length === 0) return

    setSubmitting(true)
    setError(null)

    try {
      await onImportRows(validRows)
      handleClose()
    } catch (nextError) {
      console.error(nextError)
      setError('Something went wrong while importing bookings.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-40 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-4xl rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Import bookings</h2>
                <p className="mt-1 text-sm text-ink/70">
                  Upload a CSV file, review the preview, then import the valid rows. Missing patients and services will be created automatically.
                </p>
              </div>

              <button
                type="button"
                onClick={() => downloadCsv('qicu-bookings-template.csv', buildBookingsTemplateCsv())}
                className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
              >
                Download template
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-brand-300/30 bg-brand-50/40 p-4">
                <label className="block text-sm font-medium text-ink">CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="mt-2 block w-full rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
                />
                {fileName && (
                  <p className="mt-2 text-xs text-ink/60">Loaded file: {fileName}</p>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {previewRows.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-brand-300/30 bg-surface p-3">
                      <div className="text-xs uppercase tracking-wide text-ink/60">Rows found</div>
                      <div className="mt-1 text-lg font-semibold text-ink">{previewRows.length}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-emerald-700">Ready to import</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-800">{validRows.length}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-amber-700">Needs fixing</div>
                      <div className="mt-1 text-lg font-semibold text-amber-800">{invalidRows.length}</div>
                    </div>
                  </div>

                  <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-brand-300/30">
                    <table className="min-w-full divide-y divide-brand-300/20 text-sm">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="text-left text-ink/70">
                          <th className="px-3 py-2 font-medium">Patient</th>
                          <th className="px-3 py-2 font-medium">Service</th>
                          <th className="px-3 py-2 font-medium">Start</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-300/10 bg-white/60">
                        {previewRows.map(row => (
                          <tr key={`${row.rowNumber}-${row.patientName}-${row.start}`}>
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium text-ink">{row.patientName || '—'}</div>
                              <div className="text-xs text-ink/50">Row {row.rowNumber}</div>
                            </td>
                            <td className="px-3 py-2 align-top text-ink/80">{row.serviceName || '—'}</td>
                            <td className="px-3 py-2 align-top text-ink/80">
                              {row.start ? new Date(row.start).toLocaleString() : '—'}
                            </td>
                            <td className="px-3 py-2 align-top text-ink/80">{row.status}</td>
                            <td className="px-3 py-2 align-top">
                              {row.isValid ? (
                                <div className="space-y-1">
                                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                    Ready
                                  </span>
                                  {row.warnings.map(item => (
                                    <div key={item} className="text-xs text-amber-700">
                                      • {item}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {row.errors.map(item => (
                                    <div key={item} className="text-xs text-amber-700">
                                      • {item}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-brand-300/40 bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={validRows.length === 0 || submitting}
                onClick={() => void handleImport()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {submitting ? 'Importing…' : `Import ${validRows.length} booking${validRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
