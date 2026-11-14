import type { Editor } from "@tiptap/react"

// One placeholder character per leaf node (U+FFFC, object replacement character).
const OBJECT_CHAR = String.fromCharCode(0xfffc)

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}\p{M}_]/u.test(ch)

// Selects the word the cursor is in or touching. False when there is no word next to the cursor
// (empty line, between spaces). Leaf nodes (line breaks) count as one non-word character, so text
// offsets match document positions inside the block.
export function selectWordAtCursor(editor: Editor): boolean {
  const { $from } = editor.state.selection
  const block = $from.parent
  if (!block.isTextblock) return false
  const text = block.textBetween(0, block.content.size, undefined, OBJECT_CHAR)
  let start = $from.parentOffset
  let end = start
  while (start > 0 && isWordChar(text[start - 1])) start--
  while (end < text.length && isWordChar(text[end])) end++
  if (start === end) return false
  editor.commands.setTextSelection({ from: $from.start() + start, to: $from.start() + end })
  return true
}
