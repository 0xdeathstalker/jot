const MAX_TITLE = 100
const MAX_PREVIEW = 200

export type NoteText = { title: string; preview: string; chars: number }

// Title = first non-empty line. Preview = the rest, whitespace collapsed. Both feed the note list's
// search (docs/plans/phase-3-notes-list.md). Chars = every character in the note except line breaks,
// counted by code point (an emoji is 1), for the list's "N characters".
export function getTitleAndPreview(text: string): NoteText {
  const chars = [...text.replace(/\n/g, "")].length
  const lines = text.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1) return { title: "", preview: "", chars }

  const title = lines[first].trim().slice(0, MAX_TITLE)
  const preview = lines
    .slice(first + 1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PREVIEW)
  return { title, preview, chars }
}
