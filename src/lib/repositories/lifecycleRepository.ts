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

export function getPatientLifecycleImpact(practitionerId: string, patientId: string) {
  return getPatientLifecycleImpactInMemory(patientId, practitionerId)
}

export function archivePatient(
  practitionerId: string,
  patientId: string,
  options?: { cancelFutureBookings?: boolean },
) {
  return archivePatientInMemory(patientId, practitionerId, options)
}

export function reactivatePatient(practitionerId: string, patientId: string) {
  return reactivatePatientInMemory(patientId, practitionerId)
}

export function movePatientGraphToTrash(
  practitionerId: string,
  patientId: string,
  options: { now?: Date } = {},
) {
  return movePatientGraphToTrashInMemory(patientId, practitionerId, options.now)
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

export function restoreDeletionGroup(
  practitionerId: string,
  deletionGroupId: string,
  options: { now?: Date } = {},
) {
  return restoreDeletionGroupInMemory(deletionGroupId, practitionerId, options.now)
}

export function purgeExpiredTrash(options: { now?: Date } = {}) {
  return purgeExpiredTrashInMemory(options.now)
}

export function buildPatientExport(practitionerId: string, patientId: string) {
  return buildPatientFullExport(patientId, practitionerId)
}
