import Collaboration, { isChangeOrigin } from "@tiptap/extension-collaboration"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useEffect } from "react"

import { Toolbar } from "@/editor/Toolbar"
import { getTitleAndPreview } from "@/features/notes/noteMeta"
import { useNoteSession } from "@/sync/provider"

const META_DEBOUNCE_MS = 500

type Props = {
  noteId: string
  // Called (debounced) after the user's own edits with the note's first line and a preview.
  // Pass a stable function: a new one re-subscribes.
  onMetaChange?: (meta: { title: string; preview: string }) => void
}

// Content comes from the Y.Doc, never from Tiptap's `content` option.
// undoRedo is off: Collaboration brings its own undo/redo (same shortcuts).
// Keep the default Collaboration `field`; changing it later orphans existing notes.
export function Editor({ noteId, onMetaChange }: Props) {
  const { doc } = useNoteSession(noteId)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: doc }),
    ],
  })

  useEffect(() => {
    if (!editor || !onMetaChange) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const push = () => {
      timer = undefined
      if (!editor.isDestroyed) onMetaChange(getTitleAndPreview(editor.getText()))
    }
    // Skip changes that came from Yjs (other devices, IndexedDB load): only local edits write the
    // index, otherwise every device would rewrite the same value forever.
    const handleUpdate = ({
      transaction,
    }: {
      transaction: Parameters<typeof isChangeOrigin>[0]
    }) => {
      if (isChangeOrigin(transaction)) return
      clearTimeout(timer)
      timer = setTimeout(push, META_DEBOUNCE_MS)
    }

    editor.on("update", handleUpdate)
    return () => {
      editor.off("update", handleUpdate)
      if (timer !== undefined) {
        clearTimeout(timer)
        push() // switching notes inside the debounce window: save the last edit anyway
      }
    }
  }, [editor, onMetaChange])

  return (
    <>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </>
  )
}
