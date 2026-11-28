import {
  Add01Icon,
  CircleArrowLeft01Icon,
  CircleArrowRight01Icon,
  Delete02Icon,
  KeyboardIcon,
  Logout03Icon,
  Moon02Icon,
  PinIcon,
  PinOffIcon,
  RestoreBinIcon,
  Search01Icon,
  Share08Icon,
  Sun03Icon,
  TextFontIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"
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
import { Editor } from "@/editor/editor"
import { type Notice, NoticeToast } from "@/editor/notice"
import { ActionPanel } from "@/features/notes/action-panel"
import { DeletedNotesDialog } from "@/features/notes/deleted-notes-dialog"
import type { NoteText } from "@/features/notes/note-meta"
import { NoteSwitcher } from "@/features/notes/note-switcher"
import { TopBar } from "@/features/notes/top-bar"
import { removeMember, unshareNote } from "@/features/sharing/api"
import { caretUser } from "@/features/sharing/caret-user"
import { InviteDialog } from "@/features/sharing/invite-friend"
import { type InviteLink, readInviteLink } from "@/features/sharing/invite-link"
import { JoinPage } from "@/features/sharing/join-page"
import { refreshRoles } from "@/features/sharing/refresh-roles"
import { restoreOwned } from "@/features/sharing/restore-owned"
import { ShareDialog } from "@/features/sharing/share-dialog"
import { ShareLinkPage } from "@/features/sharing/share-link-page"
import { type Action, useActionShortcuts } from "@/hooks/use-action-shortcuts"
import { type AuthUser, signOut, useAuthUser } from "@/hooks/use-auth-user"
import { useJoinInfo } from "@/hooks/use-join-info"
import { useLayout } from "@/hooks/use-layout"
import { useNoteId } from "@/hooks/use-note-id"
import { useTheme } from "@/hooks/use-theme"
import { useToolbarHidden } from "@/hooks/use-toolbar-hidden"
import { lazyOrReload } from "@/lib/lazy"
import { isDesktop, matchesShortcut } from "@/lib/platform"
import {
  createNote,
  markShared,
  softDelete,
  softDeleteAll,
  togglePin,
  updateMeta,
  useNotes,
} from "@/sync/index-doc"
import { deleteLocalNote, requestDurableStorage } from "@/sync/local-data"
import { syncAllLocalData, useIndexSession } from "@/sync/provider"

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
const HotkeyDialog = lazyOrReload(() => import("@/desktop/hotkey-dialog"))

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

  // Ctrl/⌘+K toggles the Action Panel (in place of the switcher, if that is open). The other
  // shortcuts come from the action list (below).
  const [switcherOpen, setSwitcherOpen] = React.useState(false)
  const [actionsOpen, setActionsOpen] = React.useState(false)
  const [hotkeyOpen, setHotkeyOpen] = React.useState(false)
  const [deletedOpen, setDeletedOpen] = React.useState(false)
  // Kept after closing (open: false) so the count does not change during the close animation.
  const [deleteAll, setDeleteAll] = React.useState<{ count: number; open: boolean } | null>(null)
  const deletableIds = notes
    .filter((note) => !note.role && !note.shared && !note.noAccess)
    .map((note) => note.id)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const joinInfo = useJoinInfo(inviteOpen)
  const [isDark, setDark] = useTheme()
  const layout = useLayout()
  const [toolbarHidden, setToolbarHidden] = useToolbarHidden()

  // Sign out: push everything to the server first. Only if something could not be synced do we ask
  // before throwing it away (`unsynced`: how many, while that dialog is open).
  const [signingOut, setSigningOut] = React.useState(false)
  const [unsynced, setUnsynced] = React.useState<number | null>(null)
  const handleSignOut = async () => {
    setSigningOut(true)
    setNotice({ title: "Syncing…", description: "Saving your notes before signing out." })
    const { failed } = await syncAllLocalData(user.id)
    if (failed > 0) {
      setNotice(null)
      setUnsynced(failed)
    } else await signOut(user.id)
  }
  // Cancel, Escape: keep the notes and stay signed in.
  const handleUnsyncedChange = (open: boolean) => {
    if (open) return
    setUnsynced(null)
    setSigningOut(false)
  }
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, ["Mod", "K"])) return
      event.preventDefault()
      setSwitcherOpen(false)
      setActionsOpen((open) => !open)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

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

  // A note picked in the switcher or restored from Recently Deleted: open it with the caret in it.
  const openPicked = (id: string) => {
    openNote(id)
    setPickedId(id)
    setFocusKey((key) => key + 1)
  }

  const noteActions = {
    onTogglePin: (id: string) => togglePin(doc, id),
    onShare: (id: string) => setShare((s) => ({ id, n: (s?.n ?? 0) + 1, open: true })),
    onDelete: handleDelete,
  }

  // Everything you can do from anywhere: the Action Panel's rows and the app's shortcuts
  // (docs/plans/action-panel.md). Note rows act on the open note, and hide for a draft (not in the
  // list yet) or when no note is open.
  const canGo = (way: "back" | "forward") =>
    !("navigation" in window) || (way === "back" ? navigation.canGoBack : navigation.canGoForward)
  const actions: Action[] = [
    {
      id: "new",
      label: "New Note",
      icon: Add01Icon,
      // Desktop only: browsers keep Ctrl+N for a new window and do not let pages take it.
      keys: isDesktop() ? ["Mod", "N"] : undefined,
      group: 1,
      run: handleNew,
    },
    {
      id: "pin",
      label: currentNote?.pinned ? "Unpin Note" : "Pin Note",
      icon: currentNote?.pinned ? PinOffIcon : PinIcon,
      keys: ["Mod", "Shift", "P"],
      group: 1,
      hidden: !currentNote,
      run: () => noteId && noteActions.onTogglePin(noteId),
    },
    {
      id: "share",
      label: "Share Note…",
      icon: Share08Icon,
      group: 1,
      // Only the owner shares (a note with a `role` belongs to someone else).
      hidden: !currentNote || !!currentNote.role,
      dialog: true,
      run: () => noteId && noteActions.onShare(noteId),
    },
    {
      id: "browse",
      label: "Browse Notes",
      icon: Search01Icon,
      keys: ["Mod", "P"],
      group: 1,
      dialog: true,
      run: () => setSwitcherOpen(true),
    },
    {
      id: "back",
      label: "Go Back",
      icon: CircleArrowLeft01Icon,
      keys: ["Mod", "["],
      group: 1,
      disabled: !canGo("back"),
      run: () => history.back(),
    },
    {
      id: "forward",
      label: "Go Forward",
      icon: CircleArrowRight01Icon,
      keys: ["Mod", "]"],
      group: 1,
      disabled: !canGo("forward"),
      run: () => history.forward(),
    },
    {
      id: "hotkey",
      label: "Global Hotkey…",
      icon: KeyboardIcon,
      group: 2,
      hidden: !isDesktop(),
      dialog: true,
      run: () => setHotkeyOpen(true),
    },
    {
      id: "toolbar",
      label: toolbarHidden ? "Show Toolbar" : "Hide Toolbar",
      icon: TextFontIcon,
      group: 2,
      // Web keeps the toolbar in the top bar; there is nothing to hide.
      hidden: layout === "web",
      run: () => setToolbarHidden(!toolbarHidden),
    },
    {
      id: "invite",
      label: "Invite a Friend…",
      icon: UserAdd01Icon,
      group: 2,
      // No invites for invited users, and offline (joinInfo is null then).
      hidden: !joinInfo,
      dialog: true,
      run: () => setInviteOpen(true),
    },
    {
      id: "deleted",
      label: "Show Recently Deleted Notes",
      icon: RestoreBinIcon,
      group: 3,
      dialog: true,
      run: () => setDeletedOpen(true),
    },
    {
      id: "delete",
      label: currentNote?.role ? "Leave Note" : "Delete Note",
      icon: Delete02Icon,
      keys: ["Mod", "D"],
      group: 3,
      destructive: true,
      hidden: !currentNote,
      // Leaving, or deleting a note you shared, asks first (handleDelete).
      dialog: !!(currentNote?.role || currentNote?.shared),
      run: () => noteId && noteActions.onDelete(noteId),
    },
    {
      id: "delete-all",
      label: "Delete All Notes",
      icon: Delete02Icon,
      keys: ["Mod", "Alt", "D"],
      group: 3,
      destructive: true,
      disabled: deletableIds.length === 0,
      dialog: true,
      run: () => setDeleteAll({ count: deletableIds.length, open: true }),
    },
    {
      id: "theme",
      // Names the mode it switches to.
      label: isDark ? "Light Mode" : "Dark Mode",
      icon: isDark ? Sun03Icon : Moon02Icon,
      group: 4,
      run: () => setDark(!isDark),
    },
    {
      id: "sign-out",
      label: "Sign Out",
      icon: Logout03Icon,
      group: 4,
      destructive: true,
      disabled: signingOut,
      run: () => void handleSignOut(),
    },
  ]
  useActionShortcuts(actions)

  const topBar = {
    title: noteId ? currentNote?.title || "Untitled" : undefined,
    onActions: () => setActionsOpen(true),
    onNew: handleNew,
    onSearch: () => setSwitcherOpen(true),
  }

  // Delete All: only notes you own and have not shared. Shared ones need the server and their own
  // confirm (handleDelete), so they stay. Everything deleted can come back from Recently Deleted.
  const handleDeleteAll = () => {
    softDeleteAll(doc, deletableIds)
    // The open note went too (or is an untouched draft): open the next one, as after a delete.
    if (noteId && !notes.some((note) => note.id === noteId && !deletableIds.includes(note.id)))
      openNote(null, { replace: true })
  }

  return (
    // No sidebar (owner, 2026-11-28): one top bar on every platform, the note list in the switcher
    // (Ctrl/⌘+P), everything else in the Action Panel (Ctrl/⌘+K). This box scrolls; the bar sticks.
    <div className="relative h-dvh overflow-y-auto pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      {isDesktop() ? (
        <React.Suspense fallback={<div className="h-10 shrink-0" />}>
          <TitleBar {...topBar} />
        </React.Suspense>
      ) : (
        <TopBar {...topBar} />
      )}
      <ActionPanel actions={actions} open={actionsOpen} onOpenChange={setActionsOpen} />
      <NoteSwitcher
        notes={notes}
        activeId={noteId}
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        onPick={openPicked}
      />
      {hotkeyOpen && (
        <React.Suspense>
          <HotkeyDialog open onOpenChange={setHotkeyOpen} />
        </React.Suspense>
      )}
      {deletedOpen && (
        <DeletedNotesDialog doc={doc} onOpenChange={setDeletedOpen} onRestored={openPicked} />
      )}
      <InviteDialog info={joinInfo} open={inviteOpen} onOpenChange={setInviteOpen} />
      {share && (
        <ShareDialog
          key={share.n}
          noteId={share.id}
          open={share.open}
          onOpenChange={(open) => setShare({ ...share, open })}
          onShared={() => markShared(doc, share.id)}
        />
      )}

      {/* Desktop: a small window, so tighter edges (the title bar sits above). */}
      <div className="mx-auto w-full max-w-3xl p-4 desktop:px-3 desktop:pt-1">
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
          // Centred in the window (the scroll box is `relative`); pointer-events-none so it never
          // blocks the top bar under it. Not while this device's list is still loading (the
          // sidebar's placeholder rows used to cover that moment).
          loaded && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-muted-foreground">
              No notes yet. Create one with + at the top.
            </p>
          )
        )}
      </div>

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

      <AlertDialog
        open={!!deleteAll?.open}
        onOpenChange={(open) => setDeleteAll((d) => d && { ...d, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteAll?.count === 1 ? "Delete 1 note?" : `Delete all ${deleteAll?.count} notes?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Recently Deleted can bring them back. Shared notes are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDeleteAll((d) => d && { ...d, open: false })
                handleDeleteAll()
              }}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unsynced !== null} onOpenChange={handleUnsyncedChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unsynced === 1 ? "1 note is not synced" : `${unsynced} notes are not synced`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unsynced === 1 ? "It" : "They"} could not be saved to the server (offline, or not
              yours). Signing out deletes {unsynced === 1 ? "it" : "them"} from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void signOut(user.id)}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NoticeToast notice={notice} onClose={clearNotice} />
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
