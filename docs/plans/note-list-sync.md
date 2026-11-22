# Plan: Note list never saved on the server, and false "not synced" at sign-out

Status (2026-11-23): **code done, browser checks left.** Branch `fix/note-list-sync` (from `main`).

## What is wrong

1. **The server drops every change to the note list.** `worker/auth/gate.ts` lets the owner into
   their `IndexRoom` but, unlike a `NoteRoom`, sets no `x-jot-role` / `x-jot-user`. `NoteRoom`
   (which `IndexRoom` extends) treats a connection without a role as read-only, so every update is
   dropped and nothing is saved. The handshake still reports "synced", so sign-out wipes the only
   copy. Since `48f2d1f` (2026-11-11): local D1/DO state shows no list saved after that date.
   Effects (production too): sign out and back in shows an empty list; a new device starts empty;
   list changes do not reach other devices. Note **content** is saved and safe.
2. **Sign-out counts other people's notes as "not synced".** `syncAllLocalData` syncs every
   `jot-note-*` database in the browser. A note left by another account (its session ended without
   the sign-out button, e.g. expired; on localhost, signing out on one port ends the session on all
   ports, but only wipes that port's IndexedDB) is refused by the server and counted, so the dialog
   says "1 note is not synced" while online.

## Decisions (owner, 2026-11-23)

| Topic                            | Choice                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Another account's data on device | **Keep it, ignore it.** Not wiped when a different account signs in (that could silently lose its offline edits). Invisible in the UI, skipped at sign-out, back when that account returns |
| Lists lost since 2026-11-11      | **Auto-rebuild** from the notes the user owns on the server (D1 `note_members`), titled from each note's content                                                                           |

## Tasks

- [x] **1** Guard: the `IndexRoom` branch sets `x-jot-role: owner` and `x-jot-user`, like a note.
      One helper (`withIdentity`) for both branches, so neither can forget the headers again.
- [x] **2** Sign-out syncs only this user's notes: those in their list (not `noAccess`) that have a
      database on this device, plus the list itself.
- [x] **3** `GET /api/share/owned`: ids of the notes the signed-in user owns.
- [x] **4** After the list has synced with the server (never before: a list entry added too early
      could replace the server's, e.g. bring back a deleted note), add each owned note missing from
      it. Title and preview come from the note's content, read through a throwaway connection, one
      note at a time. Restored notes show as edited now. Blank notes (one empty paragraph, the
      editor's rule; 7 of 36 in local data, made before drafts existed) stay out.
- [x] **5** Docs: `project-context.md` §11 trap (the guard must set the role for every room class).

## Check

- [ ] `pnpm check` (lint + typecheck pass; format: CRLF working copies, see repo-layout)
- [ ] `pnpm preview:worker`: make notes, sign out, sign back in: all notes listed, titles right
- [x] Server saves the list: a value written over a real socket reads back on a fresh connection
      (fails on `main`: "synced", value gone). Other user's list still refused. Checked with a
      temporary local session against fresh `pnpm dev` servers.
- [ ] Two tabs, one offline: a new note appears in the other tab's list after reconnecting
- [ ] Sign-out with another account's note in IndexedDB: no "not synced" dialog
- [ ] Sign-out offline with an edited note: the dialog still appears (real unsynced work)

## Known limits

- A note deleted from a list that was then lost can come back once (the deletion was part of the
  lost list). Delete it again.
- Another account's notes stay readable in this browser's DevTools until that account signs out
  (accepted: privacy over silent data loss).
