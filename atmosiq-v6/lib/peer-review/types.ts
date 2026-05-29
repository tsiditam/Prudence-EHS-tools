/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Peer review — typed shapes for the public.peer_reviews table
 * (migration 021) and the two API endpoints (api/peer-review.ts +
 * api/peer-review-respond.ts).
 *
 * Read-only on every field — consumers READ the row; updates go
 * through the API endpoints which apply business rules
 * (status transitions, expiry checks).
 */

/** Lifecycle status of a peer-review send. */
export type PeerReviewStatus =
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'commented'
  | 'canceled'

/** A row from public.peer_reviews. */
export interface PeerReview {
  readonly id: string
  readonly assessor_id: string
  readonly report_id: string
  readonly facility_name: string | null
  readonly reviewer_name: string
  readonly reviewer_email: string
  readonly message: string | null
  /** Opaque magic-link token. Never expose in audit_log or UI. */
  readonly token: string
  readonly status: PeerReviewStatus
  readonly reviewer_notes: string | null
  readonly expires_at: string
  readonly reviewed_at: string | null
  readonly created_at: string
  readonly updated_at: string
}

/** Body for POST /api/peer-review { action: 'send' }. */
export interface PeerReviewSendInput {
  readonly report_id: string
  readonly facility_name?: string | null
  readonly reviewer_name: string
  readonly reviewer_email: string
  readonly message?: string | null
  /** Base-64-encoded DOCX bytes the reviewer will receive as an attachment. */
  readonly docx_base64: string
  /** Filename to suggest for the attachment (e.g. AtmosFlow-Report-Acme.docx). */
  readonly file_name: string
}

/** GET /api/peer-review-respond?token=... response. */
export interface PeerReviewLandingView {
  readonly assessor_name: string
  readonly facility_name: string | null
  readonly requested_at: string
  readonly expires_at: string
  readonly message: string | null
  readonly status: PeerReviewStatus
}

/** Body for POST /api/peer-review-respond. */
export interface PeerReviewResponseInput {
  readonly token: string
  readonly status: 'approved' | 'changes_requested' | 'commented'
  readonly notes?: string | null
}
