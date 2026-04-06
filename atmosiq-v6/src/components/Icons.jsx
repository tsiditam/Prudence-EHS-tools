export const I = ({ n, s=18, c='currentColor', w=1.8 }) => {
  const p = { width:s, height:s, viewBox:'0 0 24 24', fill:'none', stroke:c, strokeWidth:w, strokeLinecap:'round', strokeLinejoin:'round' }
  const icons = {
    findings: <svg {...p}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>,
    chain:    <svg {...p}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 8.5L15.5 15.5"/></svg>,
    flask:    <svg {...p}><path d="M9 3v6l-2 4v5a2 2 0 002 2h6a2 2 0 002-2v-5l-2-4V3"/><path d="M9 3h6"/><path d="M7 13h10"/></svg>,
    pulse:    <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h3l1.5-3 2 6 1.5-3H19" strokeWidth="2"/></svg>,
    bolt:     <svg {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={c} fillOpacity=".12"/><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    check:    <svg {...p}><path d="M20 6L9 17l-5-5" strokeWidth="2.5"/></svg>,
    bldg:     <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><line x1="8" y1="6" x2="8" y2="6.01" strokeWidth="2.5"/></svg>,
    chart:    <svg {...p}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    wind:     <svg {...p}><path d="M17.7 7.7A2.5 2.5 0 1119 10H2"/><path d="M9.6 4.6A2 2 0 1111 7H2"/><path d="M12.6 19.4A2 2 0 1014 17H2"/></svg>,
    home:     <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>,
    clip:     <svg {...p}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
    clock:    <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    search:   <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    shield:   <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>,
    user:     <svg {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    download: <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    send:     <svg {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    refresh:  <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
    alert:    <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>,
    flag:     <svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  }
  return icons[n] || null
}