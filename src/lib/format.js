const TZ = 'Europe/London'

/** 12 MAR 2026 — pinned to UK time so a UTC build server can't shift the day. */
export const fmtDate = (d, month = 'short') =>
  new Date(d)
    .toLocaleDateString('en-GB', { day: '2-digit', month, year: 'numeric', timeZone: TZ })
    .toUpperCase()

/** ~225 wpm, ~6 characters per word. */
export const readMinutes = (chars = 0) => Math.max(1, Math.round(chars / 6 / 225))

export const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const slugify = (s = '') =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
