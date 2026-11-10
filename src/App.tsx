import { Add01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useState } from "react"

import { AccountFooter } from "@/auth/AccountFooter"
import { LoginScreen } from "@/auth/LoginScreen"
import { type AuthUser, useAuthUser } from "@/auth/useAuthUser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Editor } from "@/editor/Editor"
import { NoteList } from "@/features/notes/NoteList"
import { useNoteId } from "@/features/notes/useNoteId"
import { useNoteSearch } from "@/features/notes/useNoteSearch"
import { createNote, softDelete, togglePin, updateMeta, useNotes } from "@/sync/indexDoc"
import { useIndexSession } from "@/sync/provider"

// Signed-in app. Step C passes `user.id` to the index room.
function NotesApp({ user }: { user: AuthUser }) {
  const { doc } = useIndexSession()
  const notes = useNotes(doc)
  const [query, setQuery] = useState("")
  const visibleNotes = useNoteSearch(notes, query)
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

  // Stable per (doc, noteId): the editor re-subscribes when this changes.
  const handleMeta = useCallback(
    (meta: { title: string; preview: string }) => {
      if (noteId) updateMeta(doc, noteId, meta)
    },
    [doc, noteId],
  )

  const handleOpen = (id: string) => {
    openNote(id)
    setSidebarOpen(false)
  }

  // Soft delete. If it was the open note, clear the URL: the effect above then opens the next one.
  const handleDelete = (id: string) => {
    softDelete(doc, id)
    if (id === noteId) openNote(null, { replace: true })
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
        <Input
          type="search"
          placeholder="Search notes"
          aria-label="Search notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ScrollArea className="min-h-0 flex-1">
          {query.trim() && visibleNotes.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching notes</p>
          )}
          <NoteList
            notes={visibleNotes}
            activeId={noteId}
            onOpen={handleOpen}
            onTogglePin={(id) => togglePin(doc, id)}
            onDelete={handleDelete}
          />
        </ScrollArea>
        <AccountFooter user={user} />
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
            <Editor key={noteId} noteId={noteId} onMetaChange={handleMeta} />
          ) : (
            <p className="text-muted-foreground">No notes yet. Create one with “New note”.</p>
          )}
        </div>
      </main>
    </div>
  )
}

function App() {
  const auth = useAuthUser()
  if (auth.status === "loading") return null
  if (auth.status === "signedOut") return <LoginScreen />
  return <NotesApp user={auth.user} />
}

export default App
