/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Pure-function DOCX template renderer.
 *
 * Takes a template Buffer (a user-uploaded .docx) and an assessment
 * context, walks the canonical TOKEN_REGISTRY to resolve every
 * `{{token}}` to a literal string, and returns the rendered Buffer.
 *
 * No I/O — Storage download / upload is the API handler's job.
 * No prose synthesis — every value comes from the registry's
 * deterministic resolvers. See ./token-registry.ts for the contract.
 *
 * Delimiters are pinned to `{{` and `}}` to match common mail-merge
 * convention. Unknown tokens render empty (NOT as a thrown error)
 * because users will accumulate templates with stale tokens over time
 * and we'd rather render blanks than fail.
 */

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import {
  TOKEN_NAMES,
  TOKEN_RESOLVERS,
  type AssessmentContext,
} from './token-registry'

export class TemplateRenderError extends Error {
  readonly code: string
  readonly detail: string | undefined
  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'TemplateRenderError'
    this.code = code
    this.detail = detail
  }
}

export interface RenderResult {
  buffer: Buffer
  /** Tokens present in the template AND in the registry, resolved to non-empty. */
  tokens_filled: string[]
  /** Tokens present in the template AND in the registry, but resolved to empty. */
  tokens_empty: string[]
  /** Tokens present in the template but NOT in the registry. */
  tokens_unknown: string[]
}

/** Walk the docxtemplater getTags() output across headers/footers/document. */
function collectTagNames(rawTags: unknown): string[] {
  const out = new Set<string>()
  if (!rawTags || typeof rawTags !== 'object') return []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (obj.tags && typeof obj.tags === 'object') {
      for (const k of Object.keys(obj.tags as Record<string, unknown>)) {
        out.add(k)
      }
    }
    // Headers/footers come back as arrays of {target, tags}.
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
    }
    // The "document" key itself is a {target, tags} object — handled
    // above. Other shapes (newer docxtemplater versions could nest
    // differently) get a recursive sweep.
    for (const k of Object.keys(obj)) {
      const child = obj[k]
      if (child && typeof child === 'object' && k !== 'tags') walk(child)
    }
  }
  walk(rawTags)
  return [...out]
}

/**
 * Inspect a template Buffer and return the set of tokens it
 * references, partitioned into known / unknown. Used by the upload
 * handler so the Settings UI can warn before save.
 */
export function discoverTokens(templateBuffer: Buffer): {
  found: string[]
  unknown: string[]
} {
  let zip: PizZip
  try {
    zip = new PizZip(templateBuffer)
  } catch (err) {
    throw new TemplateRenderError(
      'invalid_docx',
      'Uploaded file is not a valid .docx (PizZip could not parse it).',
      err instanceof Error ? err.message : undefined,
    )
  }
  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
    })
  } catch (err) {
    throw new TemplateRenderError(
      'template_parse_failed',
      'docxtemplater could not parse the template — check for unbalanced {{ }} delimiters.',
      err instanceof Error ? err.message : undefined,
    )
  }
  // getTags() is a runtime method on docxtemplater that returns the
  // discovered placeholder set across document parts. It's not in the
  // public .d.ts surface, so we cast through unknown to call it.
  const allTags = collectTagNames(
    (doc as unknown as { getTags: () => unknown }).getTags(),
  )
  const found: string[] = []
  const unknown: string[] = []
  for (const t of allTags) {
    if (TOKEN_NAMES.has(t)) found.push(t)
    else unknown.push(t)
  }
  return { found: found.sort(), unknown: unknown.sort() }
}

/**
 * Render a template Buffer against an assessment context. Tokens
 * outside the registry resolve to '' (so a stale template still
 * produces a rendered file, just with blanks).
 */
export function renderTemplate(
  templateBuffer: Buffer,
  context: AssessmentContext,
): RenderResult {
  let zip: PizZip
  try {
    zip = new PizZip(templateBuffer)
  } catch (err) {
    throw new TemplateRenderError(
      'invalid_docx',
      'Uploaded file is not a valid .docx.',
      err instanceof Error ? err.message : undefined,
    )
  }
  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
      // Default behavior on missing values is to throw; we want
      // them to render empty instead.
      nullGetter: () => '',
    })
  } catch (err) {
    throw new TemplateRenderError(
      'template_parse_failed',
      'docxtemplater could not parse the template — check for unbalanced {{ }} delimiters.',
      err instanceof Error ? err.message : undefined,
    )
  }

  // getTags() is a runtime method on docxtemplater that returns the
  // discovered placeholder set across document parts. It's not in the
  // public .d.ts surface, so we cast through unknown to call it.
  const allTags = collectTagNames(
    (doc as unknown as { getTags: () => unknown }).getTags(),
  )
  const data: Record<string, string> = {}
  const tokens_filled: string[] = []
  const tokens_empty: string[] = []
  const tokens_unknown: string[] = []

  for (const tag of allTags) {
    const resolver = TOKEN_RESOLVERS.get(tag)
    if (!resolver) {
      tokens_unknown.push(tag)
      data[tag] = ''
      continue
    }
    let value = ''
    try {
      value = resolver(context) || ''
    } catch {
      value = ''
    }
    data[tag] = value
    if (value) tokens_filled.push(tag)
    else tokens_empty.push(tag)
  }

  try {
    doc.render(data)
  } catch (err) {
    // docxtemplater wraps multiple template errors into one
    // composite error with a .properties.errors[] array. We surface
    // the first one's offending tag for the chat UI to echo.
    const detail = describeRenderError(err)
    throw new TemplateRenderError('render_failed', 'Failed to render template.', detail)
  }

  const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer

  return {
    buffer,
    tokens_filled: tokens_filled.sort(),
    tokens_empty: tokens_empty.sort(),
    tokens_unknown: tokens_unknown.sort(),
  }
}

function describeRenderError(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const errObj = err as { message?: string; properties?: { errors?: unknown[] } }
  const inner = errObj.properties?.errors
  if (Array.isArray(inner) && inner.length > 0) {
    const first = inner[0] as { message?: string; properties?: { explanation?: string } }
    return first.properties?.explanation || first.message
  }
  return errObj.message
}
