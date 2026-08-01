/**
 * AtmosFlow DOCX Report — Style Constants
 * Mirrors the HTML report typography and color system
 */

export const FONTS = {
  // The body face is APTOS, the Microsoft 365 default since 2024.
  //
  // OOXML has no font stack: `w:rFonts` names ONE family, and a reader that
  // does not have it substitutes something of its own choosing. So the only
  // way a generated document looks the way it was designed is to name a face
  // the reader already has. Inter — the product's screen font — is not
  // installed with Word, so every recipient without it saw an arbitrary
  // substitution, which is why generated reports did not match the reviewed
  // design on other people's machines.
  //
  // Aptos is not universal either: perpetual Office builds (2019/2021),
  // LibreOffice and Pages will still substitute. But it is present for the
  // audience that actually opens these files, and that is the whole of the
  // improvement being claimed here.
  //
  // Serif display (Newsreader) and mono (DM Mono) are unchanged. Neither
  // ships with Word, so both still substitute; changing them is a
  // typographic decision rather than a rendering fix, and belongs to
  // whoever owns the visual system.
  body: 'Aptos',
  heading: 'Newsreader',
  mono: 'DM Mono',
}

export const COLORS = {
  text: '1B2A41',
  body: '2D3A4A',
  sub: '5C6F7E',
  muted: '7A8A97',
  light: '94A3B8',
  border: 'D1D5DB',
  bgLight: 'F3F4F6',
  bgMed: 'E5E7EB',
  accent: '1B2A41',
  accentDark: '0F1A2A',
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
