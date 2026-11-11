import Collaboration, { isChangeOrigin } from "@tiptap/extension-collaboration"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useEffect } from "react"

import { Toolbar } from "@/editor/Toolbar"
import { getTitleAndPreview } from "@/features/notes/noteMeta"
import { NoAccess } from "@/features/sharing/NoAccess"
import { useAccessLost } from "@/features/sharing/useAccessLost"
import type { SharedRole } from "@/sync/indexDoc"
import { useNoteSession } from "@/sync/provider"

const META_DEBOUNCE_MS = 500

type Props = {
  noteId: string
  // Called (debounced) after the user's own edits with the note's first line and a preview.
  // Pass a stable function: a new one re-subscribes.
  onMetaChange?: (meta: { title: string; preview: string }) => void
  // Set when someone else owns the note. "viewer" makes the editor read-only (the server also
  // drops a viewer's edits, this is so the screen does not pretend otherwise).
  role?: SharedRole
  // The note is shared (by us, or with us): other people's edits change the title too, so refresh it
  // from them as well, not only from our own typing.
  followRemote?: boolean
  // After access was lost: remove the note from the list and from this device.
  onRemoveLost?: () => void
  // The owner changed our role: the caller reads the new one and updates the list.
  onRoleChanged?: () => void
}

// Content comes from the Y.Doc, never from Tiptap's `content` option.
// undoRedo is off: Collaboration brings its own undo/redo (same shortcuts).
// Keep the default Collaboration `field`; changing it later orphans existing notes.
export function Editor({
  noteId,
  onMetaChange,
  role,
  followRemote,
  onRemoveLost,
  onRoleChanged,
}: Props) {
  const session = useNoteSession(noteId)
  const { doc } = session
  const readOnly = role === "viewer"
  const lost = useAccessLost(session, noteId, role !== undefined, onRoleChanged)

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: doc }),
    ],
  })

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor || !onMetaChange) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const push = () => {
      timer = undefined
      if (!editor.isDestroyed) onMetaChange(getTitleAndPreview(editor.getText()))
    }
    // Skip changes that came from Yjs (other devices, IndexedDB load): only local edits write the
    // index, otherwise every device would rewrite the same value forever. Shared notes also follow
    // other people's edits: updateMeta skips unchanged values, so nothing loops.
    const handleUpdate = ({
      transaction,
    }: {
      transaction: Parameters<typeof isChangeOrigin>[0]
    }) => {
      if (!followRemote && isChangeOrigin(transaction)) return
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
  }, [editor, onMetaChange, followRemote])

  if (lost) return <NoAccess onRemove={() => onRemoveLost?.()} />

  return (
    <>
      {readOnly && (
        <p className="mb-2 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          View only: you can read this note but not change it.
        </p>
      )}
      <Toolbar editor={editor} disabled={readOnly} />
      <EditorContent editor={editor} />
    </>
  )
}
