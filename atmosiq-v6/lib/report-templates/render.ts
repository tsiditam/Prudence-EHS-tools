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
 *
 * ── Two kinds of tag ──────────────────────────────────────────────
 *
 * A FLAT token (`{{client.name}}`) resolves through TOKEN_RESOLVERS to one
 * string. A SECTION (`{{#findings}} … {{/findings}}`) resolves through
 * SECTION_RESOLVERS to an array of all-string rows, and docxtemplater repeats
 * the enclosed block once per row — which is the shape an IAQ report table
 * actually is.
 *
 * Sections landed in 2026-09. `paragraphLoop: true` was already set, so the
 * engine had supported them all along; what was missing was array data. A
 * section tag went through the flat resolver map, missed, and was assigned
 * `''` — which docxtemplater reads as a falsy section and renders ZERO times.
 * Loops never errored, they just quietly produced nothing, and the tag was
 * reported to the user as an unknown token with no hint that the syntax was
 * supported.
 */

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import {
  TOKEN_NAMES,
  TOKEN_RESOLVERS,
  SECTION_NAMES,
  SECTION_RESOLVERS,
  SECTION_FIELDS,
  type AssessmentContext,
  type SectionRow,
} from './token-registry.js'

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
  /**
   * Tokens resolved to something. A SECTION counts as filled when it produced
   * at least one row — "the table has rows" is the same question for the
   * reader as "the token has a value".
   */
  tokens_filled: string[]
  /** Known tokens that resolved to empty; sections that produced zero rows. */
  tokens_empty: string[]
  /**
   * Tags in the template that no registry knows. Includes a field used inside
   * a section that the section does not define — reported as
   * `section.field` so the message names where to look.
   */
  tokens_unknown: string[]
}

/**
 * Walk the docxtemplater getTags() output across headers/footers/document.
 *
 * Returns a map of tag name → the child tags used INSIDE it. A flat token has
 * no children; a section's children are the fields the template prints on each
 * row, which is what lets an unknown field be reported against its section
 * rather than silently rendering blank.
 */
function collectTagTree(rawTags: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  if (!rawTags || typeof rawTags !== 'object') return out
  const add = (name: string, children: Iterable<string>) => {
    const set = out.get(name) || new Set<string>()
    for (const c of children) set.add(c)
    out.set(name, set)
  }
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (obj.tags && typeof obj.tags === 'object') {
      const tags = obj.tags as Record<string, unknown>
      for (const k of Object.keys(tags)) {
        const v = tags[k]
        add(k, v && typeof v === 'object' ? Object.keys(v as object) : [])
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
  return out
}

/**
 * Partition a tag tree into known flat tokens, known sections, and unknown.
 *
 * Shared by `discoverTokens` (upload validation) and `renderTemplate` so the
 * warning the assessor sees at upload is computed the same way as the outcome
 * they get at render — the two drifting apart is its own defect class.
 */
function classifyTags(tree: Map<string, Set<string>>): {
  flat: string[]
  sections: string[]
  unknown: string[]
} {
  const flat: string[] = []
  const sections: string[] = []
  const unknown: string[] = []
  for (const [tag, children] of tree) {
    if (SECTION_NAMES.has(tag)) {
      sections.push(tag)
      const valid = SECTION_FIELDS.get(tag)
      for (const field of children) {
        if (valid && !valid.has(field)) unknown.push(`${tag}.${field}`)
      }
    } else if (TOKEN_NAMES.has(tag)) {
      flat.push(tag)
    } else {
      unknown.push(tag)
    }
  }
  return { flat, sections, unknown }
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
  const { flat, sections, unknown } = classifyTags(
    collectTagTree((doc as unknown as { getTags: () => unknown }).getTags()),
  )
  // Sections report as found under their `#name` form, so the Settings panel
  // shows `{{#findings}}` rather than a bare `findings` the assessor cannot
  // match to anything they typed.
  return {
    found: [...flat, ...sections.map((x) => `#${x}`)].sort(),
    unknown: unknown.sort(),
  }
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
  const tree = collectTagTree(
    (doc as unknown as { getTags: () => unknown }).getTags(),
  )
  const { flat, sections, unknown } = classifyTags(tree)

  const data: Record<string, string | SectionRow[]> = {}
  const tokens_filled: string[] = []
  const tokens_empty: string[] = []
  const tokens_unknown: string[] = [...unknown]

  // An unknown top-level tag gets an explicit empty value so a stale template
  // renders blanks rather than tripping the render. The `section.field`
  // entries in `unknown` are not top-level tags — they live in the section's
  // own scope — so the tree membership test skips them.
  for (const tag of unknown) if (tree.has(tag)) data[tag] = ''

  for (const tag of flat) {
    const resolver = TOKEN_RESOLVERS.get(tag)!
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

  for (const section of sections) {
    const resolver = SECTION_RESOLVERS.get(section)!
    let rows: SectionRow[] = []
    try {
      rows = resolver(context) || []
    } catch {
      rows = []
    }
    data[section] = rows
    // Reported under `#name` to match what discoverTokens told the assessor at
    // upload. A section with no rows is `empty`, not `unknown` — the template
    // is correct and the assessment simply has nothing to put in that table,
    // and those are different problems.
    if (rows.length) tokens_filled.push(`#${section}`)
    else tokens_empty.push(`#${section}`)
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
