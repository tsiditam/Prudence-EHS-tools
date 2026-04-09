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
    menu:     <svg {...p}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    save:     <svg {...p}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
    layers:   <svg {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    // ─── Assessment Icon Family ───
    airflow:  <svg {...p}><path d="M17.7 7.7A2.5 2.5 0 1119 10H2"/><path d="M9.6 4.6A2 2 0 1111 7H2"/><path d="M12.6 19.4A2 2 0 1014 17H2"/></svg>,
    moisture: <svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>,
    thermo:   <svg {...p}><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/></svg>,
    hvac:     <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 12h4l2-3 2 3h4"/><path d="M2 8h20"/></svg>,
    person:   <svg {...p}><circle cx="12" cy="5" r="3"/><path d="M12 8v4M9 20l3-8 3 8M7 14h10"/></svg>,
    symptom:  <svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    notes:    <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>,
    target:   <svg {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    cal:      <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    location: <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    gauge:    <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>,
    droplet:  <svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" fill={c} fillOpacity=".08"/><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>,
    people:   <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    mic:      <svg {...p}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>,
    eye:      <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    door:     <svg {...p}><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 12h.01"/><path d="M12 2v20"/></svg>,
    filter:   <svg {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    mold:     <svg {...p}><circle cx="12" cy="12" r="3"/><circle cx="6" cy="8" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/></svg>,
    weather:  <svg {...p}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>,
    pressure: <svg {...p}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
    wrench:   <svg {...p}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
    serial:   <svg {...p}><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01"/></svg>,
    gap:      <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
    report:   <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 18v-4M12 18v-6M16 18v-2"/></svg>,
    template: <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    draft:    <svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    guidance: <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  }
  return icons[n] || null
}

/**
 * Emoji-to-icon mapping for assessment questions.
 * Maps Unicode emoji characters to SVG icon names for premium rendering.
 */
export const emojiToIcon = {
  '👤': 'user', '🎓': 'shield', '📅': 'cal', '📏': 'gauge',
  '🔢': 'serial', '🔧': 'wrench', '✅': 'check', '🧪': 'flask',
  '🛠️': 'wrench', '🎯': 'target', '📝': 'notes', '⚡': 'bolt',
  '📄': 'notes', '🌊': 'moisture', '🕐': 'clock', '👃': 'search',
  '🏗️': 'bldg', '🛡️': 'shield', '🏛️': 'bldg', '📁': 'clip',
  '📋': 'findings', '📐': 'layers', '🌬️': 'airflow', '📊': 'chart',
  '🖥️': 'template', '🔄': 'refresh', '💧': 'droplet', '🧴': 'flask',
  '🌡️': 'thermo', '☀️': 'weather', '🌧️': 'weather', '🏢': 'bldg',
  '📍': 'location', '❄️': 'hvac', '💨': 'airflow', '🌀': 'pressure',
  '🔃': 'refresh', '⚠️': 'alert', '🌫️': 'eye', '🚿': 'moisture',
  '🦠': 'mold', '👥': 'people', '🪑': 'bldg', '🗣️': 'mic',
  '🩺': 'symptom', '🏠': 'home', '📌': 'location', '🚪': 'door',
  '🪣': 'droplet', '🫧': 'filter', '🔍': 'search', '🔎': 'search',
  '🏭': 'bldg', '⏱️': 'clock',
}