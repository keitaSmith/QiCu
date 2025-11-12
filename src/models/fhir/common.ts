// models/fhir/common.ts
export type Coding = { system?: string; version?: string; code?: string; display?: string; userSelected?: boolean };
export type CodeableConcept = { coding?: Coding[]; text?: string };
export type Identifier = { use?: 'usual'|'official'|'temp'|'secondary'|'old'; type?: CodeableConcept; system?: string; value: string; period?: Period; assigner?: Reference };
export type Reference = { reference: string; type?: string; identifier?: Identifier; display?: string };
export type Period = { start?: string; end?: string };                 // ISO datetime
export type Attachment = { contentType?: string; language?: string; data?: string; url?: string; size?: number; hash?: string; title?: string; creation?: string };
export type Meta = { versionId?: string; lastUpdated?: string; source?: string; profile?: string[]; security?: Coding[]; tag?: Coding[] };
