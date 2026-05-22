/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProfileAvatar — circular avatar primitive for the assessor account
 * surface. Modeled after the GitHub / Linear / Notion pattern: small
 * persistent avatar in the app header, larger version on the Account
 * row in Settings, largest version on the profile edit form.
 *
 *   <ProfileAvatar profile={profile} size={32} onClick={openSettings} />
 *   <ProfileAvatar profile={profile} size={96} editable
 *                  onPickPhoto={(dataUrl) => updateProfile({ avatar_url: dataUrl })} />
 *
 * When `profile.avatar_url` is set the photo renders inside the
 * circle; otherwise the initials extracted from `profile.name` (or
 * email, as a last resort) render on an accent-tinted gradient. The
 * accent ring + faint shadow give the avatar premium polish without
 * a new visual system.
 *
 * The `editable` mode overlays a small camera button in the bottom-
 * right corner and drives a hidden file input. Files are compressed
 * to ≤256×256 JPEG at ~85% quality via canvas before being passed
 * back to the parent through `onPickPhoto(dataUrl)` — keeps the
 * resulting data URL small enough to round-trip through localStorage
 * without bloating the profile record.
 */

import { useRef } from 'react'

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_INPUT_BYTES = 8 * 1024 * 1024 // 8MB before downscale; output is far smaller
const TARGET_MAX_DIM = 256
const JPEG_QUALITY = 0.85

/**
 * Derive 1–2 initials from a profile. Strips credential suffixes
 * (everything after the first comma — "J. Smith, CIH, CSP" → "J. Smith")
 * and single-letter initials with periods so "J. Smith" yields "S" not
 * "JS". Falls back to the email local-part when no name is set.
 */
export function getInitials(profile) {
  const raw = (profile?.name || profile?.email || '').trim()
  if (!raw) return '?'
  // Strip credential suffix after first comma.
  const before = raw.split(',')[0].trim()
  if (!before) return raw[0].toUpperCase()
  // Drop single-letter "J." style initials so we lean on real words.
  const words = before
    .split(/\s+/)
    .filter((w) => w && !/^[A-Za-z]\.?$/.test(w))
  if (words.length === 0) {
    // All tokens were initials — just take the first letter of the
    // first one ("J. Smith" → "J").
    return before.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '?'
  }
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * Read a File and resolve to a downscaled JPEG data URL suitable for
 * localStorage persistence. Uses a canvas to fit the image inside a
 * 256×256 bounding box (preserving aspect ratio) and encodes JPEG at
 * 85% quality — a typical 4MB phone photo collapses to under 30KB.
 */
async function compressToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const ratio = Math.min(1, TARGET_MAX_DIM / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * ratio))
        const h = Math.max(1, Math.round(img.height * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('canvas_unavailable'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        URL.revokeObjectURL(objectUrl)
        resolve(dataUrl)
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image_load_failed'))
    }
    img.src = objectUrl
  })
}

export default function ProfileAvatar({
  profile,
  size = 40,
  onClick,
  editable = false,
  onPickPhoto,
  ariaLabel,
  ringTone = 'soft', // 'soft' | 'accent' | 'none'
  style = {},
}) {
  const fileInputRef = useRef(null)
  const initials = getInitials(profile)
  const photo = profile?.avatar_url
  const interactive = typeof onClick === 'function' || editable

  // Sizing scales: font size, camera-badge size, and outer ring all
  // derive from the avatar size so callers only pass one number.
  const fontSize = Math.max(12, Math.round(size * 0.42))
  const badgeSize = Math.max(20, Math.round(size * 0.34))
  const ringWidth = ringTone === 'none' ? 0 : (size >= 64 ? 2 : 1.5)

  const ringColor =
    ringTone === 'accent'
      ? 'var(--accent)'
      : ringTone === 'soft'
      ? 'color-mix(in srgb, var(--accent) 28%, transparent)'
      : 'transparent'

  const handlePick = async (e) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    if (!ACCEPTED_MIME.includes(file.type)) {
      // The parent decides how to surface this; we just bail.
      return
    }
    if (file.size > MAX_INPUT_BYTES) return
    try {
      const dataUrl = await compressToDataUrl(file)
      onPickPhoto?.(dataUrl)
    } catch {
      // Silent failure — parent can listen for the next call to
      // re-try if needed. A future iteration can surface a toast.
    }
  }

  const containerBase = {
    position: 'relative',
    width: size,
    height: size,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
  }

  const avatarStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: photo
      ? 'transparent'
      : 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 25%, transparent), color-mix(in srgb, var(--accent) 6%, transparent))',
    border: ringWidth ? `${ringWidth}px solid ${ringColor}` : 'none',
    boxShadow: size >= 64
      ? '0 4px 12px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)'
      : '0 1px 2px rgba(0,0,0,0.18)',
    color: 'var(--text)',
    fontSize,
    fontWeight: 700,
    letterSpacing: '-0.3px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: interactive ? 'pointer' : 'default',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
  }

  const inner = photo ? (
    <img
      src={photo}
      alt=""
      aria-hidden="true"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  ) : (
    <span aria-hidden="true">{initials}</span>
  )

  const handleClick = () => {
    if (editable) {
      fileInputRef.current?.click()
    } else if (onClick) {
      onClick()
    }
  }

  const label =
    ariaLabel
      || (editable ? 'Change profile photo' : profile?.name
        ? `Account: ${profile.name}`
        : 'Open account')

  return (
    <span style={{ ...containerBase, ...style }}>
      <button
        type="button"
        onClick={interactive ? handleClick : undefined}
        aria-label={label}
        title={label}
        disabled={!interactive}
        style={{
          ...avatarStyle,
          border: avatarStyle.border,
          padding: 0,
          background: avatarStyle.background,
        }}
      >
        {inner}
      </button>

      {editable && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePick}
            style={{ display: 'none' }}
            data-testid="profile-avatar-file-input"
            aria-hidden="true"
          />
          {/* Camera badge — bottom-right corner. Tapping it triggers
              the same file picker as tapping the avatar itself, so
              callers don't need to wire two affordances. */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: badgeSize,
              height: badgeSize,
              borderRadius: '50%',
              background: 'var(--accent-fill)',
              border: '2px solid var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            }}
          >
            <svg
              width={Math.round(badgeSize * 0.5)}
              height={Math.round(badgeSize * 0.5)}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--on-accent-fill)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
        </>
      )}
    </span>
  )
}
