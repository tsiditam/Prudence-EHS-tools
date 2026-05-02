/**
 * TimePickerInput — locale-aware time picker for assessment questions.
 *
 * Wraps MUI X TimePicker so it visually matches the rest of the
 * inline-styled assessment flow. Defaults to the clock-dial view but
 * keeps the keyboard-input toggle visible so a user can type a time
 * if they prefer.
 *
 * 12h vs 24h is decided from the browser's locale via Intl, not
 * hardcoded — assessors in en-US see 2:15 PM, assessors in de-DE see
 * 14:15.
 *
 * Value contract: stores a locale-formatted string (e.g. "2:15 PM"
 * or "14:15") so the existing storage / DOCX / report layers don't
 * need to change. They were already string-typed.
 */

import { useMemo, useState } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import dayjs from 'dayjs'

const BG = '#07080C'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const DIM = '#6B7380'

// MUI dark theme matching the assessment-flow palette so the dialog
// renders dark surfaces and cyan accents instead of MUI's defaults.
const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: BG, paper: CARD },
    primary: { main: ACCENT },
    text: { primary: TEXT, secondary: DIM },
  },
  components: {
    MuiClock: { styleOverrides: { clock: { backgroundColor: '#1A1D24' } } },
  },
})

// Detect whether the browser's locale prefers 12-hour (am/pm) or
// 24-hour formatting. Intl exposes hour12 in resolvedOptions when
// the platform supports it; fall back by sniffing the formatted
// string for AM/PM markers.
function localePrefers12h() {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
    const opts = fmt.resolvedOptions()
    if (typeof opts.hour12 === 'boolean') return opts.hour12
    return /am|pm/i.test(fmt.format(new Date(2020, 0, 1, 13, 0)))
  } catch {
    return true
  }
}

// Parse the stored string back into a dayjs object so the picker can
// reopen at the previously selected time. Accepts both "2:15 PM" and
// "14:15" forms; returns null for empty / unparseable input.
function parseStored(value) {
  if (!value) return null
  const s = String(value).trim()
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const isPm = /pm/i.test(ampm[3])
    if (h === 12) h = 0
    if (isPm) h += 12
    return dayjs().hour(h).minute(m).second(0)
  }
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    return dayjs().hour(parseInt(h24[1], 10)).minute(parseInt(h24[2], 10)).second(0)
  }
  return null
}

export default function TimePickerInput({ value, onChange, placeholder = 'Select time…' }) {
  const ampm = useMemo(localePrefers12h, [])
  const [open, setOpen] = useState(false)
  const dayjsValue = useMemo(() => parseStored(value), [value])

  const handleAccept = (next) => {
    if (!next) return
    const formatted = ampm ? next.format('h:mm A') : next.format('HH:mm')
    onChange(formatted)
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <TimePicker
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          value={dayjsValue}
          onAccept={handleAccept}
          ampm={ampm}
          views={['hours', 'minutes']}
          // Keep the keyboard-input toggle in the dialog toolbar so a
          // user can switch from clock dial to numeric typing.
          slotProps={{
            textField: {
              fullWidth: true,
              placeholder,
              onClick: () => setOpen(true),
              InputProps: { readOnly: true },
              sx: {
                '& .MuiInputBase-root': {
                  background: CARD,
                  border: `1.5px solid ${BORDER}`,
                  borderRadius: '14px',
                  color: TEXT,
                  fontSize: '17px',
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 500,
                  padding: '6px 8px',
                  '&:hover': { borderColor: ACCENT },
                  '&.Mui-focused': { borderColor: ACCENT },
                },
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                '& .MuiInputBase-input': {
                  padding: '12px 12px',
                  cursor: 'pointer',
                  color: TEXT,
                },
                '& .MuiInputAdornment-root .MuiIconButton-root': { color: ACCENT },
              },
            },
            // Show the toolbar (keyboard toggle lives there).
            toolbar: { hidden: false },
            actionBar: { actions: ['cancel', 'accept'] },
          }}
        />
      </LocalizationProvider>
    </ThemeProvider>
  )
}
