/**
 * AtmosFlow IH Directory — Neutral, non-ranking professional directory
 * Random rotation per page load. No paid placements.
 * // Paid placement is explicitly prohibited per AtmosFlow credibility policy.
 */

import { useState, useMemo } from 'react'

const CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'

const DIRECTORY_DATA = [
  { name: 'Placeholder CIH Professional A', credentials: ['CIH'], city: 'Bethesda', state: 'MD', contact: 'contact@example.com', aiha: 'AIHA-0001' },
  { name: 'Placeholder CSP Professional B', credentials: ['CIH', 'CSP'], city: 'Arlington', state: 'VA', contact: 'contact@example.com', aiha: 'AIHA-0002' },
  { name: 'Placeholder CHMM Professional C', credentials: ['CIH', 'CHMM'], city: 'Washington', state: 'DC', contact: 'contact@example.com', aiha: 'AIHA-0003' },
  { name: 'Placeholder CIH Professional D', credentials: ['CIH'], city: 'Silver Spring', state: 'MD', contact: 'contact@example.com', aiha: 'AIHA-0004' },
  { name: 'Placeholder IH Professional E', credentials: ['CIH', 'CSP'], city: 'Rockville', state: 'MD', contact: 'contact@example.com', aiha: 'AIHA-0005' },
  { name: 'Placeholder CIH Professional F', credentials: ['CIH'], city: 'Fairfax', state: 'VA', contact: 'contact@example.com', aiha: 'AIHA-0006' },
  { name: 'Placeholder IH Professional G', credentials: ['CIH', 'CIEC'], city: 'Baltimore', state: 'MD', contact: 'contact@example.com', aiha: 'AIHA-0007' },
  { name: 'Placeholder CIH Professional H', credentials: ['CIH'], city: 'Frederick', state: 'MD', contact: 'contact@example.com', aiha: 'AIHA-0008' },
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function IHDirectory({ onBack }) {
  const [search, setSearch] = useState('')
  const randomized = useMemo(() => shuffle(DIRECTORY_DATA), [])

  const filtered = search.trim()
    ? randomized.filter(p =>
        p.city.toLowerCase().includes(search.toLowerCase()) ||
        p.state.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : randomized

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back</button>
      <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Find a Professional</div>
      <div style={{ fontSize: 11, color: SUB, marginBottom: 16 }}>AIHA/ABIH-credentialed industrial hygienists</div>

      {/* Disclaimer */}
      <div style={{ padding: 12, background: `${ACCENT}06`, border: `1px solid ${ACCENT}18`, borderRadius: 8, marginBottom: 16, fontSize: 10, color: SUB, lineHeight: 1.6 }}>
        AtmosFlow does not endorse specific professionals. This directory is provided as a starting point for finding credentialed industrial hygiene expertise in your area.
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by city, state, or name..."
        style={{ width: '100%', padding: '12px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
      />

      {/* Results */}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: DIM, fontSize: 13 }}>No professionals found matching your search.</div>}
      {filtered.map((p, i) => (
        <div key={i} style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{p.name}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {p.credentials.map(c => (
              <span key={c} style={{ padding: '2px 8px', borderRadius: 4, background: `${ACCENT}12`, color: ACCENT, fontSize: 9, fontWeight: 600 }}>{c}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: SUB }}>{p.city}, {p.state}</div>
          <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{p.contact}</div>
          {p.aiha && <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>AIHA #{p.aiha}</div>}
        </div>
      ))}

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 9, color: DIM }}>
        Directory order is randomized. No paid or promoted listings.
      </div>
    </div>
  )
}
