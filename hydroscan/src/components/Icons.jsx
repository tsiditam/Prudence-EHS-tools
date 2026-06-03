/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * HydroScan icon system. The brand `Logo` (water drop + analysis pulse) stays a
 * hand-drawn SVG; the inline icon set `I` is now backed by lucide-react (the
 * same family AtmosFlow uses). `I` keeps its original prop shape
 * ({ n, s, c, w }) so every existing call site renders lucide icons with no
 * change. Unknown names render nothing (parity with the old behavior).
 */

import {
  Droplet, FlaskConical, ShieldCheck, TriangleAlert, Check, Building2,
  BarChart3, ClipboardList, Clock, Search, Zap, User, Send, Home, Wrench,
  Biohazard, Container, RefreshCw, Download, Link, Activity, Settings, CircleHelp, PlayCircle, Menu,
} from 'lucide-react'

// HydroScan Logo — water drop with pulse/analysis line (brand mark, kept SVG).
export const Logo = ({ s = 40 }) => (
  <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="hs-pulse" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#0D9488" />
        <stop offset="50%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#5EEAD4" />
      </linearGradient>
      <clipPath id="hs-clip"><path d="M50 8 C50 8, 85 42, 85 58 A35 35 0 1 1 15 58 C15 42, 50 8, 50 8Z" /></clipPath>
    </defs>
    <path d="M50 8 C50 8, 85 42, 85 58 A35 35 0 1 1 15 58 C15 42, 50 8, 50 8Z" stroke="#0D9488" strokeWidth="5" fill="none" strokeLinejoin="round" />
    <g clipPath="url(#hs-clip)" opacity=".12" stroke="#14B8A6" strokeWidth=".8">
      <line x1="20" y1="48" x2="80" y2="48" /><line x1="20" y1="58" x2="80" y2="58" /><line x1="20" y1="68" x2="80" y2="68" />
      <line x1="35" y1="35" x2="35" y2="80" /><line x1="50" y1="35" x2="50" y2="80" /><line x1="65" y1="35" x2="65" y2="80" />
    </g>
    <polyline points="22,58 34,58 40,44 48,70 55,38 62,62 70,54 80,54" stroke="url(#hs-pulse)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="22" cy="58" r="3.5" fill="#0D9488" stroke="#080A0E" strokeWidth="1.5" />
  </svg>
);

// name → lucide icon. Names mirror the original hand-rolled set so call sites
// (<I n="drop" .../>) are unchanged.
const ICONS = {
  drop: Droplet,
  flask: FlaskConical,
  shield: ShieldCheck,
  alert: TriangleAlert,
  check: Check,
  bldg: Building2,
  chart: BarChart3,
  clip: ClipboardList,
  clock: Clock,
  search: Search,
  bolt: Zap,
  user: User,
  send: Send,
  home: Home,
  pipe: Wrench,        // plumbing
  bacteria: Biohazard, // microbial
  well: Container,     // water source / well / cistern
  refresh: RefreshCw,
  download: Download,
  chain: Link,
  pulse: Activity,
  gear: Settings,
  help: CircleHelp,
  play: PlayCircle,
  menu: Menu,
};

export const I = ({ n, s = 18, c = 'currentColor', w = 1.8 }) => {
  const Ic = ICONS[n];
  return Ic ? <Ic size={s} color={c} strokeWidth={w} /> : null;
};
