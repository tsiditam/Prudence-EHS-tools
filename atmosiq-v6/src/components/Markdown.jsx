/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { T } from '../styles/tokens'

// Shared markdown renderer for AI-generated DISPLAY surfaces (the report
// narrative and the Jasper chat assistant). The SPA has no global
// stylesheet for h2/ul/table, so every element carries an inline style
// drawn from the design tokens (T). react-markdown builds React nodes —
// there is no dangerouslySetInnerHTML and no raw-HTML pass-through, so
// untrusted model text cannot inject markup.
//
// remark-breaks: AI output uses single newlines as line breaks. Under
// strict CommonMark those collapse to spaces; remark-breaks renders them
// as <br>, preserving the line-break feel the prior whiteSpace:'pre-wrap'
// rendering had.
//
// IMPORTANT: do NOT use this on INSERTION surfaces (inline-AI rewrites,
// proposed zone notes). Their text is written verbatim into report
// fields, where markdown characters would be a corruption, not a render.

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const components = {
  h1: (props) => <div style={{ ...T.h1, margin: '12px 0 6px' }} {...props} />,
  h2: (props) => <div style={{ ...T.h2, margin: '14px 0 6px' }} {...props} />,
  h3: (props) => <div style={{ ...T.h3, margin: '12px 0 4px' }} {...props} />,
  h4: (props) => <div style={{ ...T.bodyStrong, margin: '10px 0 4px' }} {...props} />,
  p: (props) => <p style={{ ...T.body, margin: '0 0 8px' }} {...props} />,
  strong: (props) => <strong style={{ fontWeight: 600 }} {...props} />,
  em: (props) => <em style={{ fontStyle: 'italic' }} {...props} />,
  ul: (props) => <ul style={{ margin: '4px 0 8px', paddingLeft: 20 }} {...props} />,
  ol: (props) => <ol style={{ margin: '4px 0 8px', paddingLeft: 22 }} {...props} />,
  li: (props) => <li style={{ ...T.body, margin: '2px 0' }} {...props} />,
  blockquote: (props) => (
    <blockquote style={{ margin: '8px 0', paddingLeft: 12, borderLeft: '3px solid var(--border)', color: 'var(--sub)' }} {...props} />
  ),
  a: (props) => <a style={{ color: 'var(--accent)' }} target="_blank" rel="noopener noreferrer" {...props} />,
  // react-markdown v9 no longer passes an `inline` prop; block code is a
  // <code> nested inside <pre>. We style <code> for the inline case and
  // let <pre> own the block container; the doubled background on block
  // code is harmless (same token) and these surfaces rarely emit fences.
  code: (props) => (
    <code style={{ fontFamily: MONO, background: 'var(--raised)', padding: '0.1em 0.3em', borderRadius: 4, fontSize: '0.9em' }} {...props} />
  ),
  pre: (props) => (
    <pre style={{ margin: '8px 0', padding: '10px 12px', background: 'var(--raised)', borderRadius: 8, overflowX: 'auto', fontSize: 13 }} {...props} />
  ),
  // The wrapper is the scroll container, so a table wider than the surface
  // scrolls sideways instead of crushing its columns. `width: '100%'` used
  // to pin the table to the container: a six-column benchmark table on a
  // phone left ~50px per column, and the break-word the chat surface
  // inherits down then broke headers one character per line. `minWidth:
  // '100%'` keeps a narrow table filling the surface; `width: 'auto'` lets
  // a wide one exceed it and engage the scroll that was always there.
  table: (props) => (
    <div style={{
      overflowX: 'auto',
      maxWidth: '100%',
      margin: '8px 0',
      WebkitOverflowScrolling: 'touch',
      // Sideways drag stays in the table — it must not chain out to the
      // sheet, which reads a horizontal swipe as a dismiss.
      overscrollBehaviorX: 'contain',
    }}>
      <table style={{ borderCollapse: 'collapse', width: 'auto', minWidth: '100%', fontSize: 13 }} {...props} />
    </div>
  ),
  // Headers never wrap: each one sets its column's floor width, which is
  // what pushes a genuinely wide table into the scroll container rather
  // than letting the columns collapse to fit.
  th: (props) => (
    <th style={{ ...T.bodyStrong, fontSize: 13, textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', wordBreak: 'normal' }} {...props} />
  ),
  // Cells wrap at word boundaries. `wordBreak: 'normal'` overrides the
  // break-word inherited from the chat message style — that rule is right
  // for prose but not inside a narrow column, where it splits "Parameter"
  // and "19.57" mid-token. overflowWrap still rescues a single word too
  // long for its column.
  td: (props) => (
    <td style={{ ...T.body, fontSize: 13, padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', wordBreak: 'normal', overflowWrap: 'break-word' }} {...props} />
  ),
  hr: (props) => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} {...props} />,
}

/**
 * Render an AI markdown string as styled React. `style` applies to the
 * wrapper (container sizing/spacing); block layout is owned by the
 * element overrides above, so callers should NOT set whiteSpace:'pre-wrap'
 * on the wrapper.
 */
export default function Markdown({ children, style }) {
  const text = typeof children === 'string' ? children : String(children ?? '')
  return (
    <div style={style}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
