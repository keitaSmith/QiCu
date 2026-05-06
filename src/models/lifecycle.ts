export type TrashMetadata = {
  deletedAt: string
  restoreUntil: string
  deletedByPractitionerId: string
  deletionGroupId: string
  deletionType: 'patient-data' | 'booking' | 'session' | 'service'
  deletionReason?: string
}

export type LifecycleFields = {
  trashMetadata?: TrashMetadata
}
