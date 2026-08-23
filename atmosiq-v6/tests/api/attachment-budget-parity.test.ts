/**
 * The client's digest budget and the server's attachment ceiling must agree.
 *
 * They are two constants in two files that cannot import each other:
 * `src/utils/chatAttachments.js` pulls the CSV / XLSX / lab parsers, and
 * putting those in the Jasper cold-start path is the documented
 * anti-pattern the whole attachment design exists to avoid. So the value is
 * duplicated on purpose — the same call as AI_DISCLAIMER_LINE — and this
 * test is what stops the two drifting.
 *
 * It exists because they DID drift: raising MAX_DOCUMENT_DIGEST_CHARS from
 * 12k to 16k without touching the server's MAX_ATTACHMENT_CHARS (12k) meant
 * every PDF digest over the old cap came back as a 400. Nothing caught it,
 * because no test knew the two numbers were related.
 */
import { describe, it, expect } from 'vitest'
import {
  buildTextDigest, digestToPrompt, MAX_DOCUMENT_DIGEST_CHARS,
} from '../../src/utils/chatAttachments'
import { __test } from '../../api/field-assistant'

const { MAX_ATTACHMENT_CHARS, MAX_DOCUMENT_CHARS } = __test

describe('the server accepts what the client sends', () => {
  it('the attachment ceiling clears the digest budget', () => {
    expect(MAX_ATTACHMENT_CHARS).toBeGreaterThanOrEqual(MAX_DOCUMENT_DIGEST_CHARS)
  })

  it('a real truncated PDF digest is under the server limit', () => {
    // The case that regressed: a long report, rendered with the header
    // lines digestToPrompt adds on top of the text budget.
    const d = buildTextDigest('word '.repeat(40_000), 'assessment.pdf', {
      kind: 'pdf', pages: 41, pagesRead: 38,
    })
    const rendered = digestToPrompt(d)
    expect(d.truncated).toBe(true)
    expect(rendered.length).toBeGreaterThan(12_000)      // would have 400'd
    expect(rendered.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CHARS)
  })

  it('a stored document may be as long as the extractor can produce', async () => {
    const { MAX_PDF_CHARS } = await import('../../src/utils/pdfText')
    expect(MAX_DOCUMENT_CHARS).toBeGreaterThanOrEqual(MAX_PDF_CHARS)
  })
})
