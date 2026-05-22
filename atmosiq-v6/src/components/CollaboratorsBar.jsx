/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * CollaboratorsBar — small presence strip showing other IHs in the
 * same assessment. Reads useCollaborators() and renders an overlapping
 * row of ProfileAvatar chips, each with a tooltip that says who they
 * are and what zone they're on.
 *
 *   <CollaboratorsBar
 *     assessmentId={activeDraft.id}
 *     me={{ id: user.id, name: profile.name, avatar_url: profile.avatar_url }}
 *     currentZone={zones[curZone]?.zn || null}
 *     onClickPeer={(c) => focusZone(c.current_zone)} // optional
 *   />
 *
 * Renders nothing when there are no other collaborators — the bar
 * shouldn't be visual noise in the solo case (the most common case).
 *
 * Mounted in the in-progress hero card so the assessor sees teammates
 * before they start editing — they can coordinate ("you take floor 3,
 * I've got floor 4") without leaving the app.
 */

import { useCollaborators } from '../hooks/useCollaborators'
import ProfileAvatar from './ProfileAvatar'

// Cap how many avatars render inline before collapsing to "+ N". The
// hero card has limited horizontal real estate; we'd rather show 3
// + "+2 more" than wrap onto a second line.
const MAX_INLINE_AVATARS = 4

export default function CollaboratorsBar({
  assessmentId,
  me,
  currentZone,
  onClickPeer,
  size = 28,
  style = {},
}) {
  const { collaborators, count, supported } = useCollaborators({
    assessmentId,
    me,
    currentZone,
    enabled: !!assessmentId && !!me && !!me.id,
  })

  // No supported channel, no chrome — solo assessors don't need a
  // "no collaborators" indicator.
  if (!supported || count === 0) return null

  const inline = collaborators.slice(0, MAX_INLINE_AVATARS)
  const extra = count - inline.length

  return (
    <div
      role="status"
      aria-label={`${count} other ${count === 1 ? 'assessor' : 'assessors'} in this assessment`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px 4px 4px',
        background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
        borderRadius: 999,
        fontFamily: 'inherit',
        ...style,
      }}>
      {/* Overlapping avatar stack — modern presence affordance
          (GitHub, Linear, Figma all use this row pattern). */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {inline.map((c, idx) => (
          <CollaboratorChip
            key={c.id}
            collaborator={c}
            size={size}
            offsetLeft={idx === 0 ? 0 : -8}
            onClick={onClickPeer ? () => onClickPeer(c) : undefined}
          />
        ))}
        {extra > 0 && (
          <span
            aria-label={`${extra} more collaborator${extra === 1 ? '' : 's'}`}
            style={{
              marginLeft: -8,
              width: size,
              height: size,
              borderRadius: '50%',
              background: 'var(--card)',
              border: '2px solid var(--surface)',
              color: 'var(--text)',
              fontSize: Math.max(10, Math.round(size * 0.4)),
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
            }}>
            +{extra}
          </span>
        )}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--accent)',
        letterSpacing: '0.2px',
      }}>
        {count === 1 ? 'also here' : `${count} others here`}
      </span>
    </div>
  )
}

function CollaboratorChip({ collaborator, size, offsetLeft, onClick }) {
  const name = collaborator.name || 'Assessor'
  const zone = collaborator.current_zone || null
  // The title attribute is the cross-device hover/long-press tooltip
  // — it surfaces both name and the zone they're on without any
  // custom popover infrastructure. Modern phones long-press on a
  // chip to reveal it.
  const title = zone ? `${name} — viewing ${zone}` : name

  // Wrap the avatar in a small badge container so the avatar can use
  // its own circular border without us double-bordering.
  const wrapStyle = {
    marginLeft: offsetLeft,
    position: 'relative',
    border: '2px solid var(--surface)',
    borderRadius: '50%',
    overflow: 'hidden',
    width: size + 4,
    height: size + 4,
    background: 'var(--surface)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onClick ? 'pointer' : 'default',
  }

  return (
    <span
      style={wrapStyle}
      title={title}
      onClick={onClick}>
      <ProfileAvatar
        profile={{ name, avatar_url: collaborator.avatar_url }}
        size={size}
        ariaLabel={title}
        ringTone="none"
      />
    </span>
  )
}
