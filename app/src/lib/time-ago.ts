const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
]

// "just now", "5 minutes ago", "yesterday", "2 months ago". Computed at render: it can lag until the
// list re-renders (any note change or click), which is fine for a list.
export function timeAgo(time: number) {
  const seconds = (time - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return "just now"
}
