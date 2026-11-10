import { Add01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Editor } from "@/editor/Editor"
import { useNoteId } from "@/features/notes/useNoteId"
import { createNote, useNotes } from "@/sync/indexDoc"
import { useIndexSession } from "@/sync/provider"

function App() {
  const { doc } = useIndexSession()
  const notes = useNotes(doc)
  const { noteId, openNote } = useNoteId()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // No ?note= in the URL: open the newest note once the list is known.
  const newestId = notes[0]?.id
  useEffect(() => {
    if (!noteId && newestId) openNote(newestId, { replace: true })
  }, [noteId, newestId, openNote])

  const handleNew = () => {
    openNote(createNote(doc))
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-dvh">
      {/* Phone: slides over the editor. Desktop: fixed column. */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-64 shrink-0 flex-col gap-2 border-r bg-background p-2 md:static md:flex ${sidebarOpen ? "flex" : "hidden"}`}
      >
        <Button onClick={handleNew}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          New note
        </Button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="mb-2 md:hidden"
            aria-label="Show notes"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <HugeiconsIcon icon={Menu01Icon} />
          </Button>

          {noteId ? (
            <Editor key={noteId} noteId={noteId} />
          ) : (
            <p className="text-muted-foreground">No notes yet. Create one with “New note”.</p>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
