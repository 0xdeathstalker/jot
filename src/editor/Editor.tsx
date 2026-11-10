import Collaboration from "@tiptap/extension-collaboration"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

import { Toolbar } from "@/editor/Toolbar"
import { useNoteSession } from "@/sync/provider"

// Content comes from the Y.Doc, never from Tiptap's `content` option.
// undoRedo is off: Collaboration brings its own undo/redo (same shortcuts).
// Keep the default Collaboration `field`; changing it later orphans existing notes.
export function Editor({ noteId }: { noteId: string }) {
  const { doc } = useNoteSession(noteId)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: doc }),
    ],
  })

  return (
    <>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </>
  )
}
