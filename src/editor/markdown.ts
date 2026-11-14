import { Plugin } from "@tiptap/pm/state"
import { Extension, type Editor, type JSONContent } from "@tiptap/react"
import type { Doc } from "yjs"

import { NOTE_FULL, fitsInNote } from "@/editor/images"
import type { Notify } from "@/editor/notice"
import { MAX_IMAGE_BYTES } from "@/editor/shrink-image"
import { getTitleAndPreview } from "@/features/notes/note-meta"

// A line that starts like Markdown: heading, list, checklist, quote, fence, divider.
const BLOCK = /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\[[ xX]\]\s|(---|\*\*\*|___)\s*$)/m
// Inline Markdown: [text](url), **bold**, __bold__, ~~strike~~, `code`.
const INLINE = /\[[^\]\n]+\]\([^)\s]+\)|(\*\*|__)\S[^\n]*?\1|~~\S[^\n]*?~~|`[^`\n]+`/

export const looksLikeMarkdown = (text: string) => BLOCK.test(text) || INLINE.test(text)

const dataBytes = (src: unknown) =>
  typeof src === "string" && src.startsWith("data:") ? Math.ceil(src.length * 0.75) : 0

// Drops data images over the per-image limit; returns the content and the bytes of what is left.
function trimImages(content: JSONContent[]): {
  content: JSONContent[]
  bytes: number
  dropped: boolean
} {
  let bytes = 0
  let dropped = false
  const walk = (nodes: JSONContent[]): JSONContent[] =>
    nodes.flatMap((node) => {
      if (node.type === "image") {
        const size = dataBytes(node.attrs?.src)
        if (size > MAX_IMAGE_BYTES) {
          dropped = true
          return []
        }
        bytes += size
        return [node]
      }
      return [node.content ? { ...node, content: walk(node.content) } : node]
    })
  return { content: walk(content), bytes, dropped }
}

// Pasting plain text that looks like Markdown inserts it as formatted text (headings, checklists,
// links, code blocks…). Text with an HTML version (copied from a web page or another app) keeps the
// normal paste, and so does anything pasted inside a code block.
export const MarkdownPaste = Extension.create<{ doc: Doc | null; notify: Notify }>({
  name: "markdownPaste",

  addOptions() {
    return { doc: null, notify: () => {} }
  },

  addProseMirrorPlugins() {
    const { editor } = this
    const { doc, notify } = this.options
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData
            const text = data?.getData("text/plain") ?? ""
            if (!text || data?.types.includes("text/html")) return false
            if (view.state.selection.$from.parent.type.spec.code) return false
            if (!looksLikeMarkdown(text) || !editor.markdown) return false

            const parsed = editor.markdown.parse(text)
            const { content, bytes, dropped } = trimImages(parsed.content ?? [])
            if (doc && !fitsInNote(doc, bytes)) {
              notify(NOTE_FULL)
              return true
            }
            editor.chain().focus().insertContent(content).run()
            if (dropped) notify({ title: "A large image was left out" })
            return true
          },
        },
      }),
    ]
  },
})

export async function copyMarkdown(editor: Editor, notify: Notify) {
  try {
    await navigator.clipboard.writeText(editor.getMarkdown())
    notify({ title: "Copied as Markdown" })
  } catch {
    notify({ title: "Could not copy", description: "The browser did not allow it." })
  }
}

// File name from the note's first line, without characters file systems refuse.
export function downloadMarkdown(editor: Editor) {
  const { title } = getTitleAndPreview(editor.getText())
  const name =
    title
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "note"
  const url = URL.createObjectURL(new Blob([editor.getMarkdown()], { type: "text/markdown" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${name}.md`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
