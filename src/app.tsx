import { Add01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { AccountFooter } from "@/auth/account-footer"
import { LoginScreen } from "@/auth/login-screen"
import { InstallHint } from "@/components/install-hint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Editor } from "@/editor/editor"
import { NoteList } from "@/features/notes/note-list"
import { removeMember, unshareNote } from "@/features/sharing/api"
import { caretUser } from "@/features/sharing/caret-user"
import { type InviteLink, readInviteLink } from "@/features/sharing/invite-link"
import { JoinPage } from "@/features/sharing/join-page"
import { refreshRoles } from "@/features/sharing/refresh-roles"
import { ShareDialog } from "@/features/sharing/share-dialog"
import { ShareLinkPage } from "@/features/sharing/share-link-page"
import { type AuthUser, useAuthUser } from "@/hooks/use-auth-user"
import { useNoteId } from "@/hooks/use-note-id"
import { useNoteSearch } from "@/hooks/use-note-search"
import {
  createNote,
  markShared,
  softDelete,
  togglePin,
  updateMeta,
  useNotes,
} from "@/sync/index-doc"
import { deleteLocalNote, requestDurableStorage } from "@/sync/local-data"
import { useIndexSession } from "@/sync/provider"

// A new note is a draft until its first edit: not in the list yet (docs/plans/blank-notes.md).
// Its id survives a reload in sessionStorage (per tab). A stored draft that is not the open note
// was left some other way: drop its empty local copy.
const DRAFT_KEY = "jot-draft"
function readDraft(noteId: string | null): string | null {
  try {
    const id = sessionStorage.getItem(DRAFT_KEY)
    if (id && id !== noteId) deleteLocalNote(id)
    return id === noteId ? id : null
  } catch {
    return null
  }
}

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
  const { doc, loaded } = useIndexSession(user.id)
  const notes = useNotes(doc)
  const [query, setQuery] = React.useState("")
  const visibleNotes = useNoteSearch(notes, query)
  const { noteId, openNote } = useNoteId()
  const currentNote = notes.find((note) => note.id === noteId)
  // Share dialog opened from the note list. `n` changes on each open: a fresh dialog, no stale details.
  const [share, setShare] = React.useState<{ id: string; n: number; open: boolean } | null>(null)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [draftId, setDraftId] = React.useState(() => readDraft(noteId))
  const isDraft = !!noteId && noteId === draftId && !currentNote
  const [focusKey, setFocusKey] = React.useState(0)

  React.useEffect(() => {
    try {
      if (draftId) sessionStorage.setItem(DRAFT_KEY, draftId)
      else sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // Storage blocked: a reload forgets the draft (it then opens as an empty, unlisted note).
    }
  }, [draftId])

  // Leaving the draft unedited leaves nothing behind. Compares with the previous note, not the
  // draft id alone, so the render where the draft id is set before the URL changes does not count.
  const prevNoteId = React.useRef(noteId)
  React.useEffect(() => {
    const left = prevNoteId.current
    prevNoteId.current = noteId
    if (left && left !== noteId && left === draftId) {
      deleteLocalNote(left)
      setDraftId(null)
    }
  }, [noteId, draftId])

  // Signed in: ask the browser to keep this device's notes (see local-data.ts).
  React.useEffect(requestDurableStorage, [])

  // Owners can change our role on shared notes, or remove us, while we are away: read the current
  // state from the server. Runs again when the set of notes shared with us changes, which also
  // covers the list finishing loading from this device after the first render.
  const sharedKey = notes
    .filter((note) => note.role)
    .map((note) => note.id)
    .join(",")
  React.useEffect(() => {
    void refreshRoles(doc)
  }, [doc, sharedKey])

  // No ?note= in the URL: open the newest note once the list is known.
  // (Not while a share link is being opened: that page replaces the URL with the shared note.)
  const newestId = notes[0]?.id
  React.useEffect(() => {
    if (!noteId && newestId && !shareToken) openNote(newestId, { replace: true })
  }, [noteId, newestId, shareToken, openNote])

  // The link page is finished: show the note, and stop treating this visit as a link visit (the
  // address bar already changed, but this page was opened with the token, so forget it here too).
  const openSharedNote = React.useCallback(
    (id: string) => {
      openNote(id, { replace: true })
      onShareDone()
    },
    [openNote, onShareDone],
  )

  // Already in an untouched draft: go back into it instead of making another.
  const handleNew = () => {
    if (isDraft) setFocusKey((key) => key + 1)
    else {
      const id = crypto.randomUUID()
      setDraftId(id)
      openNote(id)
    }
    setSidebarOpen(false)
  }

  // First real edit: the draft joins the list. The editor's debounced meta write then fills the title.
  const handleDraftEdited = () => {
    if (!draftId) return
    createNote(doc, draftId)
    setDraftId(null)
  }

  // Stable per (doc, noteId): the editor re-subscribes when this changes.
  const handleMeta = React.useCallback(
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
            loading={!loaded}
            activeId={noteId}
            onOpen={handleOpen}
            onTogglePin={(id) => togglePin(doc, id)}
            onShare={(id) => setShare((s) => ({ id, n: (s?.n ?? 0) + 1, open: true }))}
            onDelete={(id) => void handleDelete(id)}
          />
        </ScrollArea>
        <AccountFooter user={user} />
      </aside>

      <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-3xl p-4">
          <div className="mb-2 flex items-center md:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Show notes"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <HugeiconsIcon icon={Menu01Icon} />
            </Button>
          </div>
          {share && (
            <ShareDialog
              key={share.n}
              noteId={share.id}
              open={share.open}
              onOpenChange={(open) => setShare({ ...share, open })}
              onLinkMade={() => markShared(doc, share.id)}
            />
          )}

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
              caret={caretUser(user)}
              onEdited={isDraft ? handleDraftEdited : undefined}
              focusKey={isDraft ? focusKey : undefined}
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
  const [invite, setInvite] = React.useState<InviteLink | null>(readInviteLink)
  const clearInvite = React.useCallback(() => setInvite(null), [])
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
