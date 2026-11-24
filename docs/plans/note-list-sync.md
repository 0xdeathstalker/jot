# Plan: Note list never saved on the server, and false "not synced" at sign-out

Status (2026-11-24): **done.** All six tasks implemented and checked. Branch `fix/note-list-sync`
(from `main`).

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
3. **Sign-out deletes every account's data in the browser.** Found by the browser checks: the wipe
   (`wipeIfPending`, next page load) deletes every `jot-*` database, so another account's notes,
   kept since task 2, are gone as soon as anyone signs out on that browser, offline edits included,
   with no warning to their owner.

## Decisions (owner, 2026-11-23)

| Topic                            | Choice                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Another account's data on device | **Keep it, ignore it.** Not wiped when a different account signs in (that could silently lose its offline edits). Invisible in the UI, skipped at sign-out, back when that account returns |
| Lists lost since 2026-11-11      | **Auto-rebuild** from the notes the user owns on the server (D1 `note_members`), titled from each note's content                                                                           |
| What sign-out deletes            | **Only the signed-out account's own data** (its list and the notes in it). Another account's databases stay until that account comes back or signs out itself                              |

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
- [x] **6** Sign-out deletes only the signed-out account's own data. Done 2026-11-24:
      `signOut(userId)` → `requestWipe(userId)` stores the names (`local-data.ts`, which also
      gives `provider.ts` its `readLocalList`); if the list cannot be read it falls back to wiping
      everything rather than leaving this account's notes behind.
  - At sign-out (`signOut` in `use-auth-user.ts`), work out the account's databases:
    `jot-index-<userId>`, the `jot-note-*` of every note in its list (owned and shared, `noAccess`
    too, deleted too), and the Phase 3 placeholder `jot-index-default`. Store those names as the
    pending wipe in localStorage, instead of today's `"1"`.
  - `wipeIfPending` (next page load) deletes only the stored names. An old `"1"` (left pending by an
    older app version) still means wipe everything, as before.
  - Edge: a note shared between two accounts on the same browser is one database. It goes with
    whoever signs out; the other account gets it back from the server (only its unsynced offline
    edits to that one note are at risk).
  - Docs: the `project-context.md` §11 sign-out note becomes accurate with this task ("other `jot-*`
    databases are left alone"); `local-data.ts` header and the phase-4 B6 wording ("the next person
    using this browser finds nothing") change to "finds none of your notes".
  - **Once task 6 is implemented, review `docs/project-context.md` and update it where needed:**
    the §11 sign-out note (check that it matches what was built), any wording that says sign-out
    leaves the browser empty, and §12 if the decision needs a row. Done 2026-11-24: §10 phase 4
    line, §11 sign-out note rewritten to match, §12 row "What sign-out deletes" added; phase-4 B4b
    and the `local-data.ts` header say "this account's data".

## Check

- [x] `pnpm check`: lint and typecheck pass; every changed file passes the format check. The full
      format check still fails on 67 files checked out with CRLF line endings (Windows
      `core.autocrlf`; git stores them as LF, so CI is unaffected). Not from this branch.

Browser checks (2026-11-23) ran in headless Chrome over CDP against `pnpm preview:worker`, signed
in with a temporary local session (removed afterwards).

- [x] `pnpm preview:worker`: fresh device rebuilds the lost list (the server list went from empty to
      both owned notes, titled from their content); sign out, sign back in: all notes listed.
- [x] Server saves the list: a value written over a real socket reads back on a fresh connection
      (fails on `main`: "synced", value gone). Other user's list still refused. Checked with a
      temporary local session against fresh `pnpm dev` servers.
- [x] Two tabs, one offline: a new note appears in the other tab's list after reconnecting, and in
      the server list. Weak spot: the offline tab already had it before reconnecting (same-browser
      channel), so this does not prove the reconnect path on its own.
- [x] Sign-out with another account's note in IndexedDB: no "not synced" dialog.
- [x] Sign-out offline: the dialog appears; "Stay signed in" keeps the session.
- [x] Task 6 (2026-11-24, same setup): account A used the browser, its session ended without signing
      out, account B signed in, opened a note, signed out. B's list and note databases and the
      Phase 3 placeholder were deleted; all of A's databases stayed; A signed in again with all 32
      notes listed.
- [x] Task 6: an old pending wipe (`"1"`, with the cached user cleared as an old sign-out did)
      still deletes every `jot-*` database.

## Known limits

- A note deleted from a list that was then lost can come back once (the deletion was part of the
  lost list). Delete it again.
- Another account's notes stay readable in this browser's DevTools until that account signs out,
  even after someone else signs out (accepted, owner 2026-11-23: no silent data loss over a clean
  browser).
