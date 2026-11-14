import Image from "@tiptap/extension-image"
import { Fragment, type Node as PMNode, Slice } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { type Doc, encodeStateAsUpdate } from "yjs"

import type { Notice } from "@/editor/notice"
import { ImageError, MAX_IMAGE_BYTES, shrinkImage } from "@/editor/shrink-image"

// The server keeps a note in one SQLite row (max 8 MB, docs/project-context.md §11). Images live
// inside the note, so stop adding them well before that.
export const MAX_NOTE_BYTES = 4 * 1024 * 1024

type Notify = (notice: Notice | null) => void

const SAFE_SRC = /^(data:image\/(png|jpeg|webp|gif);base64,|https:\/\/)/i

export const isSafeImageSrc = (src: unknown): src is string =>
  typeof src === "string" && SAFE_SRC.test(src)

// Base64 length -> bytes (close enough for the limits).
const dataBytes = (src: string) => (src.startsWith("data:") ? Math.ceil(src.length * 0.75) : 0)

// Block images, data URLs allowed. Only our own data URLs and https:// images are accepted:
// anything else (javascript:, data:image/svg+xml, http:) is dropped when pasted and never rendered,
// even if another client wrote it into the shared doc.
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) => ({ src: isSafeImageSrc(attributes.src) ? attributes.src : "" }),
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (el) => (isSafeImageSrc(el.getAttribute("src")) ? null : false),
      },
    ]
  },
}).configure({ inline: false, allowBase64: true })

export function fitsInNote(doc: Doc, extraBytes: number): boolean {
  return encodeStateAsUpdate(doc).byteLength + extraBytes <= MAX_NOTE_BYTES
}

export const NOTE_FULL: Notice = {
  title: "This note is full",
  description: "Put more images in a new note.",
}

export const imageFiles = (files: FileList | null | undefined): File[] =>
  Array.from(files ?? []).filter((file) => file.type.startsWith("image/"))

// "IMG_2041.jpg" -> "IMG_2041"; clipboard screenshots arrive as "image.png" -> "Image".
function altFor(file: File): string {
  const name = file.name.replace(/\.[^.]+$/, "")
  return !name || /^image$/i.test(name) ? "Image" : name
}

// Shrinks the files, checks the note limit, then inserts them at `pos` (drop) or the cursor.
export async function insertImageFiles(
  view: EditorView,
  doc: Doc,
  files: File[],
  notify: Notify,
  pos?: number,
): Promise<void> {
  notify({ title: files.length > 1 ? "Adding images…" : "Adding image…" })
  const results = await Promise.allSettled(files.map(shrinkImage))
  if (view.isDestroyed || !view.editable) return

  const added = results.flatMap((r, i) =>
    r.status === "fulfilled" ? [{ src: r.value, alt: altFor(files[i]) }] : [],
  )
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected")
  const failure = failed?.reason instanceof ImageError ? failed.reason.message : null
  if (!added.length) {
    notify({ title: failure ?? "This image could not be read" })
    return
  }
  if (
    !fitsInNote(
      doc,
      added.reduce((sum, image) => sum + image.src.length, 0),
    )
  ) {
    notify(NOTE_FULL)
    return
  }

  const { schema } = view.state
  const nodes = added.map((attrs) => schema.nodes.image.create(attrs))
  const tr = view.state.tr
  if (pos !== undefined) {
    // The note may have changed while shrinking (other devices): keep the position inside it.
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))))
  }
  tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0))
  view.dispatch(tr.scrollIntoView())
  view.focus()
  notify(failure ? { title: failure, description: "The other images were added." } : null)
}

function removeNodes(fragment: Fragment, drop: (node: PMNode) => boolean): Fragment {
  const kept: PMNode[] = []
  fragment.forEach((node) => {
    if (drop(node)) return
    kept.push(node.isLeaf ? node : node.copy(removeNodes(node.content, drop)))
  })
  return Fragment.from(kept)
}

// Pasted or dropped HTML (a web page, another Jot note) with images already inside: drop data
// images over the per-image limit. Remote https:// images stay as links to that site.
export function dropOversizedImages(slice: Slice, notify: Notify): Slice {
  let dropped = false
  const content = removeNodes(slice.content, (node) => {
    const tooBig =
      node.type.name === "image" && dataBytes(String(node.attrs.src ?? "")) > MAX_IMAGE_BYTES
    if (tooBig) dropped = true
    return tooBig
  })
  if (!dropped) return slice
  notify({ title: "A large image was left out", description: "Paste it as a file to shrink it." })
  return new Slice(content, slice.openStart, slice.openEnd)
}

// Total size of the data images in a slice, for the note limit.
export function sliceImageBytes(slice: Slice): number {
  let bytes = 0
  slice.content.descendants((node) => {
    if (node.type.name === "image") bytes += dataBytes(String(node.attrs.src ?? ""))
  })
  return bytes
}
