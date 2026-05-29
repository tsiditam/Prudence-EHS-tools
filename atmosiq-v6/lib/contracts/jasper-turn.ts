/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Jasper turn contract — connectivity layer PR E.
 *
 * Documents the request / SSE-event shape for one Jasper turn at
 * `/api/field-assistant`. Backs the AtmosFlow AI sheet
 * (`FieldAssistant.jsx` + `useFieldAssistant.js`). Pinning this here
 * keeps the SSE event vocabulary stable across browser code,
 * server code, and fine-tune export tooling.
 *
 * Source of truth: `api/field-assistant.ts`. This .ts file is the
 * typed boundary spec — no runtime validator is enforced here.
 */

import type { JasperContext } from '../context/types'

/** Per-photo payload attached to one turn (base64 data URL). */
export interface JasperPhotoPayload {
  readonly id: string
  readonly dataUrl: string
  readonly label?: string | null
}

/** POST /api/field-assistant request body. */
export interface JasperTurnRequest {
  /** The assessor's message. Trimmed; ≤ MAX_USER_MESSAGE_LEN chars. */
  readonly message: string
  /**
   * Conversation id. Omit on the first turn — the handler creates a
   * new conversation row and emits the id back on the `meta` event.
   */
  readonly conversation_id?: string | null
  /**
   * Optional photos attached for analyze_photo. Capped at
   * MAX_PHOTOS_PER_REQUEST entries.
   */
  readonly photos?: ReadonlyArray<JasperPhotoPayload>
  /**
   * The Jasper context prop (built by `buildJasperContext`, PR B).
   * Strictly read-only; the handler never writes back.
   */
  readonly context?: JasperContext | Record<string, unknown>
}

/**
 * SSE events emitted by the handler (one per line, `event:` +
 * `data:` JSON). Discriminated by the `event` name. The browser
 * hook in `src/hooks/useFieldAssistant.js` is the canonical
 * consumer.
 */
export type JasperSseEvent =
  | JasperSseMeta
  | JasperSseToken
  | JasperSseToolStart
  | JasperSseToolCall
  | JasperSseProposedAction
  | JasperSseRenderProposed
  | JasperSseDone
  | JasperSseError

export interface JasperSseMeta {
  readonly event: 'meta'
  readonly data: {
    readonly conversation_id: string
    readonly user_turn_id: string
    readonly context_view: string | null
  }
}

export interface JasperSseToken {
  readonly event: 'token'
  readonly data: { readonly text: string }
}

export interface JasperSseToolStart {
  readonly event: 'tool_start'
  readonly data: {
    readonly id: string
    readonly name: string
    readonly input: Record<string, unknown>
  }
}

export interface JasperSseToolCall {
  readonly event: 'tool_call'
  readonly data: {
    readonly id: string
    readonly name: string
    readonly status: string
  }
}

export interface JasperSseProposedAction {
  readonly event: 'proposed_action'
  readonly data: Record<string, unknown>
}

export interface JasperSseRenderProposed {
  readonly event: 'render_proposed'
  readonly data: {
    readonly template_id: string
    readonly template_name: string
    readonly file_name: string
  }
}

export interface JasperSseDone {
  readonly event: 'done'
  readonly data: {
    readonly usage: JasperUsage
    readonly quota: JasperQuotaBlock
    readonly tool_calls: ReadonlyArray<{ readonly name: string; readonly status: string }>
  }
}

export interface JasperSseError {
  readonly event: 'error'
  readonly data: { readonly error: string }
}

export interface JasperUsage {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_input_tokens: number
  readonly cache_creation_input_tokens: number
  readonly estimated_cost_usd: number
}

export interface JasperQuotaBlock {
  readonly per_minute_remaining?: number
  readonly per_day_remaining?: number
  readonly retry_after?: number | null
}

/**
 * Persisted message shape — the row written to
 * `public.field_assistant_messages` after each turn. Captured as
 * read-only documentation; the fine-tune export pipeline depends on
 * the column names.
 */
export interface JasperMessageRow {
  readonly id: string
  readonly conversation_id: string
  readonly user_id: string
  readonly role: 'user' | 'assistant' | 'tool_result'
  readonly content: string
  readonly context_view: string | null
  readonly created_at: string
}
