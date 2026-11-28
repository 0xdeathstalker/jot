# Plan: No piles of blank "Untitled" notes

Status: done in code and checked headlessly (D1–D6); issue #2 closes with the PR. Follow-up E1–E5 (empty notes) done in code 2026-11-28; E6 browser and phone checks pending.
Source: GitHub issue [#2](https://github.com/0xdeathstalker/jot/issues/2), `docs/project-context.md` §7 (index doc), `docs/plans/phase-3-notes-list.md` (index model).

Goal: pressing **New note** never adds an empty note to the list. A new note is a **draft** that joins the list only when it gets its first real content.

## Cause

`handleNew` (`src/app.tsx`) calls `createNote(doc)` (`src/sync/index-doc.ts`), which writes a new index entry at once, before anything is typed.

## How it works (UI)

1. **New note** opens an empty editor for a fresh id (in the URL as today) but writes **nothing** to the note list.
2. The **first real edit** (a letter, a checklist, an image, a divider) adds the note to the list at that moment. From then on it is a normal note.
3. **Leaving a draft** without editing it leaves nothing behind: no list entry, and its empty local copy (IndexedDB) is removed.
4. **New note while a draft is open** creates nothing: the cursor goes back into the draft.

## Decisions

| Topic                                  | Choice                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approach                               | **Draft until first edit** (owner, 2026-11-15). Replaces the first approach (a `blank` / `leftBlank` flag in the index plus cleanup on leaving, commit `61cae47`), which is reverted: drafts never sync, so there is nothing to clean up and no two-device race                                                                                                   |
| What counts as a draft                 | **Only a note made by New note on this device and not yet in the index.** Its id is kept in state and in `sessionStorage` (so a reload keeps it a draft). A note opened from the list, a link or the URL is never a draft, even before the index has loaded from the device: writing a new index entry for it would overwrite the real one (role, shared, pinned) |
| "First real edit"                      | A local change (not from Yjs) after which the document is no longer a single empty paragraph                                                                                                                                                                                                                                                                      |
| Server                                 | The editor still connects as soon as the draft opens, so the server records you as owner of an empty room (`note_members`, Durable Object). Harmless and free; delaying the connection until the first edit is possible but not worth the code                                                                                                                    |
| Old blank notes (made before this fix) | Left alone: delete them by hand once                                                                                                                                                                                                                                                                                                                              |
| No new packages                        | Yes                                                                                                                                                                                                                                                                                                                                                               |

## Steps

### A. Revert the flag approach

- [x] **A1.** Restore `src/sync/index-doc.ts` and `docs/project-context.md` §7 to before commit `61cae47` (no `blank` / `leftBlank`, no `markEdited` / `removeIfBlank` / `findBlank`). **Done** (commit `141df5f`).
- [x] **A2.** `createNote(doc, id = crypto.randomUUID())`: accepts the draft's id. Nothing else changes in the index. **Done:** also never overwrites an existing entry (returns the id, writes nothing), so a wrong call cannot drop a pin or sharing mark. Checked headlessly: new uuid, given id, existing id untouched.

### B. Editor

- [x] **B1.** `onEdited?: () => void` prop on `Editor` (`src/editor/editor.tsx`): in the existing `update` handler, for local changes only (`!isChangeOrigin`), call it once per mounted note when the document stops being blank (`isBlankDoc`: one child, an empty paragraph). **Done** with its own `update` listener (the meta one exists only with `onMetaChange` and also follows remote edits). `onEdited` is read through a ref, so callers need not memoize it.
- [x] **B2.** `autofocus` for a draft (the cursor is in the editor right after New note), and a `focusKey` prop: when it changes, focus the editor (New note pressed again while in the draft). **Done** as one prop: `focusKey` focuses when the editor is ready and again on each change, so C passes it only for a draft (no separate `autofocus`).

### C. App (`src/app.tsx`)

- [x] **C1. Draft state.** `draftId` in `NotesApp`, mirrored to `sessionStorage` (`jot-draft`, read once on mount, wrapped in try/catch). A note is a draft when `noteId === draftId` and it is not in `notes`. **Done:** a stored draft that is not the open note on load (reloaded at another URL) is dropped and its empty local copy removed.
- [x] **C2. New note.** Open note is a draft → bump `focusKey`, close the sidebar on phones. Else make an id, set `draftId`, `openNote(id)`. No `createNote` here.
- [x] **C3. First edit.** `onEdited` for the draft → `createNote(doc, draftId)`, clear `draftId`. `handleMeta` then finds the entry (it ignores ids missing from the index, so title writes before this are skipped; the editor's next debounced meta write fills it in).
- [x] **C4. Leaving a draft.** When `noteId` moves away from the draft (another note, back button, New note is not a leave) → `deleteLocalNote(draftId)`, clear `draftId`. **Done** by comparing with the previous `noteId` (a ref), not the draft id alone, so a render where `draftId` is set before the URL changes is not taken as leaving.
- [x] **C5.** A draft shows no Share button and no list highlight (it is not in `notes`, as with any id missing from the index); check nothing breaks. **Done** in code (`ownedNote` is undefined, `activeId` matches no row); seen in the browser in D.

### D. Check and close

- [x] **D1.** Click **New note** five times: no new entries in the list; the cursor is in the editor.
- [x] **D2.** New note, type one letter: it appears in the list with its title. New note, add only an image or a checklist: it appears (as "Untitled" for the image).
- [x] **D3.** New note, open another note, press back: nothing was added; the old draft id shows an empty editor that still is not in the list (and joins it on the first edit only if it is the current draft; otherwise it is a normal empty note opened by URL, see risk below).
- [x] **D4.** Reload while in an untouched draft: still a draft (sessionStorage). Reload after typing: a normal note.
- [x] **D5.** Open an existing note from the list right after starting the app and type at once: its title, pin and sharing marks are unchanged (not treated as a draft).
- [x] **D6.** Two tabs: a draft in one never appears in the other until its first edit.
- [x] **D7.** `pnpm check`; update `docs/project-context.md` §7 (drafts) and §12 (decision); close issue #2. **Done** except closing: the PR says `Closes #2`.

**D1–D6 checked** in headless Chromium against `pnpm dev` (Playwright in a throwaway folder, not a project package), cached test user, `/api/*` and `/parties/*` blocked (offline, local only). All pass: five New note clicks add nothing and keep one draft with the cursor in it; a letter, an empty checklist or only an image each list the note (image as "Untitled"); leaving a draft adds nothing and deletes its IndexedDB copy; back to it shows an empty unlisted editor; reload keeps the draft, typing then lists it, and the next reload shows a normal note; typing at once into a pinned note after a reload keeps its pin and changes only its title; a draft never shows in a second tab, and after its first edit the second tab lists it. **Not checked:** two devices through the real server (needs a Google sign-in), and phones.

## Risk

A URL to an id that is not in the index and is not the current draft (an old draft opened from history after leaving it) shows an empty editor whose typing is not listed (`updateMeta` ignores unknown ids, as today). Rare; accept, or make C3 also list such a note on first edit once the index is known to be loaded. **Decided in D3: accepted** (seen: typing there lists nothing).

## Follow-up: empty notes still reach the list (owner, 2026-11-28)

Seen on an iPhone while testing the toolbar: several "Untitled" notes with no text. Two gaps:

1. **Formatting counts as content.** On a fresh draft, Heading, a list, Checklist, Quote or Code
   block turns the empty paragraph into another empty block. `isBlankDoc` then says "not blank",
   so the draft is listed with nothing in it. (D-checks treated an empty checklist as content on
   purpose; that is now reversed.)
2. **Nothing removes a note that becomes empty again.** Type a letter, delete it: the note stays
   listed as "Untitled".

Decision (owner, 2026-11-28): **A + B**.

- **A. Blank = no text and no image.** Formatting alone no longer lists a draft.
- **B. Leaving an emptied note removes it.** Soft delete only (never hard-delete), hidden from
  Recently Deleted, like Apple Notes dropping a note you leave empty.

### Tasks

- [x] **E1. One blank rule.** A document is blank when its text is only whitespace and it has no
      image node, whatever its blocks are (an empty checklist, heading or code block is blank).
  - `isBlankDoc` (`editor/editor.tsx`, ProseMirror node): `!doc.textContent.trim()` and no
    `image` node (`doc.descendants`).
  - `isBlankDocument` (`features/notes/note-meta.ts`, Y.Doc, used by `restore-owned.ts`): the same
    rule on the XML fragment (no non-whitespace `XmlText`, no `image` element).
  - Keep both side by side in one comment, so a change to one reaches the other.
- [x] **E2. Draft listing (A).** No code beyond E1: `onEdited` already fires on the first local
      change that leaves the doc non-blank. Formatting an empty draft no longer lists it; the
      first character or image does.
- [x] **E3. Report an emptied note on leave (B).** `Editor` gets `onLeftEmpty?: () => void`, called
      from its unmount cleanup when:
  - the doc is blank by E1, **and**
  - this mount saw at least one **local** change (`!isChangeOrigin(transaction)`).

  The second condition is the safety guard: a note opened on a device that has not synced it
  yet looks empty but was never edited here, so it is never removed. Only an edit made here
  that leaves the note empty counts.

- [x] **E4. Remove it (B).** In `app.tsx`, `onLeftEmpty` soft-deletes the note only if it is your
      own (no `role`), unshared (`shared` unset) and not a draft (drafts already clean up). It
      calls `softDelete(doc, id, { empty: true })`.
  - `sync/index-doc.ts`: `softDelete` takes `{ empty?: boolean }` and writes `empty: true` next to
    `deleted` / `deletedAt`. `NoteMeta` gains `empty?`.
  - `readDeletedNotes` skips entries with `empty`, so Recently Deleted does not fill with blanks.
  - `undelete` clears `empty` (not reachable from the UI, but keeps the flag honest).
  - No toast (phase 11's "Note deleted" is for Delete Note only).
- [x] **E5. Leaving includes:** opening another note (switcher, New note, back/forward), Delete All
      (the note is deleted anyway), and sign-out. Closing the tab or app does **not** run React
      cleanup: such a note stays listed until it is opened and left again. Accepted.
- [x] **E6. Checks** (`pnpm dev`, then a phone through `pnpm dev:tunnel`):
  - New note, tap Checklist / Heading / Quote, leave: nothing listed.
  - New note, type a letter (listed), delete it, leave: gone from the list, not in Recently Deleted.
  - Image only: listed, and kept on leave.
  - A note with text, opened offline on a second profile before it syncs, then left: still listed
    (E3 guard).
  - Two tabs: emptying and leaving in one removes it from the other's list.

Done as (2026-11-28, branch `fix/empty-notes`):

- E1: `isBlankDoc` (`editor/editor.tsx`) is `textContent.trim()` empty plus no `image` node;
  `isBlankDocument` (`note-meta.ts`) is the same on the Y.Doc (`blockText` plus a recursive
  `image` search). Checked with a throwaway Node script on real Y.Docs: nothing, an empty
  paragraph, heading, checklist or whitespace are blank; text or an image is not.
- E3: the `onEdited` effect also tracks `editedHere` (any local change) and `blank` (after every
  change, remote too), and calls `onLeftEmpty` from its cleanup. React StrictMode's extra
  mount/unmount in dev sees no edit, so it reports nothing.
- E4: `handleLeftEmpty(id)` in `app.tsx`; `softDelete(doc, id, { empty: true })`;
  `readDeletedNotes` skips `empty`; `undelete` clears it.
- E5, sign-out: not verified. Sign-out syncs and then clears this device's data, so the
  soft delete from the unmounting editor may land too late to sync. The note would then stay
  listed on other devices. Accepted (rare; it goes the next time it is emptied and left).
- Notes that were already empty before this change stay until removed by hand (Delete Note):
  they were never edited in this session.

Phase 12 of `action-panel.md` (new phone notes start with an empty H2) relies on E1: an empty H2
is blank, so 12.3 needs no extra rule.

## Out of scope

Removing blank notes made before this fix, a Trash / restore screen, delaying the server connection for drafts.
