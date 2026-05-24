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

import {
  ClipboardCheck, Link2, FlaskConical, Activity, Zap, Play, Check, Building2,
  BarChart3, Wind, Home, Clipboard, Clock, Search, ShieldCheck, User, Download,
  Upload, Send, RefreshCw, AlertTriangle, Trash2, Flag, Menu, Save, Layers,
  Droplets, Droplet, Thermometer, AirVent, PersonStanding, HeartPulse, FileText,
  Target, Calendar, MapPin, Gauge, Users, Mic, Eye, DoorClosed, Filter, Cloud,
  Wrench, Barcode, AlertCircle, ScrollText, LayoutTemplate, SquarePen, Info,
  Settings, HelpCircle, MoreHorizontal, Sun, Moon, LogOut, Sparkles, Paperclip,
  Image, X,
} from 'lucide-react'

// Premium icon set — Lucide (the set Obsidian ships), wrapped behind the
// existing <I n s c w /> API so every call site stays unchanged: `n` maps
// to a Lucide component, `s`=size, `c`=color, `w`=strokeWidth.
const LUCIDE = {
  findings: ClipboardCheck, chain: Link2, flask: FlaskConical, pulse: Activity,
  bolt: Zap, play: Play, check: Check, bldg: Building2, chart: BarChart3,
  wind: Wind, airflow: Wind, home: Home, clip: Clipboard, clock: Clock,
  search: Search, shield: ShieldCheck, user: User, download: Download,
  upload: Upload, send: Send, refresh: RefreshCw, alert: AlertTriangle,
  trash: Trash2, flag: Flag, menu: Menu, save: Save, layers: Layers,
  moisture: Droplets, droplet: Droplet, thermo: Thermometer, hvac: AirVent,
  person: PersonStanding, symptom: HeartPulse, notes: FileText, target: Target,
  cal: Calendar, location: MapPin, gauge: Gauge, people: Users, mic: Mic,
  eye: Eye, door: DoorClosed, filter: Filter, weather: Cloud, wrench: Wrench,
  serial: Barcode, gap: AlertCircle, report: ScrollText, template: LayoutTemplate,
  draft: SquarePen, guidance: Info, gear: Settings, help: HelpCircle,
  dots: MoreHorizontal, sun: Sun, moon: Moon, logout: LogOut, sparkle: Sparkles,
  paperclip: Paperclip, image: Image, x: X,
}

// Domain-specific glyphs with no clean Lucide match — kept as custom
// strokes on the same 24-grid with round joins so they read correctly:
// a spore cluster for mould / microbial, and a radial burst for building
// pressure.
const CUSTOM = {
  mold: (p) => <svg {...p}><circle cx="12" cy="12" r="3"/><circle cx="6" cy="8" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/></svg>,
  pressure: (p) => <svg {...p}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
}

export const I = ({ n, s = 18, c = 'currentColor', w = 1.8 }) => {
  const L = LUCIDE[n]
  if (L) return <L size={s} color={c} strokeWidth={w} />
  const C = CUSTOM[n]
  if (C) {
    const p = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' }
    return C(p)
  }
  return null
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
  // Previously-unmapped question icons (were rendering as raw iOS emoji).
  '🔬': 'flask', '⚗️': 'flask', '📮': 'flag', '🗺️': 'location',
  '🔨': 'wrench', '💼': 'bldg', '🏙️': 'bldg', '🏷️': 'flag',
}

// Resolve an emoji to an SVG icon name, tolerant of the U+FE0F variation
// selector (so '🏗️' and '🏗' both resolve). Returns null when unmapped,
// so callers can decide on a fallback.
const _normEmojiToIcon = Object.fromEntries(
  Object.entries(emojiToIcon).map(([k, v]) => [k.replace(/[\uFE00-\uFE0F]/g, ''), v])
)
export function iconForEmoji(emoji) {
  if (!emoji) return null
  return emojiToIcon[emoji] || _normEmojiToIcon[emoji.replace(/[\uFE00-\uFE0F]/g, '')] || null
}
