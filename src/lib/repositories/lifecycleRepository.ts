import {
  archivePatient as archivePatientInMemory,
  buildPatientFullExport,
  getPatientLifecycleImpact as getPatientLifecycleImpactInMemory,
  getServiceLifecycleImpact as getServiceLifecycleImpactInMemory,
  moveBookingToTrash as moveBookingToTrashInMemory,
  movePatientGraphToTrash as movePatientGraphToTrashInMemory,
  moveServiceToTrash as moveServiceToTrashInMemory,
  moveSessionToTrash as moveSessionToTrashInMemory,
  purgeExpiredTrash as purgeExpiredTrashInMemory,
  reactivatePatient as reactivatePatientInMemory,
  restoreDeletionGroup as restoreDeletionGroupInMemory,
} from '@/lib/dataLifecycle'
import * as servicesRepository from '@/lib/repositories/servicesRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import { patientsStore } from '@/data/patientsStore'
import { getPatientPractitionerId } from '@/lib/practitioners'

async function mirrorPatientForLifecycle(practitionerId: string, patientId: string) {
  await patientsRepository.getById(practitionerId, patientId)
}

export async function getPatientLifecycleImpact(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  return getPatientLifecycleImpactInMemory(patientId, practitionerId)
}

export async function archivePatient(
  practitionerId: string,
  patientId: string,
  options?: { cancelFutureBookings?: boolean },
) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  const result = archivePatientInMemory(patientId, practitionerId, options)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  return result
}

export async function reactivatePatient(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  const patient = reactivatePatientInMemory(patientId, practitionerId)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  return patient
}

export async function movePatientGraphToTrash(
  practitionerId: string,
  patientId: string,
  options: { now?: Date } = {},
) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  const result = movePatientGraphToTrashInMemory(patientId, practitionerId, options.now)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  return result
}

export function moveBookingToTrash(
  practitionerId: string,
  bookingId: string,
  options: { now?: Date } = {},
) {
  return moveBookingToTrashInMemory(bookingId, practitionerId, options.now)
}

export function moveSessionToTrash(
  practitionerId: string,
  sessionId: string,
  options: { now?: Date } = {},
) {
  return moveSessionToTrashInMemory(sessionId, practitionerId, options.now)
}

export function getServiceLifecycleImpact(practitionerId: string, serviceId: string) {
  return getServiceLifecycleImpactInMemory(serviceId, practitionerId)
}

export function moveServiceToTrash(
  practitionerId: string,
  serviceId: string,
  options: { now?: Date } = {},
) {
  return moveServiceToTrashInMemory(serviceId, practitionerId, options.now)
}

export async function disableService(practitionerId: string, serviceId: string) {
  return servicesRepository.disable(practitionerId, serviceId)
}

export async function restoreDeletionGroup(
  practitionerId: string,
  deletionGroupId: string,
  options: { now?: Date } = {},
) {
  const patientIds = patientsStore
    .filter(
      patient =>
        patient.trashMetadata?.deletionGroupId === deletionGroupId &&
        getPatientPractitionerId(patient) === practitionerId,
    )
    .map(patient => patient.id)
  const result = restoreDeletionGroupInMemory(deletionGroupId, practitionerId, options.now)
  for (const patientId of patientIds) {
    await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  }
  return result
}

export function purgeExpiredTrash(options: { now?: Date } = {}) {
  return purgeExpiredTrashInMemory(options.now)
}

export async function buildPatientExport(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  return buildPatientFullExport(patientId, practitionerId)
}
