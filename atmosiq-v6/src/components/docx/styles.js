/**
 * AtmosFlow DOCX Report — Style Constants
 * Mirrors the HTML report typography and color system
 */

export const FONTS = {
  body: 'Calibri',
  mono: 'Consolas',
}

export const COLORS = {
  text: '0F172A',
  body: '1E293B',
  sub: '475569',
  muted: '64748B',
  light: '94A3B8',
  border: 'E2E8F0',
  bgLight: 'F8FAFC',
  bgMed: 'F1F5F9',
  accent: '0E7490',
  accentDark: '0C4A6E',
  brand: '22D3EE',
  white: 'FFFFFF',
  black: '000000',
}

export const SEV_COLORS = {
  critical: 'B91C1C',
  high: 'C2410C',
  medium: 'A16207',
  low: '0E7490',
  pass: '15803D',
  info: '475569',
}

export function scoreColor(s) {
  return s >= 70 ? '15803D' : s >= 50 ? 'A16207' : 'B91C1C'
}

export function riskLabel(s) {
  return s >= 80 ? 'Low Risk' : s >= 60 ? 'Moderate' : s >= 40 ? 'High Risk' : 'Critical'
}

export const DOCX_STYLES = {
  default: {
    document: {
      run: { font: FONTS.body, size: 22, color: COLORS.body },
      paragraph: { spacing: { after: 120, line: 276 } },
    },
    heading1: {
      run: { font: FONTS.body, size: 40, bold: true, color: COLORS.text },
      paragraph: { spacing: { before: 0, after: 200 } },
    },
    heading2: {
      run: { font: FONTS.body, size: 26, bold: true, color: COLORS.text },
      paragraph: {
        spacing: { before: 360, after: 160 },
        border: { bottom: { style: 'single', size: 1, color: COLORS.border } },
      },
    },
    heading3: {
      run: { font: FONTS.body, size: 24, bold: true, color: '334155' },
      paragraph: { spacing: { before: 240, after: 80 } },
    },
  },
}
