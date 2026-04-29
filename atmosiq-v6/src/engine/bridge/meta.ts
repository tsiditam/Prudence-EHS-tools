/**
 * AtmosFlow v2.1 Bridge — AssessmentMeta Derivation
 *
 * Derives the v2.1 AssessmentMeta input from the legacy app's profile +
 * presurvey + building data shapes. Used by the bridge's app-side wiring;
 * the meta object is also reusable by client/internal report renderers.
 */

import type { AssessmentMeta, AssessorRef, IssuingFirm, ReviewStatus, QualifiedProfessional, Recipient } from '../types/domain'
import type { InstrumentRef } from '../types/reading'

// Loose input types — these match what the legacy storage emits without
// importing the legacy assessment.ts shape (which would re-narrow fields).
export interface MetaInput {
  readonly profile?: {
    readonly name?: string
    readonly certs?: ReadonlyArray<string>
    readonly firm?: string
    readonly firm_address?: string
    readonly firm_phone?: string
    readonly firm_email?: string
    readonly firm_website?: string
  } | null
  readonly presurvey?: {
    readonly ps_assessor?: string
    readonly ps_assessor_certs?: ReadonlyArray<string>
    readonly ps_reviewing_professional?: string
    readonly ps_reviewing_professional_certs?: ReadonlyArray<string>
    readonly ps_reviewing_professional_signature_date?: string
    readonly ps_project_number?: string
    readonly ps_recipient_name?: string
    readonly ps_recipient_title?: string
    readonly ps_recipient_organization?: string
    readonly ps_recipient_address1?: string
    readonly ps_recipient_address2?: string
    readonly ps_recipient_city?: string
    readonly ps_recipient_state?: string
    readonly ps_recipient_zip?: string
    readonly ps_inst_iaq?: string
    readonly ps_inst_iaq_serial?: string
    readonly ps_inst_iaq_cal?: string
    readonly ps_inst_iaq_cal_status?: string
    readonly ps_inst_pid?: string
    readonly ps_inst_pid_cal?: string
    readonly [key: string]: unknown
  } | null
  readonly building?: {
    readonly fn?: string
    readonly fl?: string
    readonly [key: string]: unknown
  } | null
  readonly assessmentDate?: string
  readonly reviewStatus?: ReviewStatus
  // v2.2 §2 — explicit project number override (caller supplies the
  // canonical number); fall back to presurvey.ps_project_number, then
  // a deterministic year-based default.
  readonly projectNumber?: string
  // v2.2 §3 — explicit recipient override; fall back to presurvey
  // ps_recipient_* fields if provided, else a placeholder.
  readonly transmittalRecipient?: Recipient
  // v2.2 §7 — explicit instruments-used list; fall back to presurvey
  // ps_inst_iaq / ps_inst_pid if provided.
  readonly instrumentsUsed?: ReadonlyArray<InstrumentRef>
}

const DEFAULT_FIRM: IssuingFirm = {
  name: 'Prudence Safety & Environmental Consulting, LLC',
  contact: {
    email: 'tsidi@prudenceehs.com',
    phone: '301-541-8362',
  },
}

export function deriveAssessmentMeta(input: MetaInput): AssessmentMeta {
  const profile = input.profile ?? null
  const presurvey = input.presurvey ?? null
  const building = input.building ?? null

  const preparingAssessor: AssessorRef = {
    fullName: profile?.name || presurvey?.ps_assessor || 'Unnamed Assessor',
    credentials: profile?.certs ?? presurvey?.ps_assessor_certs ?? [],
  }

  const issuingFirm: IssuingFirm = profile?.firm
    ? {
        name: profile.firm,
        address: profile.firm_address,
        contact: {
          email: profile.firm_email,
          phone: profile.firm_phone,
          website: profile.firm_website,
        },
      }
    : DEFAULT_FIRM

  const reviewingProfessional: QualifiedProfessional | undefined =
    presurvey?.ps_reviewing_professional
      ? {
          fullName: presurvey.ps_reviewing_professional,
          credentials: filterCredentials(presurvey.ps_reviewing_professional_certs ?? []),
          signatureDate: presurvey.ps_reviewing_professional_signature_date,
        }
      : undefined

  // v2.2 §2 — project number derivation. Caller override > presurvey
  // ps_project_number > deterministic year-based default.
  const projectNumber = input.projectNumber
    || presurvey?.ps_project_number
    || `PSEC-${new Date().getFullYear()}-0001`

  // v2.2 §3 — transmittal recipient. Caller override > presurvey
  // ps_recipient_* fields > placeholder using siteName as organization.
  const transmittalRecipient: Recipient = input.transmittalRecipient
    ?? buildRecipientFromPresurvey(presurvey)
    ?? {
      fullName: 'Site Contact',
      organization: building?.fn || 'Client Organization',
    }

  // v2.2 §7 — instrumentsUsed. Caller override > presurvey instrument
  // fields > empty (renders the "specs not captured" fallback).
  const instrumentsUsed: ReadonlyArray<InstrumentRef> | undefined = input.instrumentsUsed
    ?? buildInstrumentsFromPresurvey(presurvey)

  return {
    siteName: building?.fn || 'Unnamed Facility',
    siteAddress: building?.fl || '',
    assessmentDate: input.assessmentDate || new Date().toISOString().slice(0, 10),
    preparingAssessor,
    reviewingProfessional,
    reviewStatus: input.reviewStatus ?? 'draft_pending_professional_review',
    issuingFirm,
    projectNumber,
    transmittalRecipient,
    instrumentsUsed,
  }
}

function buildRecipientFromPresurvey(presurvey: MetaInput['presurvey']): Recipient | null {
  if (!presurvey?.ps_recipient_name && !presurvey?.ps_recipient_organization) return null
  return {
    fullName: presurvey?.ps_recipient_name || 'Site Contact',
    title: presurvey?.ps_recipient_title,
    organization: presurvey?.ps_recipient_organization || 'Client Organization',
    addressLine1: presurvey?.ps_recipient_address1,
    addressLine2: presurvey?.ps_recipient_address2,
    city: presurvey?.ps_recipient_city,
    state: presurvey?.ps_recipient_state,
    zip: presurvey?.ps_recipient_zip,
  }
}

function buildInstrumentsFromPresurvey(presurvey: MetaInput['presurvey']): ReadonlyArray<InstrumentRef> | undefined {
  if (!presurvey) return undefined
  const out: InstrumentRef[] = []
  if (presurvey.ps_inst_iaq) {
    out.push({
      model: presurvey.ps_inst_iaq,
      serial: presurvey.ps_inst_iaq_serial,
      lastCalibration: presurvey.ps_inst_iaq_cal,
      calibrationStatus: presurvey.ps_inst_iaq_cal_status,
    })
  }
  if (presurvey.ps_inst_pid) {
    out.push({
      model: presurvey.ps_inst_pid,
      calibrationStatus: presurvey.ps_inst_pid_cal,
    })
  }
  return out.length > 0 ? out : undefined
}

const KNOWN_CREDENTIALS = ['CIH', 'CSP', 'PE', 'ROH', 'CHMM'] as const
type KnownCredential = (typeof KNOWN_CREDENTIALS)[number] | 'Other'

function filterCredentials(certs: ReadonlyArray<string>): ReadonlyArray<KnownCredential> {
  const out: KnownCredential[] = []
  for (const c of certs) {
    const upper = c.toUpperCase()
    const known = KNOWN_CREDENTIALS.find(k => upper.includes(k))
    out.push(known ?? 'Other')
  }
  return out
}
