import { type Doc, XmlElement, type XmlFragment, XmlText } from "yjs"

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

// A note's text read from its Y.Doc, without an editor: each block on its own line, like the
// editor's getText() that getTitleAndPreview is normally fed. TipTap's Collaboration keeps the
// document in the "default" XML fragment.
export function docText(doc: Doc): string {
  return blockText(doc.getXmlFragment("default"))
}

function blockText(node: XmlFragment | XmlElement): string {
  return node
    .toArray()
    .map((child) => {
      if (child instanceof XmlText) {
        return (child.toDelta() as { insert: unknown }[])
          .map((part) => (typeof part.insert === "string" ? part.insert : ""))
          .join("")
      }
      return child instanceof XmlElement ? `\n${blockText(child)}\n` : ""
    })
    .join("")
}

// Blank = no text (whitespace only) and no image, whatever the blocks: an empty checklist, heading
// or code block is blank too (docs/plans/blank-notes.md E1, owner 2026-11-28). Same rule as the
// editor's isBlankDoc (editor/editor.tsx); change both together.
export function isBlankDocument(doc: Doc): boolean {
  const fragment = doc.getXmlFragment("default")
  return !blockText(fragment).trim() && !hasImage(fragment)
}

function hasImage(node: XmlFragment | XmlElement): boolean {
  return node
    .toArray()
    .some((child) => child instanceof XmlElement && (child.nodeName === "image" || hasImage(child)))
}
