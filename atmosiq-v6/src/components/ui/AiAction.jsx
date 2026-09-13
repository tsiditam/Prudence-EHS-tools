/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AiAction — a contextual AtmosFlow AI action, in place.
 *
 *   <AiAction label="Refine" onClick={() => askAI('Refine the executive summary…')} />
 *
 * The one control on a screen that carries the AI mark: the AtmosFlow AI
 * brain (the mark beside the wordmark in the menu, and the launcher's
 * glyph) beside a short verb in the primary ink, no fill, no edge, the
 * raised tone on hover. It sits where the AI is useful — beside a section it can
 * rewrite, a finding set it can relate, a chart it can explain — and its
 * click opens the assistant with the question already asked, with the
 * screen the user is looking at as the evidence. The AI is marked by its
 * glyph, so the label stays a plain verb ("Refine", not "Ask AI to refine").
 */
import JasperBrainIcon from '../JasperBrainIcon'

if (typeof document !== 'undefined' && !document.getElementById('afai-style')) {
  const s = document.createElement('style')
  s.id = 'afai-style'
  s.textContent = `
    .af-ai-action { transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
    @media (hover: hover) and (pointer: fine) { .af-ai-action:hover:not(:disabled) { background: var(--raised) !important; } }
    .af-ai-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .af-ai-action:disabled { opacity: 0.5; cursor: not-allowed; }
  `
  document.head.appendChild(s)
}

export default function AiAction({ label, onClick, disabled = false, title, style }) {
  return (
    <button
      type="button"
      className="af-ai-action"
      onClick={onClick}
      disabled={disabled}
      title={title || `Ask AtmosFlow AI: ${label}`}
      aria-label={`${label} with AtmosFlow AI`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 8px',
        borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text)',
        whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
        ...style,
      }}>
      <JasperBrainIcon size={16} animate={false} />
      <span>{label}</span>
    </button>
  )
}
