/**
 * SimilarAssessmentsPanel — Play 2 institutional-memory surface.
 *
 * Renders a small "Past patterns" card when the assessor's
 * historical assessments include comparable buildings. The match
 * shape comes from src/utils/assessmentSimilarity.js (pure
 * deterministic structural matching — facility type, HVAC, year
 * built, trigger, water history). No AI cost. No engine touch.
 *
 * Three render states:
 *
 *   1. NO HISTORY (pastCount < 3): hidden entirely. Surfacing
 *      "we don't have enough data" creates noise; just stay out
 *      of the way until the assessor has built up a corpus.
 *
 *   2. MATCHES FOUND (matchCount > 0): renders the aggregate
 *      pattern summary (avg score across similar past assessments,
 *      common immediate-priority recs, mold-detection rate) + a
 *      short list of the top match cards.
 *
 *   3. HAS HISTORY BUT NO MATCHES (pastCount ≥ 3 but matchCount
 *      === 0): renders a compact "no close matches yet" note so
 *      the assessor knows the lookup ran but didn't find a useful
 *      comparable. Honest about the negative.
 *
 * Advisory framing: every surfaced suggestion is hedged with
 * "consider", "in similar past assessments", "based on your own
 * history" — never authoritative. The deterministic engine still
 * drives every actual scoring decision; this panel is a memory
 * aid for the human.
 */

import { useSimilarAssessments } from '../hooks/useSimilarAssessments'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SURFACE = 'var(--surface)'

function scoreColor(score) {
  if (typeof score !== 'number') return DIM
  if (score >= 70) return '#15803D'
  if (score >= 50) return '#A16207'
  return '#B91C1C'
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SimilarAssessmentsPanel({ currentAssessment, onOpenPastAssessment }) {
  const { loading, patterns, matches, pastCount, error, currentFeatures } = useSimilarAssessments(currentAssessment)

  // Hide entirely when the assessor doesn't have enough history yet.
  // The threshold (3) is intentional: a 1-match aggregate isn't a
  // pattern, and "we found nothing yet" framing creates noise.
  if (loading) return null
  if (error) return null
  if (pastCount < 3) return null

  const noMatches = matches.length === 0
  const typeLabel = currentFeatures && currentFeatures.facilityType

  return (
    <div
      data-testid="similar-assessments-panel"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, letterSpacing: '-0.2px' }}>
          Past patterns
        </div>
        <div style={{ fontSize: 10, color: DIM, fontFamily: 'var(--font-mono)' }}>
          From your last {pastCount} assessment{pastCount === 1 ? '' : 's'}
        </div>
      </div>

      {noMatches && (
        <div style={{ fontSize: 12, color: SUB, lineHeight: 1.55 }}>
          No close comparables in your history yet
          {typeLabel ? ` for ${typeLabel} buildings` : ''}. Patterns surface here once you have
          several assessments with similar building type + HVAC topology + trigger reason.
        </div>
      )}

      {!noMatches && (
        <>
          <div style={{ fontSize: 11, color: SUB, lineHeight: 1.55, marginBottom: 10 }}>
            {matches.length} similar past assessment{matches.length === 1 ? '' : 's'}
            {typeLabel ? ` (${typeLabel})` : ''}. Advisory only; based on your own historical
            findings. Compare with caution; every building is different.
          </div>

          {/* Pattern summary chips — avg score, common recs, mold rate */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {patterns.averageScore !== null && (
              <div
                title="Average composite score across the similar past assessments"
                style={{ padding: '4px 10px', borderRadius: 999, background: SURFACE, border: `1px solid ${BORDER}`, fontSize: 11, color: TEXT }}
              >
                Avg score{' '}
                <strong style={{ color: scoreColor(patterns.averageScore) }}>
                  {patterns.averageScore}/100
                </strong>
              </div>
            )}
            {typeof patterns.moldRate === 'number' && patterns.moldRate > 0 && (
              <div
                title="Mold detected in this many of the similar past assessments"
                style={{ padding: '4px 10px', borderRadius: 999, background: SURFACE, border: `1px solid ${BORDER}`, fontSize: 11, color: TEXT }}
              >
                Mold rate <strong>{patterns.moldRate}%</strong>
              </div>
            )}
          </div>

          {patterns.commonImmediateActions.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SUB, marginBottom: 4 }}>
                Recurring immediate-priority actions you may want to verify:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: TEXT, lineHeight: 1.6 }}>
                {patterns.commonImmediateActions.map((a) => (
                  <li key={a.action}>
                    {a.action}{' '}
                    <span style={{ fontSize: 10, color: DIM }}>
                      ({a.count} of {matches.length} similar)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top match cards — clickable to open the past assessment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.slice(0, 3).map((m) => {
              const facility = m.summary && m.summary.facilityName
              const score = m.summary && m.summary.score
              const date = m.summary && formatDate(m.summary.composedAt)
              const immCount = m.summary && m.summary.immediateCount
              const similarityPct = Math.round(m.score * 100)
              const Card = onOpenPastAssessment ? 'button' : 'div'
              return (
                <Card
                  key={m.id || Math.random()}
                  onClick={onOpenPastAssessment ? () => onOpenPastAssessment(m.id) : undefined}
                  style={{
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    cursor: onOpenPastAssessment ? 'pointer' : 'default',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    color: TEXT,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {facility || 'Untitled site'}
                    </div>
                    <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>
                      {date}
                      {immCount > 0 ? ` · ${immCount} immediate-priority` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {typeof score === 'number' && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor(score) }}>{score}/100</div>
                    )}
                    <div style={{ fontSize: 9, color: ACCENT, fontFamily: 'var(--font-mono)' }}>
                      {similarityPct}% match
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
