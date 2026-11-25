import * as React from "react"

import { LoginScreen } from "@/auth/login-screen"
import { InstallHint } from "@/components/install-hint"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Editor } from "@/editor/editor"
import { type Notice, NoticeToast } from "@/editor/notice"
import type { NoteText } from "@/features/notes/note-meta"
import { NoteSwitcher } from "@/features/notes/note-switcher"
import { NotesSidebar } from "@/features/notes/notes-sidebar"
import { SidebarToggle } from "@/features/notes/sidebar-toggle"
import { removeMember, unshareNote } from "@/features/sharing/api"
import { caretUser } from "@/features/sharing/caret-user"
import { type InviteLink, readInviteLink } from "@/features/sharing/invite-link"
import { JoinPage } from "@/features/sharing/join-page"
import { refreshRoles } from "@/features/sharing/refresh-roles"
import { restoreOwned } from "@/features/sharing/restore-owned"
import { ShareDialog } from "@/features/sharing/share-dialog"
import { ShareLinkPage } from "@/features/sharing/share-link-page"
import { type AuthUser, useAuthUser } from "@/hooks/use-auth-user"
import { useNoteId } from "@/hooks/use-note-id"
import { lazyOrReload } from "@/lib/lazy"
import { isDesktop } from "@/lib/platform"
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

// Desktop-only code (Tauri) loads only inside the desktop app; web and phone never fetch it.
const TitleBar = lazyOrReload(() => import("@/desktop/title-bar"))

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
  const { doc, loaded, synced } = useIndexSession(user.id)
  const notes = useNotes(doc)
  const { noteId, openNote } = useNoteId()
  const currentNote = notes.find((note) => note.id === noteId)
  // Share dialog opened from the note list. `n` changes on each open: a fresh dialog, no stale details.
  const [share, setShare] = React.useState<{ id: string; n: number; open: boolean } | null>(null)
  // Toast at the bottom (same as the editor's), for a leave or delete the server refused.
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const clearNotice = React.useCallback(() => setNotice(null), [])
  // The note waiting for "Leave" / "Delete" in the confirmation dialog. Kept after closing (open:
  // false) so the text does not change during the close animation.
  const [confirmDelete, setConfirmDelete] = React.useState<{
    id: string
    kind: "leave" | "shared"
    open: boolean
  } | null>(null)
  const [draftId, setDraftId] = React.useState(() => readDraft(noteId))
  const isDraft = !!noteId && noteId === draftId && !currentNote
  const [focusKey, setFocusKey] = React.useState(0)
  // A note picked in the switcher gets the caret, like a new draft (not on every open: on a phone
  // that would pop the keyboard each time).
  const [pickedId, setPickedId] = React.useState<string | null>(null)

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

  // The server lost list changes for a while: once ours has synced with it, add back any note we
  // own that it misses (restore-owned.ts). Once per session.
  React.useEffect(() => {
    if (synced) void restoreOwned(doc)
  }, [doc, synced])

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
  }

  // Desktop tray "New note". The ref keeps the listener on the latest handleNew without
  // re-subscribing every render.
  const handleNewRef = React.useRef(handleNew)
  React.useEffect(() => {
    handleNewRef.current = handleNew
  })
  React.useEffect(() => {
    if (!isDesktop()) return
    let stop: (() => void) | undefined
    let cancelled = false
    void import("@/desktop/events")
      .then(({ onTrayNewNote }) => onTrayNewNote(() => handleNewRef.current()))
      .then((unlisten) => {
        if (cancelled) unlisten()
        else stop = unlisten
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  // Ctrl/⌘+P or +K: note switcher (everywhere; it replaces print on the web). Ctrl+N: new note,
  // desktop only (browsers keep Ctrl+N for a new window and do not let pages take it).
  const [switcherOpen, setSwitcherOpen] = React.useState(false)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key === "p" || key === "k") {
        event.preventDefault()
        setSwitcherOpen(true)
      } else if (key === "n" && isDesktop()) {
        event.preventDefault()
        handleNewRef.current()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Desktop: a short window grows to fit the switcher (48px from the top + about 290px) while open,
  // and shrinks back when it closes.
  React.useEffect(() => {
    if (!isDesktop() || !switcherOpen) return
    let restore: (() => void) | undefined
    let cancelled = false
    void import("@/desktop/window")
      .then(({ growWindowTo }) => growWindowTo(360))
      .then((undo) => {
        if (cancelled) undo()
        else restore = undo
      })
    return () => {
      cancelled = true
      restore?.()
    }
  }, [switcherOpen])

  // First real edit: the draft joins the list. The editor's debounced meta write then fills the title.
  const handleDraftEdited = () => {
    if (!draftId) return
    createNote(doc, draftId)
    setDraftId(null)
  }

  // Stable per (doc, noteId): the editor re-subscribes when this changes.
  const handleMeta = React.useCallback(
    (meta: NoteText) => {
      if (noteId) updateMeta(doc, noteId, meta)
    },
    [doc, noteId],
  )

  // Access to a shared note was taken away: drop it from the list and from this device.
  const handleRemoveLost = (id: string) => {
    softDelete(doc, id)
    deleteLocalNote(id)
    if (id === noteId) openNote(null, { replace: true })
  }

  // Soft delete. If it was the open note, clear the URL: the effect above then opens the next one.
  // Shared notes need the server: leaving removes our place, and deleting your own shared note
  // takes everyone else's access away first (the data itself is never hard-deleted).
  // Leaving a shared note, or deleting one you shared, asks first (AlertDialog below).
  // A note only you can see is soft-deleted straight away.
  const handleDelete = (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (note?.noAccess) return handleRemoveLost(id) // nothing to tell the server
    if (note?.role) setConfirmDelete({ id, kind: "leave", open: true })
    else if (note?.shared) setConfirmDelete({ id, kind: "shared", open: true })
    else void deleteNote(id)
  }

  const deleteNote = async (id: string) => {
    const note = notes.find((n) => n.id === id)

    const needsServer = async (
      action: () => Promise<{ ok: boolean; status?: number; error?: string }>,
    ) => {
      const result = await action()
      // 404: the server has no record (never synced, or already gone): nothing to undo there.
      if (result.ok || result.status === 404) return true
      setNotice(
        result.error === "offline"
          ? { title: "You are offline", description: "Go online to do this with a shared note." }
          : { title: "That did not work", description: "Try again." },
      )
      return false
    }

    if (note?.role) {
      if (await needsServer(() => removeMember(id, user.id))) handleRemoveLost(id)
      return
    }
    if (note?.shared && !(await needsServer(() => unshareNote(id)))) return
    softDelete(doc, id)
    if (id === noteId) openNote(null, { replace: true })
  }

  // The ⋮ menu's actions: the same in the sidebar and the note switcher.
  const noteActions = {
    onTogglePin: (id: string) => togglePin(doc, id),
    onShare: (id: string) => setShare((s) => ({ id, n: (s?.n ?? 0) + 1, open: true })),
    onDelete: handleDelete,
  }

  return (
    // Phone (< 768 px): the sidebar is a sheet over the editor. Desktop: a column that hides fully
    // (trigger or Ctrl/⌘+B outside the editor); the provider remembers it in a cookie.
    <SidebarProvider
      defaultOpen={!document.cookie.includes("sidebar_state=false")}
      className="h-dvh min-h-0 pr-[env(safe-area-inset-right)]"
    >
      <NotesSidebar
        user={user}
        notes={notes}
        loading={!loaded}
        activeId={noteId}
        onNew={handleNew}
        onOpen={openNote}
        {...noteActions}
      />

      <SidebarInset className="min-w-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {isDesktop() && (
          <React.Suspense fallback={<div className="h-10 shrink-0" />}>
            <TitleBar
              title={noteId ? currentNote?.title || "Untitled" : undefined}
              onNew={handleNew}
              onSearch={() => setSwitcherOpen(true)}
            />
          </React.Suspense>
        )}
        <NoteSwitcher
          notes={notes}
          activeId={noteId}
          {...noteActions}
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          onPick={(id) => {
            openNote(id)
            setPickedId(id)
            setFocusKey((key) => key + 1)
          }}
        />
        {/* Desktop: a small window, so tighter edges (the title bar sits above). */}
        <div className="mx-auto w-full max-w-3xl p-4 desktop:px-3 desktop:pt-1">
          {/* Desktop: the title bar has the trigger instead. sm to md: on the toolbar's line,
              sticky with it (h-0 takes no room; 5px centres the 32px button on the 42px bar). The
              background hides note text scrolling under it. Phones: the toolbar is at the bottom. */}
          <div className="mb-2 flex items-center sm:sticky sm:top-2 sm:z-20 sm:mb-0 sm:h-0 sm:translate-y-[5px] sm:items-start md:absolute md:top-2 md:left-2 md:h-auto md:translate-y-0 desktop:hidden sm:[&>button]:bg-background md:[&>button]:bg-transparent">
            <SidebarToggle />
          </div>
          {share && (
            <ShareDialog
              key={share.n}
              noteId={share.id}
              open={share.open}
              onOpenChange={(open) => setShare({ ...share, open })}
              onShared={() => markShared(doc, share.id)}
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
              focusKey={isDraft || noteId === pickedId ? focusKey : undefined}
            />
          ) : (
            // Centred in the writing area (SidebarInset is `relative`); pointer-events-none so it
            // never blocks the sidebar toggle under it.
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-muted-foreground">
              No notes yet. Create one with “New note”.
            </p>
          )}
        </div>
      </SidebarInset>

      <AlertDialog
        open={!!confirmDelete?.open}
        onOpenChange={(open) => setConfirmDelete((c) => c && { ...c, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.kind === "leave" ? "Leave this note?" : "Delete this shared note?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "leave"
                ? "You will lose access to it. The owner can share it with you again."
                : "Deleting it removes access for everyone it is shared with."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!confirmDelete) return
                setConfirmDelete({ ...confirmDelete, open: false })
                void deleteNote(confirmDelete.id)
              }}
            >
              {confirmDelete?.kind === "leave" ? "Leave" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NoticeToast notice={notice} onClose={clearNotice} />
      <InstallHint />
    </SidebarProvider>
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
