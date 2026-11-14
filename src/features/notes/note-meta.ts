const MAX_TITLE = 100
const MAX_PREVIEW = 200

// Title = first non-empty line. Preview = the rest, whitespace collapsed. Both feed the note list
// and its search (docs/plans/phase-3-notes-list.md).
export function getTitleAndPreview(text: string): { title: string; preview: string } {
  const lines = text.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1) return { title: "", preview: "" }

  const title = lines[first].trim().slice(0, MAX_TITLE)
  const preview = lines
    .slice(first + 1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PREVIEW)
  return { title, preview }
}
