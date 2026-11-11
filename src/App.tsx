import { Add01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useState } from "react"

import { AccountFooter } from "@/auth/AccountFooter"
import { LoginScreen } from "@/auth/LoginScreen"
import { type AuthUser, useAuthUser } from "@/auth/useAuthUser"
import { InstallHint } from "@/components/InstallHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Editor } from "@/editor/Editor"
import { NoteList } from "@/features/notes/NoteList"
import { useNoteId } from "@/features/notes/useNoteId"
import { useNoteSearch } from "@/features/notes/useNoteSearch"
import { removeMember, unshareNote } from "@/features/sharing/api"
import { type InviteLink, readInviteLink } from "@/features/sharing/inviteLink"
import { JoinPage } from "@/features/sharing/JoinPage"
import { refreshRoles } from "@/features/sharing/refreshRoles"
import { ShareDialog } from "@/features/sharing/ShareDialog"
import { ShareLinkPage } from "@/features/sharing/ShareLinkPage"
import {
  createNote,
  markShared,
  softDelete,
  togglePin,
  updateMeta,
  useNotes,
} from "@/sync/indexDoc"
import { deleteLocalNote, requestDurableStorage } from "@/sync/localData"
import { useIndexSession } from "@/sync/provider"

// Signed-in app. Keyed by user id in `App`, so switching accounts remounts it with a fresh index.
function NotesApp({
  user,
  shareToken,
  onShareDone,
}: {
  user: AuthUser
  shareToken: string | null
  onShareDone: () => void
}) {
  const { doc } = useIndexSession(user.id)
  const notes = useNotes(doc)
  const [query, setQuery] = useState("")
  const visibleNotes = useNoteSearch(notes, query)
  const { noteId, openNote } = useNoteId()
  // Only the owner can share (a note with a `role` belongs to someone else).
  const currentNote = notes.find((note) => note.id === noteId)
  const ownedNote = currentNote && !currentNote.role ? currentNote : undefined
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Signed in: ask the browser to keep this device's notes (see localData.ts).
  useEffect(requestDurableStorage, [])

  // Owners can change our role on shared notes, or remove us, while we are away: read the current
  // state from the server. Runs again when the set of notes shared with us changes, which also
  // covers the list finishing loading from this device after the first render.
  const sharedKey = notes
    .filter((note) => note.role)
    .map((note) => note.id)
    .join(",")
  useEffect(() => {
    void refreshRoles(doc)
  }, [doc, sharedKey])

  // No ?note= in the URL: open the newest note once the list is known.
  // (Not while a share link is being opened: that page replaces the URL with the shared note.)
  const newestId = notes[0]?.id
  useEffect(() => {
    if (!noteId && newestId && !shareToken) openNote(newestId, { replace: true })
  }, [noteId, newestId, shareToken, openNote])

  // The link page is finished: show the note, and stop treating this visit as a link visit (the
  // address bar already changed, but this page was opened with the token, so forget it here too).
  const openSharedNote = useCallback(
    (id: string) => {
      openNote(id, { replace: true })
      onShareDone()
    },
    [openNote, onShareDone],
  )

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

  // Access to a shared note was taken away: drop it from the list and from this device.
  const handleRemoveLost = (id: string) => {
    softDelete(doc, id)
    deleteLocalNote(id)
    if (id === noteId) openNote(null, { replace: true })
  }

  // Soft delete. If it was the open note, clear the URL: the effect above then opens the next one.
  // Shared notes need the server: leaving removes our place, and deleting your own shared note
  // takes everyone else's access away first (the data itself is never hard-deleted).
  const handleDelete = async (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (note?.noAccess) return handleRemoveLost(id) // nothing to tell the server

    const needsServer = async (
      action: () => Promise<{ ok: boolean; status?: number; error?: string }>,
    ) => {
      const result = await action()
      // 404: the server has no record (never synced, or already gone): nothing to undo there.
      if (result.ok || result.status === 404) return true
      window.alert(
        result.error === "offline"
          ? "Go online to do this with a shared note."
          : "That did not work. Try again.",
      )
      return false
    }

    if (note?.role) {
      if (!window.confirm("Leave this note? You will lose access to it.")) return
      if (await needsServer(() => removeMember(id, user.id))) handleRemoveLost(id)
      return
    }
    if (note?.shared) {
      if (!window.confirm("This note is shared. Deleting it removes access for everyone.")) return
      if (!(await needsServer(() => unshareNote(id)))) return
    }
    softDelete(doc, id)
    if (id === noteId) openNote(null, { replace: true })
  }

  return (
    <div className="flex h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {/* Phone: slides over the editor. Desktop: fixed column. */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-64 shrink-0 flex-col gap-2 border-r bg-background p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] md:static md:flex ${sidebarOpen ? "flex" : "hidden"}`}
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
            onDelete={(id) => void handleDelete(id)}
          />
        </ScrollArea>
        <AccountFooter user={user} />
      </aside>

      <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-3xl p-4">
          <div className="mb-2 flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Show notes"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <HugeiconsIcon icon={Menu01Icon} />
            </Button>
            {ownedNote && !shareToken && (
              <div className="ml-auto">
                <ShareDialog
                  noteId={ownedNote.id}
                  onLinkMade={() => markShared(doc, ownedNote.id)}
                />
              </div>
            )}
          </div>

          {shareToken ? (
            <ShareLinkPage token={shareToken} doc={doc} onOpen={openSharedNote} />
          ) : noteId ? (
            <Editor
              key={noteId}
              noteId={noteId}
              onMetaChange={handleMeta}
              role={currentNote?.role}
              followRemote={!!(currentNote?.role || currentNote?.shared)}
              onRemoveLost={() => handleRemoveLost(noteId)}
              onRoleChanged={() => void refreshRoles(doc)}
              noAccess={currentNote?.noAccess}
            />
          ) : (
            <p className="text-muted-foreground">No notes yet. Create one with “New note”.</p>
          )}
        </div>
      </main>

      <InstallHint />
    </div>
  )
}

function App() {
  const auth = useAuthUser()
  // /join/<token> or /share/<token>, read once: it is the address the page was opened at.
  const [invite, setInvite] = useState<InviteLink | null>(readInviteLink)
  const clearInvite = useCallback(() => setInvite(null), [])
  if (auth.status === "loading") return null
  if (auth.status === "signedOut") return <LoginScreen invite={invite} />
  if (invite?.kind === "join") return <JoinPage token={invite.token} />
  return (
    <NotesApp
      key={auth.user.id}
      user={auth.user}
      shareToken={invite?.kind === "share" ? invite.token : null}
      onShareDone={clearInvite}
    />
  )
}

export default App
