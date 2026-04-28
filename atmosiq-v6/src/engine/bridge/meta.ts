/**
 * AtmosFlow v2.1 Bridge — AssessmentMeta Derivation
 *
 * Derives the v2.1 AssessmentMeta input from the legacy app's profile +
 * presurvey + building data shapes. Used by the bridge's app-side wiring;
 * the meta object is also reusable by client/internal report renderers.
 */

import type { AssessmentMeta, AssessorRef, IssuingFirm, ReviewStatus, QualifiedProfessional } from '../types/domain'

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
    readonly [key: string]: unknown
  } | null
  readonly building?: {
    readonly fn?: string
    readonly fl?: string
    readonly [key: string]: unknown
  } | null
  readonly assessmentDate?: string
  readonly reviewStatus?: ReviewStatus
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

  return {
    siteName: building?.fn || 'Unnamed Facility',
    siteAddress: building?.fl || '',
    assessmentDate: input.assessmentDate || new Date().toISOString().slice(0, 10),
    preparingAssessor,
    reviewingProfessional,
    reviewStatus: input.reviewStatus ?? 'draft_pending_professional_review',
    issuingFirm,
  }
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
