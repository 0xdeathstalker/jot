# Plan: No piles of blank "Untitled" notes

Status: in progress (A done)
Source: GitHub issue [#2](https://github.com/0xdeathstalker/jot/issues/2), `docs/project-context.md` §7 (index doc), §11 (never hard-delete), `docs/plans/phase-3-notes-list.md` (index model).

Goal: pressing **New note** never leaves a trail of empty notes. At most one blank note exists, and a blank note you leave disappears from the list.

## Cause

`handleNew` (`src/app.tsx`) calls `createNote(doc)` (`src/sync/index-doc.ts`), which writes a new index entry at once. Nothing checks whether the open note is blank, and nothing tidies a blank note when you move away.

## How it works (UI)

1. **New note** while the open note is blank: nothing new is created; the cursor goes to that note.
2. **New note** while a blank note exists elsewhere in your list: that note opens instead of a new one.
3. You leave a blank note (open another note, or the open note changes): it disappears from the list.
4. A note counts as blank only until its first real content: typing, a checklist, an image, a divider, a heading. After that it is a normal note forever, even if you delete everything in it again (then you delete it yourself, as today).

## Decisions

Proposed defaults. Change any you disagree with before step A.

| Topic                                           | Proposal                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How "blank" is known                            | **A flag in the index: `blank: true`**, set by `createNote`, set to `false` on the first local edit that leaves content. The list can then tell a blank note from an image-only note (both have an empty title and preview) without loading each note's Y.Doc. Old clients ignore the unknown field                                                  |
| Content check when leaving                      | **Also check the note itself** before removing it: only a document that is a single empty paragraph counts. Belt and braces: the flag says "never edited", the document says "still empty right now" (e.g. content arrived from another device)                                                                                                      |
| Removing                                        | **Hidden, not deleted: `leftBlank: true`** (nothing is ever hard-deleted, CLAUDE.md), plus `deleteLocalNote` for its IndexedDB copy. The list hides a note that is `leftBlank` and still `blank`. The empty Durable Object on the server stays; it costs nothing                                                                                     |
| Shared notes                                    | **Never removed automatically.** Notes with `role` or `shared` are skipped: another person may be about to type                                                                                                                                                                                                                                      |
| Coming back                                     | If a blank note is left on one device while you make its first edit on another, the edit writes `blank: false`, a **different key** from `leftBlank`, so both survive the merge and the note shows on both. (First version wrote `deleted` from both sides; the headless check showed Yjs settles that by client id, so the note could stay hidden.) |
| Startup cleanup                                 | **None.** Removing blank notes at startup could remove one you are typing into on another device. Blank notes are only removed by the device that leaves them                                                                                                                                                                                        |
| Old blank notes (made before this fix, no flag) | **Left alone.** Without the flag they cannot be told apart from image-only notes without loading each one. Delete them by hand once. (Option: a one-off "Remove empty notes" action later)                                                                                                                                                           |
| No new packages                                 | Yes                                                                                                                                                                                                                                                                                                                                                  |

## Steps

### A. Index flag

- [x] **A1.** `NoteMeta.blank?: boolean` in `src/sync/index-doc.ts`; `createNote` sets `blank: true`; `readNotes` reads it. Document the field in `docs/project-context.md` §7. **Done.** Also `leftBlank?: boolean` (see Decisions); `readNotes` hides `deleted` notes and `leftBlank` notes that are still `blank`. §7 updated.
- [x] **A2.** `markEdited(doc, id)`: if the entry has `blank: true`, set `blank: false` and `deleted: false` in one transaction; otherwise write nothing (no sync traffic after the first edit). **Done, changed:** sets only `blank: false` (one write, then never again); a note left blank elsewhere shows again because of the hiding rule, not by touching `deleted`.
- [x] **A3.** `removeIfBlank(doc, id): boolean`: soft-deletes the entry only if `blank === true`, not `deleted`, no `role`, no `shared`. Returns whether it did. **Done, changed:** sets `leftBlank: true` instead of `deleted: true`.
- [x] **A4.** `findBlank(notes): Note | undefined`: an owned, not shared, not deleted note with `blank` (newest first). **Done.**
- [x] **A5.** Headless check with a plain `Y.Doc` (as in phase 6): create → `findBlank` finds it; `markEdited` clears it once and writes nothing the second time; `removeIfBlank` removes a blank owned note but not an edited, shared or someone else's one; `markEdited` on a removed blank note brings it back. **Done:** 17 checks pass, including the two-device race in both orders (left on A, first edit on B: visible on both) and leaving a note already edited on another device (kept).

### B. Editor reports the first real edit

- [ ] **B1.** `onEdited?: () => void` prop on `Editor` (`src/editor/editor.tsx`). In the existing `update` handler, for local changes only (not `isChangeOrigin`), call it when the document is no longer blank. Blank = one child, a paragraph with no content (`isBlankDoc(doc)` helper, also used in C2). Called at most once per mounted note.
- [ ] **B2.** `NotesApp` passes `onEdited={() => markEdited(doc, noteId)}` (stable per note, like `handleMeta`).
- [ ] **B3.** `Editor` exposes whether its document is blank right now (`isBlank()` via a ref, or an `onBlankChange` callback). Used by C1 and C2.

### C. New note and leaving

- [ ] **C1. New note** (`handleNew` in `src/app.tsx`): open note is blank (index flag and B3) → focus the editor, close the sidebar on phones, create nothing. Else `findBlank(notes)` → open it. Else `createNote`.
- [ ] **C2. Leaving.** Effect on `noteId` in `NotesApp`: when it changes away from note X, and the editor reported X blank at that moment, call `removeIfBlank(doc, X)` and, if it removed it, `deleteLocalNote(X)`. Also on the note being closed from the URL (`openNote(null)`).
- [ ] **C3.** The "open the newest note" effect must not reopen the note just removed (it reads the list after the soft delete, so it should not; confirm).

### D. Check and close

- [ ] **D1.** Click **New note** five times: one blank note in the list.
- [ ] **D2.** New note, then open another note: the blank one is gone. New note, type a letter, open another: it stays.
- [ ] **D3.** A note with only an image, only an empty checklist item, only a divider, or only an empty heading: kept when you leave it.
- [ ] **D4.** Two tabs, one offline: each creates a blank note, leaves it, reconnects: no leftover blank notes; a blank note being typed into in tab A while tab B leaves it stays (or comes back) in both lists.
- [ ] **D5.** Shared notes (owner and editor): never removed when left blank.
- [ ] **D6.** `pnpm check`. Update `docs/project-context.md` §7 (field) and §12 (decision), close issue #2.

## Out of scope

A Trash / restore screen, removing old blank notes made before this fix (see Decisions), auto-titles like "Untitled 2", a server-side check.
