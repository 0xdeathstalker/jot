# Plan: A note deleted on another device stays open here

Status (2026-11-29): planned, not started.
Source: owner bug report, 2026-11-29 (desktop app and web tab, each with a different note open).

## The bug

Two notes, both synced. The web tab has note 1 open, the desktop app note 2. Deleting note 2 from
the web: both note lists drop it, but the desktop app keeps showing note 2 with its content.

## Cause

- Deleting is a soft delete (`softDelete`, `sync/index-doc.ts`): the note's list entry gets
  `deleted: true`; the note's own Y.Doc is kept (Recently Deleted can bring it back). The list
  entry syncs to every device, so every list drops the note.
- Leaving the deleted note happens only on the device that deleted it: `deleteNote` in `app.tsx`
  runs `if (id === noteId) openNote(null, { replace: true })` after `softDelete`, and
  `handleDeleteAll` does the same. Other devices never run that code.
- The open note comes from the URL (`?note=<id>`, `hooks/use-note-id.ts`), and `app.tsx` renders
  `<Editor>` whenever `noteId` is set. Nothing checks that the note is still in the list.
- So the other device keeps the editor on a deleted note: the top bar says "Untitled" (no list
  entry to read the title from), Pin / Share / Delete vanish from the Action Panel, and anything
  typed there goes into a deleted note, only visible again after a restore from Recently Deleted.

Same cause, same symptom: Delete All on another device, and another tab of the same browser.
Not this bug: a shared note whose owner removes you (already the no-access screen, `noAccess`).

## Fix

When the open note's list entry becomes deleted, leave it the way the deleting device does.

- Trigger only on an entry that **exists and is marked deleted**. A note missing from the list is
  not deleted: a new draft (unlisted until its first edit, `blank-notes.md`), a note opened by
  link, or a list that has not synced yet must stay open.
- Toast only when the delete came from elsewhere: the deleting device already shows its own
  ("Note deleted", "N notes deleted"). Notes removed for being left empty (`empty: true`,
  `blank-notes.md` E4) close without a toast: nobody chose to delete them.

## Tasks

### Phase 1: read the open note's deleted state

- [ ] **1.1** `sync/index-doc.ts`: `useNoteDeleted(doc, id): "no" | "deleted" | "empty"`, read from
      the note's own entry (not from `useNotes`, which leaves deleted notes out). Same
      `useSyncExternalStore` + `observeDeep` pattern as `createStore`, snapshot a string so it
      stays stable. `"no"` when the entry is missing or not deleted, or `id` is null.

### Phase 2: leave the note in `app.tsx`

- [ ] **2.1** `const openDeleted = useNoteDeleted(doc, noteId)`. Effect: when it is not `"no"` and
      the note is not a draft, `openNote(null, { replace: true })`. The existing "open the newest
      note" effect then picks the next note, or the welcome view shows when none is left.
- [ ] **2.2** Toast "Note deleted on another device" when `openDeleted === "deleted"`, unless this
      device deleted it: `deleteNote` and `handleDeleteAll` record the ids they deleted in a ref,
      and the effect skips those (then clears them).
- [ ] **2.3** `replace: true`, as the local delete does: Back does not return to the deleted note.

### Phase 3: docs

- [ ] **3.1** `project-context.md` §11 (traps): "Deleting elsewhere only marks the list entry:
      the open note must watch its own entry".
- [ ] **3.2** Tick this plan.

## Verification

- `pnpm check` passes.
- Desktop app on note 2, web tab on note 1: delete note 2 on the web. The desktop app moves to the
  newest note (or the welcome view) and shows "Note deleted on another device".
- Same with two web tabs, and with Delete All from the other window (the toast shows once).
- Deleting on this device: one toast only ("Note deleted"), no second one.
- New note (a draft, not yet listed) stays open while the list syncs; a note opened by a link
  stays open.
- Restore the note from Recently Deleted on either device: it reopens with its content, and the
  other device can open it again from the switcher.
- Leave a note empty (E4) while another window has it open: that window moves on, no toast.
- Offline device: it moves on once it reconnects and the list syncs.
