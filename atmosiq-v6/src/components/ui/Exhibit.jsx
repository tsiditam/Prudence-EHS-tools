/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Exhibit — a photo or plan presented as evidence, not as a bare image.
 *
 *   <Exhibit photo={record} title="Water damage" meta="Conference Room · 10:42" />
 *   <Exhibit src={dataUrl} title="Level 2 plan" aspect="4 / 3" />
 *   <ExhibitFrame> …any image or map… </ExhibitFrame>
 *
 * A site photo in a consultant report is an exhibit: it is framed, it has
 * a caption that says what it shows, where and when, and it sits on the
 * page as a document rather than floating as a thumbnail. The frame is a
 * hairline in the strong border tone with a one-pixel inner shadow along
 * the top edge so the image reads as set INTO the surface (the way a
 * mounted print sits behind its mat), and the caption row runs beneath in
 * the caption scale — title in the primary ink, the where-and-when in the
 * tertiary ink. `ExhibitFrame` is the frame alone for surfaces that draw
 * their own contents (the floor plan with its pins). Photo records reach
 * `photo` and resolve through usePhotoSrc (inline or IndexedDB); a plain
 * `src` is used as given.
 */
import { usePhotoSrc } from '../../hooks/usePhotoSrc'
import * as V3 from '../../styles/tokens'

export const EXHIBIT_RADIUS = 12

/** The frame's overlay: an inset hairline and a top-edge inner shadow. */
export function ExhibitGlaze({ radius = EXHIBIT_RADIUS }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none', zIndex: 1,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 2px 10px rgba(0,0,0,0.22)',
      }}
    />
  )
}

export function ExhibitFrame({ children, radius = EXHIBIT_RADIUS, style, ...rest }) {
  return (
    <div
      style={{
        position: 'relative', borderRadius: radius, overflow: 'hidden',
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        ...style,
      }}
      {...rest}>
      {children}
      <ExhibitGlaze radius={radius} />
    </div>
  )
}

function ExhibitImage({ photo, src, alt, aspect, height }) {
  const resolved = usePhotoSrc(photo || null)
  const url = src || resolved
  const box = { width: '100%', display: 'block', objectFit: 'cover', ...(height ? { height } : { aspectRatio: aspect }) }
  if (!url) return <div aria-hidden="true" style={{ ...box, background: 'var(--raised)' }} />
  return <img src={url} alt={alt} style={box} />
}

export default function Exhibit({ photo, src, alt = '', title, meta, aspect = '4 / 3', height, onClick, badge, style }) {
  const body = (
    <>
      <ExhibitFrame>
        <ExhibitImage photo={photo} src={src} alt={alt} aspect={aspect} height={height} />
        {badge && <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>{badge}</span>}
      </ExhibitFrame>
      {(title || meta) && (
        <div style={{ padding: '7px 2px 0', minWidth: 0 }}>
          {title && <div style={{ ...V3.T.caption, color: V3.TEXT_PRIMARY, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>}
          {meta && <div style={{ ...V3.T.captionDim, fontSize: 11, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
        </div>
      )}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent', ...style }}>
        {body}
      </button>
    )
  }
  return <figure style={{ margin: 0, minWidth: 0, ...style }}>{body}</figure>
}
